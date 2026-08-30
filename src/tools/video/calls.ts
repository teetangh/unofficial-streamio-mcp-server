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
import { defineTool, type ToolDef } from "../define.js";

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

const deleteCall = defineTool({
  name: "video_delete_call",
  title: "Delete call",
  toolset: "video",
  description:
    "Delete a call. Soft delete by default. `hard: true` permanently removes the call and its recordings and frees the id.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    hard: z.boolean().optional().describe("Permanently delete. Irreversible. Default: false."),
  },
  handler: async (args, client) =>
    client.video.deleteCall({
      type: args.call_type,
      id: args.call_id,
      ...defined({ hard: args.hard }),
    }),
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
  compact: (raw: { calls?: any[]; next?: string; prev?: string }) => ({
    calls: (raw.calls ?? []).map((entry) => ({
      ...(omit(entry.call, ["settings", "ingress", "egress", "thumbnails"]) as object),
      member_count: entry.members?.length,
      members: entry.members?.slice(0, 10).map((member: any) => ({
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

const goLive = defineTool({
  name: "video_go_live",
  title: "Go live",
  toolset: "video",
  description:
    "Take a call out of backstage and make it live for viewers. Can start recording, HLS broadcasting, transcription and closed captions in the same call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    start_hls: z.boolean().optional().describe("Also start HLS broadcasting"),
    start_recording: z.boolean().optional().describe("Also start recording"),
    start_transcription: z.boolean().optional().describe("Also start transcription"),
    start_closed_caption: z.boolean().optional().describe("Also start closed captions"),
    recording_storage_name: z.string().optional().describe("External storage name for recordings"),
    transcription_storage_name: z
      .string()
      .optional()
      .describe("External storage name for transcriptions"),
  },
  handler: async (args, client) =>
    client.video.goLive({
      type: args.call_type,
      id: args.call_id,
      ...defined({
        start_hls: args.start_hls,
        start_recording: args.start_recording,
        start_transcription: args.start_transcription,
        start_closed_caption: args.start_closed_caption,
        recording_storage_name: args.recording_storage_name,
        transcription_storage_name: args.transcription_storage_name,
      }),
    }),
});

const stopLive = defineTool({
  name: "video_stop_live",
  title: "Stop live",
  toolset: "video",
  description:
    "Put a live call back into backstage. By default this also stops recording, HLS, transcription and RTMP broadcasts — pass the matching `continue_*` flag to keep one running.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    continue_hls: z.boolean().optional().describe("Keep HLS broadcasting running"),
    continue_recording: z.boolean().optional().describe("Keep recording running"),
    continue_transcription: z.boolean().optional().describe("Keep transcription running"),
    continue_rtmp_broadcasts: z.boolean().optional().describe("Keep RTMP broadcasts running"),
    continue_closed_caption: z.boolean().optional().describe("Keep closed captions running"),
  },
  handler: async (args, client) =>
    client.video.stopLive({
      type: args.call_type,
      id: args.call_id,
      ...defined({
        continue_hls: args.continue_hls,
        continue_recording: args.continue_recording,
        continue_transcription: args.continue_transcription,
        continue_rtmp_broadcasts: args.continue_rtmp_broadcasts,
        continue_closed_caption: args.continue_closed_caption,
      }),
    }),
});

const ringCall = defineTool({
  name: "video_ring_call",
  title: "Ring call members",
  toolset: "video",
  description:
    "Send an incoming-call ring to the call's members, triggering their ringing UI and push notifications.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    member_ids: z
      .array(z.string().min(1))
      .optional()
      .describe("Restrict the ring to these member IDs. Omit to ring all members."),
    video: z.boolean().optional().describe("Ring as a video call rather than audio-only"),
  },
  handler: async (args, client) =>
    client.video.ringCall({
      type: args.call_type,
      id: args.call_id,
      ...defined({ members_ids: args.member_ids, video: args.video }),
    }),
});

const sendCallEvent = defineTool({
  name: "video_send_call_event",
  title: "Send custom call event",
  toolset: "video",
  description:
    "Broadcast a custom real-time event to everyone in a call, e.g. {custom: {'render-animation': 'balloons'}}.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    user_id: z.string().optional().describe("User the event is attributed to"),
    custom: z.record(z.string(), z.unknown()).describe("Event payload"),
  },
  handler: async (args, client) =>
    client.video.sendCallEvent({
      type: args.call_type,
      id: args.call_id,
      custom: args.custom,
      ...defined({ user_id: args.user_id }),
    }),
});

const getCallReport = defineTool({
  name: "video_get_call_report",
  title: "Get call report",
  toolset: "video-admin",
  description:
    "Get quality and participation statistics for a finished call session — participants, duration, latency and jitter.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    session_id: z.string().optional().describe("Specific session ID. Omit for the latest session."),
  },
  handler: async (args, client) =>
    client.video.getCallReport(
      defined({ type: args.call_type, id: args.call_id, session_id: args.session_id })
    ),
});

const queryCallStats = defineTool({
  name: "video_query_call_stats",
  title: "Query call stats",
  toolset: "video-admin",
  description:
    "Query aggregated call quality statistics across calls. Filter by {call_cid: {$eq: 'default:my-call'}} or a time range.",
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
  handler: async (args, client) =>
    client.video.queryCallStats(
      defined({
        filter_conditions: args.filter_conditions,
        sort: args.sort,
        limit: args.limit ?? 10,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const getEdges = defineTool({
  name: "video_get_edges",
  title: "List edge servers",
  toolset: "video-admin",
  description: "List Stream's video edge servers and their current latency and health.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {},
  handler: async (_args, client) => client.video.getEdges(),
});

export const callTools: ToolDef<any>[] = [
  createCall,
  getCall,
  updateCall,
  endCall,
  deleteCall,
  queryCalls,
  goLive,
  stopLive,
  ringCall,
  sendCallEvent,
  getCallReport,
  queryCallStats,
  getEdges,
];
