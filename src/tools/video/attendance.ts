import type {
  QueryCallParticipantSessionsResponse,
  QueryCallRingAttemptsResponse,
} from "@stream-io/node-sdk";
import { z } from "zod";
import {
  callRef,
  defined,
  filterConditions,
  limit,
  nextCursor,
  prevCursor,
} from "../../schemas/common.js";
import { bounded, pick } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const isoDateTime = z.iso.datetime({ offset: true });

/**
 * Seen live: a call that was created and rung has a session but no attendance
 * — Stream only records it once a participant connects media. The call-report
 * hint ("does not exist means the call never had a session") would mislead.
 */
const ATTENDANCE_NOT_FOUND =
  "Not found. Attendance and participant metrics are recorded only once participants connect audio/video — a call that was created or rung but never joined has a session ID and no attendance. Check video_get_call (session.participants) or video_query_call_ring_attempts to see whether anyone joined.";

const PARTICIPANT_SESSION_KEYS = [
  "user_id",
  "user_session_id",
  "publisher_type",
  "roles",
  "joined_at",
  "left_at",
  "duration_in_seconds",
] as const;

const RING_ATTEMPT_KEYS = [
  "ring_id",
  "session_id",
  "initiated_by",
  "outcome",
  "created_at",
  "expires_at",
  "settled_at",
  "settled_by",
  "settle_reason",
  "targets",
] as const;

const queryCallParticipantSessions = defineTool({
  name: "video_query_call_participant_sessions",
  title: "Query call participant sessions",
  toolset: "video",
  description:
    "Attendance for one call session: who joined, when they joined and left, how long they stayed and whether they published, plus session totals. Data exists only once participants have connected media; a call nobody joined returns not found.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  notFoundHint: ATTENDANCE_NOT_FOUND,
  compact: (raw: QueryCallParticipantSessionsResponse) => ({
    ...pick(raw, [
      "call_type",
      "call_id",
      "call_session_id",
      "total_participant_sessions",
      "total_participant_duration",
    ]),
    participants_sessions: (raw.participants_sessions ?? []).map((row) =>
      pick(row, PARTICIPANT_SESSION_KEYS)
    ),
    next: raw.next,
    prev: raw.prev,
  }),
  inputSchema: {
    ...callRef,
    session: z
      .string()
      .min(1)
      .describe("Call session ID (current_session_id or session.id from video_get_call)"),
    filter_conditions: filterConditions,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.video.queryCallParticipantSessions(
      defined({
        type: args.call_type,
        id: args.call_id,
        session: args.session,
        filter_conditions: args.filter_conditions,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const getParticipantSessionMetrics = defineTool({
  name: "video_get_participant_session_metrics",
  title: "Get participant session metrics",
  toolset: "video",
  description:
    "Connection and media metrics for one participant's session in a call: client details, publisher/subscriber role and per-track publish metrics. Find the user_session_id with video_query_call_participant_sessions. Returns not found until the participant has published stats.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  notFoundHint: ATTENDANCE_NOT_FOUND,
  compact: bounded,
  inputSchema: {
    ...callRef,
    session: z.string().min(1).describe("Call session ID"),
    user: z.string().min(1).describe("User ID of the participant"),
    user_session: z.string().min(1).describe("The participant's user_session_id"),
    since: isoDateTime.optional().describe("Only include metrics from this time (ISO 8601)"),
    until: isoDateTime.optional().describe("Only include metrics up to this time (ISO 8601)"),
  },
  handler: async (args, client) =>
    client.video.getCallParticipantSessionMetrics(
      defined({
        type: args.call_type,
        id: args.call_id,
        session: args.session,
        user: args.user,
        user_session: args.user_session,
        since: args.since === undefined ? undefined : new Date(args.since),
        until: args.until === undefined ? undefined : new Date(args.until),
      })
    ),
});

const queryCallRingAttempts = defineTool({
  name: "video_query_call_ring_attempts",
  title: "Query call ring attempts",
  toolset: "video",
  description:
    "Ringing diagnostics for a call, newest first: who rang whom, the attempt's outcome and how it settled, and each target's state and push/websocket deliveries. Use it to answer \"why didn't their phone ring\".",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: QueryCallRingAttemptsResponse) => ({
    ...pick(raw, ["call_type", "call_id", "call_session_id", "count"]),
    ring_attempts: (raw.ring_attempts ?? []).map((attempt) => pick(attempt, RING_ATTEMPT_KEYS)),
  }),
  inputSchema: {
    ...callRef,
    call_session_id: z
      .string()
      .min(1)
      .optional()
      .describe("Limit to one call session. Omit to read every session of the call."),
  },
  handler: async (args, client) =>
    client.video.queryCallRingAttempts(
      defined({
        type: args.call_type,
        id: args.call_id,
        call_session_id: args.call_session_id,
      })
    ),
});

const getDailyDigest = defineTool({
  name: "video_get_daily_digest",
  title: "Get video daily digest",
  toolset: "video",
  description:
    'The app\'s video daily digest: per-call-session participant counts and broadcast rollups for one UTC day. Defaults to the previous UTC day. A day not yet processed comes back with status "pending" and retry_after (seconds) instead of data.',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format")
      .optional()
      .describe("UTC day as YYYY-MM-DD (default: the previous UTC day)"),
  },
  handler: async (args, client) => client.video.getDailyDigest(defined({ date: args.date })),
});

export const attendanceTools: AnyToolDef[] = [
  queryCallParticipantSessions,
  getParticipantSessionMetrics,
  queryCallRingAttempts,
  getDailyDigest,
];
