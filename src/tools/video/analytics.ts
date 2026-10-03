import { z } from "zod";
import {
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
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const isoDateTime = z.iso.datetime({ offset: true });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format");

const AGGREGATE_REPORT_TYPES = [
  "call_quality",
  "user_feedback",
  "sdk_usage",
  "network_metrics",
  "call_duration",
  "call_participant_count",
  "calls_per_day",
] as const;

const getActiveCallsStatus = defineTool({
  name: "video_get_active_calls_status",
  title: "Get active calls status",
  toolset: "video",
  description:
    "Get a real-time summary of currently active calls and participant counts across the application.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {},
  handler: async (_args, client) => client.video.getActiveCallsStatus(),
});

const queryAggregateCallStats = defineTool({
  name: "video_query_aggregate_call_stats",
  title: "Query aggregate call stats",
  toolset: "video",
  description:
    "Query application-wide aggregated call statistics and quality reports over a YYYY-MM-DD date range.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    from: dateOnly.optional().describe("Start date of the reporting window in YYYY-MM-DD format"),
    to: dateOnly.optional().describe("End date of the reporting window in YYYY-MM-DD format"),
    report_types: z
      .array(z.enum(AGGREGATE_REPORT_TYPES))
      .min(1)
      .optional()
      .describe(
        "Specific aggregate report types to include (defaults to all available report types when omitted)"
      ),
  },
  handler: async (args, client) =>
    client.video.queryAggregateCallStats(
      defined({
        from: args.from,
        to: args.to,
        report_types: args.report_types ?? [...AGGREGATE_REPORT_TYPES],
      })
    ),
});

const queryCallSessionStats = defineTool({
  name: "video_query_call_session_stats",
  title: "Query call session stats",
  toolset: "video",
  description:
    "Query per-session call statistics and quality metrics with optional filtering, sorting and pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.video.queryCallSessionStats(
      defined({
        filter_conditions: args.filter_conditions,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const queryCallParticipantStats = defineTool({
  name: "video_query_call_participant_stats",
  title: "Query call participant stats",
  toolset: "video",
  description:
    "Query per-participant quality and connection statistics for a specific call session.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    ...callRef,
    session: z.string().min(1).describe("Call session ID"),
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.video.queryCallSessionParticipantStats(
      defined({
        call_type: args.call_type,
        call_id: args.call_id,
        session: args.session,
        filter_conditions: args.filter_conditions,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const getParticipantStatsTimeline = defineTool({
  name: "video_get_participant_stats_timeline",
  title: "Get participant stats timeline",
  toolset: "video",
  description:
    "Get the chronological timeline of events and quality metrics for a participant in a call session.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    ...callRef,
    session: z.string().min(1).describe("Call session ID"),
    user: z.string().min(1).describe("User ID of the participant"),
    user_session: z.string().min(1).describe("Participant's user session ID"),
    start_time: isoDateTime
      .optional()
      .describe("ISO-8601 start timestamp to filter timeline events"),
    end_time: isoDateTime.optional().describe("ISO-8601 end timestamp to filter timeline events"),
    severity: z
      .array(z.string().min(1))
      .optional()
      .describe("Filter timeline events by severity levels, e.g. ['warning', 'error']"),
  },
  handler: async (args, client) =>
    client.video.getCallSessionParticipantStatsTimeline(
      defined({
        call_type: args.call_type,
        call_id: args.call_id,
        session: args.session,
        user: args.user,
        user_session: args.user_session,
        start_time: args.start_time,
        end_time: args.end_time,
        severity: args.severity,
      })
    ),
});

const queryUserFeedback = defineTool({
  name: "video_query_user_feedback",
  title: "Query call user feedback",
  toolset: "video",
  description:
    "Query user ratings and feedback submitted for calls, with optional filtering, sorting and pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
    full: z
      .boolean()
      .optional()
      .describe("Include full call and session details with each feedback entry"),
  },
  handler: async (args, client) =>
    client.video.queryUserFeedback(
      defined({
        filter_conditions: args.filter_conditions,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
        full: args.full,
      })
    ),
});

const startFrameRecording = defineTool({
  name: "video_start_frame_recording",
  title: "Start frame recording",
  toolset: "video",
  description:
    "Start capturing periodic video frames from an active call for moderation or analysis.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    recording_external_storage: z
      .string()
      .optional()
      .describe("Name of a configured external storage target for recorded frames"),
  },
  handler: async (args, client) =>
    client.video
      .call(args.call_type, args.call_id)
      .startFrameRecording(
        defined({ recording_external_storage: args.recording_external_storage })
      ),
});

const stopFrameRecording = defineTool({
  name: "video_stop_frame_recording",
  title: "Stop frame recording",
  toolset: "video",
  description: "Stop an in-progress periodic video frame recording on a call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
  },
  handler: async (args, client) =>
    client.video.call(args.call_type, args.call_id).stopFrameRecording(),
});

const sendClosedCaption = defineTool({
  name: "video_send_closed_caption",
  title: "Send closed caption",
  toolset: "video",
  description: "Send a live closed caption segment to an active call on behalf of a speaker.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    text: z.string().min(1).describe("Closed caption text"),
    speaker_id: z.string().min(1).describe("Identifier of the speaker"),
    user_id: z.string().min(1).describe("User ID attributed to the caption"),
    language: z.string().optional().describe("Language code of the caption text"),
    translated: z
      .boolean()
      .optional()
      .describe("Whether the caption text is a translation of the original speech"),
  },
  handler: async (args, client) =>
    client.video.call(args.call_type, args.call_id).sendClosedCaption(
      defined({
        text: args.text,
        speaker_id: args.speaker_id,
        user_id: args.user_id,
        language: args.language,
        translated: args.translated,
      })
    ),
});

const listSipTrunks = defineTool({
  name: "video_list_sip_trunks",
  title: "List SIP trunks",
  toolset: "video-admin",
  description: "List all inbound SIP trunks configured for the application.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {},
  handler: async (_args, client) => client.video.listSIPTrunks(),
});

const createSipTrunk = defineTool({
  name: "video_create_sip_trunk",
  title: "Create SIP trunk",
  toolset: "video-admin",
  description:
    "Create an inbound SIP trunk with associated phone numbers and optional IP allowlist.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Name of the SIP trunk"),
    numbers: z
      .array(z.string().min(1))
      .min(1)
      .describe("Phone numbers associated with this SIP trunk"),
    allowed_ips: z
      .array(z.string().min(1))
      .optional()
      .describe("Allowed IPv4/IPv6 addresses or CIDR blocks"),
    password: z.string().optional().describe("Password for SIP trunk authentication"),
  },
  handler: async (args, client) =>
    client.video.createSIPTrunk(
      defined({
        name: args.name,
        numbers: args.numbers,
        allowed_ips: args.allowed_ips,
        password: args.password,
      })
    ),
});

const updateSipTrunk = defineTool({
  name: "video_update_sip_trunk",
  title: "Update SIP trunk",
  toolset: "video-admin",
  description:
    "Replace an existing inbound SIP trunk's name, phone numbers, allowed IPs or password.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("SIP trunk ID to update"),
    name: z.string().min(1).describe("Updated name of the SIP trunk"),
    numbers: z
      .array(z.string().min(1))
      .min(1)
      .describe("Updated phone numbers associated with this SIP trunk"),
    allowed_ips: z
      .array(z.string().min(1))
      .optional()
      .describe("Updated allowed IPv4/IPv6 addresses or CIDR blocks"),
    password: z.string().optional().describe("Updated password for SIP trunk authentication"),
  },
  handler: async (args, client) =>
    client.video.updateSIPTrunk(
      defined({
        id: args.id,
        name: args.name,
        numbers: args.numbers,
        allowed_ips: args.allowed_ips,
        password: args.password,
      })
    ),
});

const deleteSipTrunk = defineTool({
  name: "video_delete_sip_trunk",
  title: "Delete SIP trunk",
  toolset: "video-admin",
  description: "Permanently delete an inbound SIP trunk by its unique ID.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("SIP trunk ID to delete"),
  },
  handler: async (args, client) => client.video.deleteSIPTrunk({ id: args.id }),
});

const listSipRoutingRules = defineTool({
  name: "video_list_sip_routing_rules",
  title: "List SIP routing rules",
  toolset: "video-admin",
  description: "List all inbound SIP routing rules that map incoming calls to Stream video calls.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {},
  handler: async (_args, client) => client.video.listSIPInboundRoutingRule(),
});

const createSipRoutingRule = defineTool({
  name: "video_create_sip_routing_rule",
  title: "Create SIP routing rule",
  toolset: "video-admin",
  description:
    "Create an inbound SIP routing rule that routes calls from SIP trunks to Stream video calls via direct or PIN routing. Requires at least one of direct_routing_configs or pin_routing_configs.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Name of the SIP inbound routing rule"),
    trunk_ids: z
      .array(z.string().min(1))
      .min(1)
      .describe("SIP trunk IDs this routing rule applies to"),
    called_numbers: z
      .array(z.string().min(1))
      .optional()
      .describe("Dialed phone numbers matched by this rule"),
    caller_numbers: z
      .array(z.string().min(1))
      .optional()
      .describe("Caller phone numbers matched by this rule"),
    caller_configs: z
      .looseObject({
        id: z
          .string()
          .min(1)
          .describe("Caller user ID or Handlebars template, e.g. '{{sip.from.user}}'"),
        custom_data: customData.describe(
          "Custom data associated with the caller (values may use Handlebars templates)"
        ),
      })
      .describe("Caller user creation and mapping configuration for routed SIP calls"),
    call_configs: z
      .looseObject({
        custom_data: customData.describe("Custom data attached to the routed Stream call"),
      })
      .optional()
      .describe("Optional custom data configuration for the routed Stream call"),
    direct_routing_configs: z
      .looseObject({
        call_type: z.string().min(1).describe("Target Stream call type, e.g. 'default'"),
        call_id: z
          .string()
          .min(1)
          .describe("Target Stream call ID or Handlebars template, e.g. 'sip-{{sip.to.user}}'"),
      })
      .optional()
      .describe("Direct routing configuration mapping inbound SIP calls to a target call"),
    pin_routing_configs: z
      .looseObject({
        custom_webhook_url: z
          .string()
          .optional()
          .describe("Optional webhook URL for custom PIN verification"),
        pin_prompt: z.string().optional().describe("Voice prompt played when requesting a PIN"),
        pin_success_prompt: z
          .string()
          .optional()
          .describe("Voice prompt played when PIN entry succeeds"),
        pin_failed_attempt_prompt: z
          .string()
          .optional()
          .describe("Voice prompt played when a PIN attempt fails"),
        pin_hangup_prompt: z
          .string()
          .optional()
          .describe("Voice prompt played before hanging up after failed PIN attempts"),
      })
      .optional()
      .describe("PIN-based routing configuration for inbound SIP calls"),
    pin_protection_configs: z
      .looseObject({
        enabled: z.boolean().optional().describe("Whether PIN protection is enabled"),
        default_pin: z
          .string()
          .optional()
          .describe("Default PIN when none is set on the target call"),
        max_attempts: z.int().min(1).optional().describe("Maximum PIN entry attempts allowed"),
        required_pin_digits: z
          .int()
          .min(1)
          .optional()
          .describe("Number of digits required for the PIN"),
      })
      .optional()
      .describe("PIN protection settings for inbound SIP calls"),
  },
  handler: async (args, client) => {
    if (args.direct_routing_configs === undefined && args.pin_routing_configs === undefined) {
      throw new ToolInputError(
        "Pass `direct_routing_configs` or `pin_routing_configs` to specify how inbound SIP calls are routed."
      );
    }
    return client.video.createSIPInboundRoutingRule(
      defined({
        name: args.name,
        trunk_ids: args.trunk_ids,
        called_numbers: args.called_numbers,
        caller_numbers: args.caller_numbers,
        caller_configs: defined(args.caller_configs),
        call_configs: args.call_configs ? defined(args.call_configs) : undefined,
        direct_routing_configs: args.direct_routing_configs,
        pin_routing_configs: args.pin_routing_configs
          ? defined(args.pin_routing_configs)
          : undefined,
        pin_protection_configs: args.pin_protection_configs
          ? defined(args.pin_protection_configs)
          : undefined,
      })
    );
  },
});

const deleteSipRoutingRule = defineTool({
  name: "video_delete_sip_routing_rule",
  title: "Delete SIP routing rule",
  toolset: "video-admin",
  description: "Permanently delete an inbound SIP routing rule by its unique ID.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("SIP routing rule ID to delete"),
  },
  handler: async (args, client) => client.video.deleteSIPInboundRoutingRule({ id: args.id }),
});

export const videoAnalyticsAndSipTools: AnyToolDef[] = [
  getActiveCallsStatus,
  queryAggregateCallStats,
  queryCallSessionStats,
  queryCallParticipantStats,
  getParticipantStatsTimeline,
  queryUserFeedback,
  startFrameRecording,
  stopFrameRecording,
  sendClosedCaption,
  listSipTrunks,
  createSipTrunk,
  updateSipTrunk,
  deleteSipTrunk,
  listSipRoutingRules,
  createSipRoutingRule,
  deleteSipRoutingRule,
];
