import type { QueryCallsResponse } from "@stream-io/node-sdk";
import { z } from "zod";
import {
  callMember,
  callRef,
  customData,
  defined,
  filterConditions,
  limit,
  nextCursor,
  prevCursor,
  sortParams,
} from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { omit } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const settingsOverride = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Call settings to override, e.g. {recording: {mode: 'available', quality: '1080p'}, audio: {mic_default_on: true}, backstage: {enabled: true}, screensharing: {enabled: false}}"
  );

const createCall = defineTool({
  name: "video_create_call",
  title: "Create or get call",
  toolset: "video",
  description:
    "Create a video/audio call, or return it if it already exists. Built-in types: 'default' (group call), 'livestream' (broadcast), 'audio_room', 'development'. Users still need a token to join — mint one with auth_create_call_token.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    created_by_id: z.string().min(1).describe("User ID of the call creator"),
    members: z
      .array(z.union([z.string(), callMember]))
      .max(100)
      .optional()
      .describe("Initial members — user IDs or {user_id, role} objects"),
    starts_at: z
      .string()
      .optional()
      .describe("ISO-8601 scheduled start time, e.g. '2026-09-01T15:00:00Z'"),
    team: z.string().optional().describe("Team the call belongs to (multi-tenant apps)"),
    custom: customData,
    settings_override: settingsOverride,
    ring: z
      .boolean()
      .optional()
      .describe("Ring the members (triggers incoming-call notifications)"),
    notify: z.boolean().optional().describe("Send a notification to the members without ringing"),
  },
  handler: async (args, client) => {
    const members = args.members?.map((entry) =>
      typeof entry === "string" ? { user_id: entry } : defined({ ...entry })
    );
    return client.video.call(args.call_type, args.call_id).getOrCreate(
      defined({
        ring: args.ring,
        notify: args.notify,
        data: defined({
          created_by_id: args.created_by_id,
          team: args.team,
          starts_at: args.starts_at ? new Date(args.starts_at) : undefined,
          members,
          custom: args.custom,
          settings_override: args.settings_override,
        }),
      })
    );
  },
});

const getCall = defineTool({
  name: "video_get_call",
  title: "Get call",
  toolset: "video",
  description:
    "Get a call's current state: settings, members, session, ingress (RTMP/SRT) addresses and egress (HLS) URLs.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    members_limit: limit(100, 25),
  },
  handler: async (args, client) =>
    client.video.getCall(
      defined({
        type: args.call_type,
        id: args.call_id,
        members_limit: args.members_limit ?? 25,
      })
    ),
});

const updateCall = defineTool({
  name: "video_update_call",
  title: "Update call",
  toolset: "video",
  description:
    "Update a call's settings, custom data or scheduled start time. Settings are merged, so only the keys you pass change.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    settings_override: settingsOverride,
    custom: customData,
    starts_at: z.string().optional().describe("ISO-8601 scheduled start time"),
  },
  handler: async (args, client) => {
    if (
      args.settings_override === undefined &&
      args.custom === undefined &&
      args.starts_at === undefined
    ) {
      throw new ToolInputError(
        "Nothing to update — pass at least one of settings_override, custom or starts_at."
      );
    }
    return client.video.updateCall({
      type: args.call_type,
      id: args.call_id,
      ...defined({
        settings_override: args.settings_override,
        custom: args.custom,
        starts_at: args.starts_at ? new Date(args.starts_at) : undefined,
      }),
    });
  },
});

const endCall = defineTool({
  name: "video_end_call",
  title: "End call",
  toolset: "video",
  description:
    "End an active call and disconnect every participant. The call object remains and can be rejoined unless deleted.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef },
  handler: async (args, client) => client.video.endCall({ type: args.call_type, id: args.call_id }),
});

const queryCalls = defineTool({
  name: "video_query_calls",
  title: "Query calls",
  toolset: "video",
  description:
    "Search and filter calls. Common filters: {ongoing: {$eq: true}} for live calls, {backstage: {$eq: false}}, {created_by_user_id: {$eq: 'alice'}}, {starts_at: {$gt: '2026-09-01T00:00:00Z'}} for upcoming. Page with the returned `next` cursor.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(25, 10),
    next: nextCursor,
    prev: prevCursor,
  },
  // A raw page is mostly per-call `settings` blobs — ~12KB per call.
  compact: (raw: QueryCallsResponse) => ({
    calls: (raw.calls ?? []).map((entry) => ({
      ...(omit(entry.call, ["settings", "ingress", "egress", "thumbnails"]) as object),
      member_count: entry.members?.length,
      members: entry.members?.slice(0, 10).map((member) => ({
        user_id: member.user_id,
        role: member.role,
      })),
    })),
    next: raw.next,
    prev: raw.prev,
    _hint: "Use video_get_call for one call's settings, ingress and egress.",
  }),
  handler: async (args, client) =>
    client.video.queryCalls(
      defined({
        filter_conditions: args.filter_conditions ?? {},
        sort: args.sort,
        limit: args.limit ?? 10,
        next: args.next,
        prev: args.prev,
      })
    ),
});

export const callTools: AnyToolDef[] = [createCall, getCall, updateCall, endCall, queryCalls];
