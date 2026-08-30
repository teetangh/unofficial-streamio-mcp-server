import type { QueryCallParticipantsResponse } from "@stream-io/node-sdk";
import { z } from "zod";
import {
  callMember,
  callRef,
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

const updateCallMembers = defineTool({
  name: "video_update_call_members",
  title: "Update call members",
  toolset: "video",
  description:
    "Add, update the role of, or remove members on a call. Adding a member does not admit them — they still need a token.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    update_members: z
      .array(z.union([z.string(), callMember]))
      .max(100)
      .optional()
      .describe("Members to add or update — user IDs or {user_id, role} objects"),
    remove_members: z.array(z.string().min(1)).max(100).optional().describe("User IDs to remove"),
  },
  handler: async (args, client) => {
    const hasUpdates = (args.update_members?.length ?? 0) > 0;
    const hasRemovals = (args.remove_members?.length ?? 0) > 0;
    if (!hasUpdates && !hasRemovals) {
      throw new ToolInputError(
        "Nothing to do — pass a non-empty `update_members` or `remove_members`."
      );
    }
    const update = args.update_members?.map((entry) =>
      typeof entry === "string" ? { user_id: entry } : defined({ ...entry })
    );
    return client.video.updateCallMembers({
      type: args.call_type,
      id: args.call_id,
      ...defined({ update_members: update, remove_members: args.remove_members }),
    });
  },
});

const queryCallMembers = defineTool({
  name: "video_query_call_members",
  title: "Query call members",
  toolset: "video",
  description:
    "Search and filter the members of a call. Common filters: {role: {$eq: 'host'}}, {user_id: {$in: ['alice','bob']}}.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  compact: bounded,
  handler: async (args, client) =>
    client.video.queryCallMembers(
      defined({
        type: args.call_type,
        id: args.call_id,
        filter_conditions: args.filter_conditions,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const blockUser = defineTool({
  name: "video_block_user",
  title: "Block user from call",
  toolset: "video",
  description:
    "Block a user from a call. They are removed if currently connected and cannot rejoin until unblocked.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef, user_id: z.string().min(1).describe("User ID to block") },
  handler: async (args, client) =>
    client.video.blockUser({ type: args.call_type, id: args.call_id, user_id: args.user_id }),
});

const unblockUser = defineTool({
  name: "video_unblock_user",
  title: "Unblock user from call",
  toolset: "video",
  description: "Remove a call-level block, allowing the user to rejoin.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef, user_id: z.string().min(1).describe("User ID to unblock") },
  handler: async (args, client) =>
    client.video.unblockUser({ type: args.call_type, id: args.call_id, user_id: args.user_id }),
});

const muteUsers = defineTool({
  name: "video_mute_users",
  title: "Mute users in call",
  toolset: "video",
  description:
    "Mute participants in a call. Pass `user_ids` for specific people or `mute_all_users: true` for everyone. Audio is muted unless you explicitly set `audio: false`.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    user_ids: z.array(z.string().min(1)).optional().describe("User IDs to mute"),
    mute_all_users: z.boolean().optional().describe("Mute every user in the call"),
    audio: z.boolean().optional().describe("Mute audio. Default: true."),
    video: z.boolean().optional().describe("Mute video. Default: false."),
    screenshare: z.boolean().optional().describe("Stop screensharing. Default: false."),
    screenshare_audio: z.boolean().optional().describe("Mute screenshare audio. Default: false."),
    // Stream rejects a server-side mute without an acting user:
    // "either muted_by or muted_by_id must be provided when using server side auth".
    muted_by_id: z.string().min(1).describe("Moderator performing the mute"),
  },
  handler: async (args, client) => {
    if (!args.mute_all_users && (args.user_ids === undefined || args.user_ids.length === 0)) {
      throw new ToolInputError("Pass either `user_ids` or `mute_all_users: true`.");
    }
    const audio = args.audio ?? true;
    if (!audio && !args.video && !args.screenshare && !args.screenshare_audio) {
      throw new ToolInputError(
        "Nothing to mute — `audio` is false and no other track is selected. Enable at least one of audio, video, screenshare or screenshare_audio."
      );
    }
    return client.video.muteUsers({
      type: args.call_type,
      id: args.call_id,
      muted_by_id: args.muted_by_id,
      // The API mutes nothing unless a track flag is set, so default audio on.
      audio,
      ...defined({
        user_ids: args.user_ids,
        mute_all_users: args.mute_all_users,
        video: args.video,
        screenshare: args.screenshare,
        screenshare_audio: args.screenshare_audio,
      }),
    });
  },
});

const queryCallParticipants = defineTool({
  name: "video_query_call_participants",
  title: "Query call participants",
  toolset: "video",
  description:
    "List users connected to a call's active session, filtered by user ID or by which tracks they are publishing. Unlike members, participants are people actually in the call right now — this reports the CURRENTLY LIVE session only, so a call whose session has ended returns an empty list; use video_get_call_report for a session that is over. Stream requires at least one filter, so pass `user_ids` and/or `published_tracks`.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    // Stream only supports `user_id` and `published_tracks` here, each with
    // $eq/$in, and rejects an empty filter — so expose exactly those.
    user_ids: z.array(z.string().min(1)).min(1).optional().describe("Restrict to these user IDs"),
    published_tracks: z
      .array(z.enum(["audio", "video", "screen_share", "screen_share_audio"]))
      .min(1)
      .optional()
      .describe("Restrict to participants publishing these track types"),
    limit: limit(100, 25),
  },
  // The raw response wraps a handful of participant rows in an entire
  // CallResponse — settings, the ingress encoder ladder, egress addresses —
  // so the tool's whole subject was the smallest part of its own payload, and
  // often empty, because only a live session has participants.
  compact: (raw: QueryCallParticipantsResponse) => ({
    call_cid: raw.call.cid,
    session_id: raw.call.current_session_id || undefined,
    backstage: raw.call.backstage,
    total_participants: raw.total_participants,
    participants: raw.participants.map((participant) => ({
      user_id: participant.user.id,
      name: participant.user.name,
      role: participant.role,
      joined_at: participant.joined_at,
      user_session_id: participant.user_session_id,
    })),
    member_count: raw.members.length,
    members: raw.members.slice(0, 10).map((member) => ({
      user_id: member.user_id,
      role: member.role,
    })),
    _hint:
      raw.participants.length > 0
        ? "Participants are who is connected right now; members are the roster. Use video_get_call for the call's settings, ingress and egress."
        : raw.call.current_session_id
          ? "No participant matched the filter. A session IS live on this call, so widen `user_ids` / `published_tracks` — the people connected to it simply are not the ones you asked about."
          : "No participants. This endpoint sees only users connected to the call's current session, and no session is live — that is what an absent `session_id` means. Use video_query_call_members for the roster, or video_get_call_report for a session that has ended.",
  }),
  handler: async (args, client) => {
    if (args.user_ids === undefined && args.published_tracks === undefined) {
      throw new ToolInputError(
        "Stream requires at least one filter — pass `user_ids` and/or `published_tracks`."
      );
    }
    return client.video.queryCallParticipants({
      type: args.call_type,
      id: args.call_id,
      filter_conditions: defined({
        user_id: args.user_ids ? { $in: args.user_ids } : undefined,
        published_tracks: args.published_tracks ? { $in: args.published_tracks } : undefined,
      }),
      limit: args.limit ?? 25,
    });
  },
});

const kickUser = defineTool({
  name: "video_kick_user",
  title: "Kick user from call",
  toolset: "video",
  description:
    "Disconnect a user from the active call session. Unlike blocking, they may rejoin unless `block` is set.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    user_id: z.string().min(1).describe("User ID to kick"),
    block: z.boolean().optional().describe("Also block them from rejoining"),
    kicked_by_id: z.string().optional().describe("Moderator performing the kick"),
  },
  handler: async (args, client) =>
    client.video.kickUser({
      type: args.call_type,
      id: args.call_id,
      user_id: args.user_id,
      ...defined({ block: args.block, kicked_by_id: args.kicked_by_id }),
    }),
});

const updateUserPermissions = defineTool({
  name: "video_update_user_permissions",
  title: "Grant or revoke call permissions",
  toolset: "video",
  description:
    "Grant or revoke a user's per-call capabilities. Common permissions: 'send-audio', 'send-video', 'screenshare'.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    user_id: z.string().min(1).describe("User whose permissions change"),
    grant_permissions: z.array(z.string().min(1)).optional().describe("Permissions to grant"),
    revoke_permissions: z.array(z.string().min(1)).optional().describe("Permissions to revoke"),
  },
  handler: async (args, client) => {
    if (args.grant_permissions === undefined && args.revoke_permissions === undefined) {
      throw new ToolInputError("Pass at least one of `grant_permissions` or `revoke_permissions`.");
    }
    return client.video.updateUserPermissions({
      type: args.call_type,
      id: args.call_id,
      user_id: args.user_id,
      ...defined({
        grant_permissions: args.grant_permissions,
        revoke_permissions: args.revoke_permissions,
      }),
    });
  },
});

const pinVideo = defineTool({
  name: "video_pin",
  title: "Pin participant video",
  toolset: "video",
  description:
    "Pin a participant's video for everyone in the call session. Requires the session ID from video_get_call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    session_id: z
      .string()
      .min(1)
      .describe("Call session ID (from video_get_call → call.session.id)"),
    user_id: z.string().min(1).describe("User whose video is pinned"),
  },
  handler: async (args, client) =>
    client.video.videoPin({
      type: args.call_type,
      id: args.call_id,
      session_id: args.session_id,
      user_id: args.user_id,
    }),
});

const unpinVideo = defineTool({
  name: "video_unpin",
  title: "Unpin participant video",
  toolset: "video",
  description: "Remove a server-side video pin.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    session_id: z.string().min(1).describe("Call session ID"),
    user_id: z.string().min(1).describe("User whose pin is removed"),
  },
  handler: async (args, client) =>
    client.video.videoUnpin({
      type: args.call_type,
      id: args.call_id,
      session_id: args.session_id,
      user_id: args.user_id,
    }),
});

export const participantTools: AnyToolDef[] = [
  updateCallMembers,
  queryCallMembers,
  blockUser,
  unblockUser,
  muteUsers,
  queryCallParticipants,
  kickUser,
  updateUserPermissions,
  pinVideo,
  unpinVideo,
];
