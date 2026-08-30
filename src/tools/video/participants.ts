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

export const participantTools: AnyToolDef[] = [
  updateCallMembers,
  queryCallMembers,
  blockUser,
  unblockUser,
  muteUsers,
];
