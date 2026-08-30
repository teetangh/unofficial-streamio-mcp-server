import type { RecordedCall } from "../mock-client.js";

export interface ToolCase {
  /** Tool name as registered. */
  tool: string;
  /** Arguments the tool is invoked with. */
  args: Record<string, unknown>;
  /** Expected `<namespace>.<method>` on the SDK client. */
  path: string;
  /**
   * Exact payload the SDK method must receive. Required — use `undefined` for
   * methods that take no argument. Without it a case would assert only the
   * method name, so a wrong or missing field would pass.
   */
  payload: unknown;
  /** Extra assertions on the recorded call or the handler's return value. */
  assert?: (call: RecordedCall, result: unknown) => void;
  /** Overrides for the mock client, keyed by SDK path. */
  overrides?: Record<string, unknown>;
}

const CHANNEL = { channel_type: "messaging", channel_id: "general" };
const CALL = { call_type: "default", call_id: "standup" };

export const tokenCases: ToolCase[] = [
  {
    tool: "chat_create_token",
    args: { user_id: "alice", validity_in_seconds: 120 },
    path: "generateUserToken",
    payload: { user_id: "alice", validity_in_seconds: 120 },
    overrides: { generateUserToken: "jwt" },
    assert: (_call, result) => {
      const value = result as { token: string; expires_in_seconds: number };
      if (value.token !== "jwt") throw new Error("token not returned");
      if (value.expires_in_seconds !== 120) throw new Error("expiry not returned");
    },
  },
  {
    // The documented 1h default must be applied locally, not left to the SDK.
    tool: "chat_create_token",
    args: { user_id: "alice" },
    path: "generateUserToken",
    payload: { user_id: "alice", validity_in_seconds: 3600 },
    overrides: { generateUserToken: "jwt" },
  },
  {
    tool: "auth_create_call_token",
    args: { user_id: "alice", call_cids: ["default:standup"], role: "host" },
    path: "generateCallToken",
    payload: {
      user_id: "alice",
      call_cids: ["default:standup"],
      role: "host",
      validity_in_seconds: 3600,
    },
    overrides: { generateCallToken: "jwt" },
  },
];

export const userCases: ToolCase[] = [
  {
    tool: "chat_upsert_users",
    args: { users: [{ id: "alice", name: "Alice" }] },
    path: "upsertUsers",
    payload: [{ id: "alice", name: "Alice" }],
  },
  {
    tool: "chat_query_users",
    args: { filter_conditions: { role: { $eq: "admin" } }, limit: 5 },
    path: "queryUsers",
    payload: { payload: { filter_conditions: { role: { $eq: "admin" } }, limit: 5 } },
  },
  {
    tool: "users_update_partial",
    args: { users: [{ id: "alice", set: { name: "A" } }] },
    path: "updateUsersPartial",
    payload: { users: [{ id: "alice", set: { name: "A" } }] },
  },
  {
    tool: "users_deactivate",
    args: { user_id: "alice", mark_messages_deleted: true },
    path: "deactivateUser",
    payload: { user_id: "alice", mark_messages_deleted: true },
  },
  {
    tool: "users_reactivate",
    args: { user_id: "alice", restore_messages: true },
    path: "reactivateUser",
    payload: { user_id: "alice", restore_messages: true },
  },
  {
    tool: "users_delete",
    args: { user_ids: ["alice"], user: "hard" },
    path: "deleteUsers",
    payload: { user_ids: ["alice"], user: "hard" },
  },
  {
    tool: "users_restore",
    args: { user_ids: ["alice"] },
    path: "restoreUsers",
    payload: { user_ids: ["alice"] },
  },
  {
    tool: "users_create_guest",
    args: { id: "guest-1", name: "Guest" },
    path: "createGuest",
    payload: { user: { id: "guest-1", name: "Guest" } },
  },
  {
    tool: "users_block",
    args: { user_id: "alice", blocked_user_id: "bob" },
    path: "blockUsers",
    payload: { user_id: "alice", blocked_user_id: "bob" },
  },
  {
    tool: "users_unblock",
    args: { user_id: "alice", blocked_user_id: "bob" },
    path: "unblockUsers",
    payload: { user_id: "alice", blocked_user_id: "bob" },
  },
  {
    tool: "users_get_blocked",
    args: { user_id: "alice" },
    path: "getBlockedUsers",
    payload: { user_id: "alice" },
  },
  {
    tool: "users_export",
    args: { user_id: "alice" },
    path: "exportUser",
    payload: { user_id: "alice" },
  },
];

export const channelCases: ToolCase[] = [
  {
    // Regression: `name` must land in `custom`, not at the top of `data`.
    tool: "chat_create_channel",
    args: {
      type: "messaging",
      id: "general",
      created_by_id: "alice",
      name: "General",
      members: ["alice", { user_id: "bob", role: "channel_moderator" }],
    },
    path: "chat.getOrCreateChannel",
    payload: {
      type: "messaging",
      id: "general",
      data: {
        created_by_id: "alice",
        members: [{ user_id: "alice" }, { user_id: "bob", channel_role: "channel_moderator" }],
        custom: { name: "General" },
      },
    },
  },
  {
    tool: "chat_create_channel",
    args: { type: "messaging", created_by_id: "alice", members: ["alice", "bob"] },
    path: "chat.getOrCreateDistinctChannel",
    payload: {
      type: "messaging",
      data: { created_by_id: "alice", members: [{ user_id: "alice" }, { user_id: "bob" }] },
    },
  },
  {
    tool: "chat_get_channel",
    args: { ...CHANNEL, message_limit: 50, before_message_id: "m1" },
    path: "chat.getOrCreateChannel",
    payload: {
      type: "messaging",
      id: "general",
      state: true,
      messages: { limit: 50, id_lt: "m1" },
      members: { limit: 30 },
    },
  },
  {
    // Messages must be excluded by default, or a 30-channel page is enormous.
    tool: "chat_query_channels",
    args: { filter_conditions: { type: "messaging" } },
    path: "chat.queryChannels",
    payload: {
      filter_conditions: { type: "messaging" },
      limit: 10,
      message_limit: 0,
      member_limit: 10,
    },
  },
  {
    tool: "chat_update_channel",
    args: { ...CHANNEL, add_members: ["bob"], remove_members: ["carol"], user_id: "alice" },
    path: "chat.updateChannel",
    payload: {
      type: "messaging",
      id: "general",
      add_members: [{ user_id: "bob" }],
      remove_members: ["carol"],
      user_id: "alice",
    },
  },
  {
    tool: "chat_add_members",
    args: { ...CHANNEL, member_ids: ["bob", "carol"] },
    path: "chat.updateChannel",
    payload: {
      type: "messaging",
      id: "general",
      add_members: [{ user_id: "bob" }, { user_id: "carol" }],
    },
  },
  {
    tool: "chat_remove_members",
    args: { ...CHANNEL, member_ids: ["bob"] },
    path: "chat.updateChannel",
    payload: { type: "messaging", id: "general", remove_members: ["bob"] },
  },
  {
    tool: "chat_update_channel_data",
    args: { ...CHANNEL, set: { name: "Renamed" }, unset: ["image"] },
    path: "chat.updateChannelPartial",
    payload: { type: "messaging", id: "general", set: { name: "Renamed" }, unset: ["image"] },
  },
  {
    tool: "chat_delete_channel",
    args: { ...CHANNEL, hard_delete: true },
    path: "chat.deleteChannel",
    payload: { type: "messaging", id: "general", hard_delete: true },
  },
  {
    tool: "chat_truncate_channel",
    args: { ...CHANNEL, user_id: "alice", system_message: "cleared" },
    path: "chat.truncateChannel",
    payload: {
      type: "messaging",
      id: "general",
      user_id: "alice",
      message: { text: "cleared", type: "system", user_id: "alice" },
    },
  },
  {
    tool: "chat_query_members",
    args: { ...CHANNEL, filter_conditions: { name: { $autocomplete: "al" } } },
    path: "chat.queryMembers",
    payload: {
      payload: {
        type: "messaging",
        id: "general",
        filter_conditions: { name: { $autocomplete: "al" } },
        limit: 25,
      },
    },
  },
  {
    tool: "chat_update_member",
    args: { ...CHANNEL, user_id: "bob", set: { nickname: "Bobby" } },
    path: "chat.updateMemberPartial",
    payload: { type: "messaging", id: "general", user_id: "bob", set: { nickname: "Bobby" } },
  },
  {
    tool: "chat_mute_channel",
    args: { user_id: "alice", channel_cids: ["messaging:general"] },
    path: "chat.muteChannel",
    payload: { user_id: "alice", channel_cids: ["messaging:general"] },
  },
  {
    tool: "chat_unmute_channel",
    args: { user_id: "alice", channel_cids: ["messaging:general"] },
    path: "chat.unmuteChannel",
    payload: { user_id: "alice", channel_cids: ["messaging:general"] },
  },
  {
    tool: "chat_hide_channel",
    args: { ...CHANNEL, user_id: "alice", clear_history: true },
    path: "chat.hideChannel",
    payload: { type: "messaging", id: "general", user_id: "alice", clear_history: true },
  },
  {
    tool: "chat_show_channel",
    args: { ...CHANNEL, user_id: "alice" },
    path: "chat.showChannel",
    payload: { type: "messaging", id: "general", user_id: "alice" },
  },
  {
    tool: "chat_send_event",
    args: { ...CHANNEL, event_type: "typing.start", user_id: "alice" },
    path: "chat.sendEvent",
    payload: {
      type: "messaging",
      id: "general",
      event: { type: "typing.start", user_id: "alice" },
    },
  },
];

export const messageCases: ToolCase[] = [
  {
    tool: "chat_send_message",
    args: { ...CHANNEL, text: "hi", user_id: "alice", mentioned_users: ["bob"] },
    path: "chat.sendMessage",
    payload: {
      type: "messaging",
      id: "general",
      message: { text: "hi", user_id: "alice", mentioned_users: ["bob"] },
    },
  },
  {
    tool: "chat_send_message",
    args: {
      ...CHANNEL,
      text: "look",
      user_id: "alice",
      attachments: [{ type: "image", asset_url: "https://x/y.png" }],
    },
    path: "chat.sendMessage",
    payload: {
      type: "messaging",
      id: "general",
      message: {
        text: "look",
        user_id: "alice",
        attachments: [{ type: "image", asset_url: "https://x/y.png", custom: {} }],
      },
    },
  },
  {
    tool: "chat_get_message",
    args: { message_id: "m1" },
    path: "chat.getMessage",
    payload: { id: "m1" },
  },
  {
    tool: "chat_get_many_messages",
    args: { ...CHANNEL, message_ids: ["m1", "m2"] },
    path: "chat.getManyMessages",
    payload: { type: "messaging", id: "general", ids: ["m1", "m2"] },
  },
  {
    tool: "chat_search_messages",
    args: { filter_conditions: { members: { $in: ["alice"] } }, query: "refund" },
    path: "chat.search",
    payload: {
      payload: { filter_conditions: { members: { $in: ["alice"] } }, query: "refund", limit: 20 },
    },
  },
  {
    tool: "chat_update_message",
    args: { message_id: "m1", text: "edited", user_id: "alice" },
    path: "chat.updateMessage",
    payload: { id: "m1", message: { text: "edited", user_id: "alice" } },
  },
  {
    tool: "chat_update_message_partial",
    args: { message_id: "m1", set: { text: "edited" }, user_id: "alice" },
    path: "chat.updateMessagePartial",
    payload: { id: "m1", set: { text: "edited" }, user_id: "alice" },
  },
  {
    tool: "chat_delete_message",
    args: { message_id: "m1", hard: true },
    path: "chat.deleteMessage",
    payload: { id: "m1", hard: true },
  },
  {
    tool: "chat_undelete_message",
    args: { message_id: "m1", undeleted_by: "alice" },
    path: "chat.undeleteMessage",
    payload: { id: "m1", undeleted_by: "alice" },
  },
  {
    tool: "chat_get_replies",
    args: { parent_message_id: "m1", limit: 10 },
    path: "chat.getReplies",
    payload: { parent_id: "m1", limit: 10 },
  },
  {
    tool: "chat_get_pinned_messages",
    args: { ...CHANNEL },
    // Routed through channel state: chat.getPinnedMessages is broken in the
    // SDK (sends discrete query params where the API wants a JSON payload).
    path: "chat.getOrCreateChannel",
    payload: {
      type: "messaging",
      id: "general",
      state: true,
      messages: { limit: 1 },
      members: { limit: 1 },
    },
    overrides: { "chat.getOrCreateChannel": Promise.resolve({ pinned_messages: [{ id: "m1" }] }) },
    assert: (_call, result) => {
      const value = result as { total: number };
      if (value.total !== 1) throw new Error("pinned message not surfaced");
    },
  },
  {
    tool: "chat_translate_message",
    args: { message_id: "m1", language: "es" },
    path: "chat.translateMessage",
    payload: { id: "m1", language: "es" },
  },
  {
    tool: "chat_send_reaction",
    args: { message_id: "m1", type: "like", user_id: "alice" },
    path: "chat.sendReaction",
    payload: { id: "m1", reaction: { type: "like", user_id: "alice" } },
  },
  {
    tool: "chat_delete_reaction",
    args: { message_id: "m1", type: "like", user_id: "alice" },
    path: "chat.deleteReaction",
    payload: { id: "m1", type: "like", user_id: "alice" },
  },
  {
    tool: "chat_get_reactions",
    args: { message_id: "m1" },
    path: "chat.getReactions",
    payload: { id: "m1", limit: 50 },
  },
  {
    tool: "chat_mark_read",
    args: { ...CHANNEL, user_id: "alice", message_id: "m1" },
    path: "chat.markRead",
    payload: { type: "messaging", id: "general", user_id: "alice", message_id: "m1" },
  },
  {
    tool: "chat_mark_unread",
    args: { ...CHANNEL, user_id: "alice", message_id: "m1" },
    path: "chat.markUnread",
    payload: { type: "messaging", id: "general", user_id: "alice", message_id: "m1" },
  },
  {
    tool: "chat_unread_counts",
    args: { user_id: "alice" },
    path: "chat.unreadCounts",
    payload: { user_id: "alice" },
  },
  {
    tool: "chat_query_threads",
    args: { user_id: "alice" },
    path: "chat.queryThreads",
    payload: { user_id: "alice", limit: 10, reply_limit: 2 },
  },
  {
    tool: "chat_get_thread",
    args: { parent_message_id: "m1" },
    path: "chat.getThread",
    // Documented defaults must be sent, not left to Stream's own (2 replies).
    payload: { message_id: "m1", reply_limit: 10, participant_limit: 10 },
  },
];

export const chatAdminCases: ToolCase[] = [
  { tool: "chat_list_channel_types", args: {}, path: "chat.listChannelTypes", payload: undefined },
  {
    tool: "chat_get_channel_type",
    args: { name: "messaging" },
    path: "chat.getChannelType",
    payload: { name: "messaging" },
  },
  {
    tool: "chat_create_channel_type",
    args: {
      name: "support",
      automod: "disabled",
      automod_behavior: "flag",
      max_message_length: 5000,
      settings: { typing_events: true },
    },
    path: "chat.createChannelType",
    payload: {
      typing_events: true,
      name: "support",
      automod: "disabled",
      automod_behavior: "flag",
      max_message_length: 5000,
    },
  },
  {
    tool: "chat_update_channel_type",
    args: {
      name: "support",
      automod: "disabled",
      automod_behavior: "flag",
      max_message_length: 2000,
    },
    path: "chat.updateChannelType",
    payload: {
      name: "support",
      automod: "disabled",
      automod_behavior: "flag",
      max_message_length: 2000,
    },
  },
  {
    tool: "chat_delete_channel_type",
    args: { name: "support" },
    path: "chat.deleteChannelType",
    payload: { name: "support" },
  },
  {
    tool: "chat_export_channels",
    args: { channel_cids: ["messaging:general"] },
    path: "chat.exportChannels",
    payload: { channels: [{ cid: "messaging:general" }] },
  },
];

export const moderationCases: ToolCase[] = [
  {
    tool: "moderation_ban_user",
    args: { target_user_id: "bob", banned_by_id: "alice", timeout: 60, shadow: true },
    path: "moderation.ban",
    payload: { target_user_id: "bob", banned_by_id: "alice", timeout: 60, shadow: true },
  },
  {
    tool: "moderation_unban_user",
    args: { target_user_id: "bob", unbanned_by_id: "alice", banned_by_id: "mod" },
    path: "moderation.unban",
    // `created_by` identifies who created the ban, not who is lifting it.
    payload: { target_user_id: "bob", unbanned_by_id: "alice", created_by: "mod" },
  },
  {
    tool: "moderation_query_banned_users",
    args: { filter_conditions: { user_id: { $eq: "bob" } } },
    path: "queryBannedUsers",
    payload: { payload: { filter_conditions: { user_id: { $eq: "bob" } }, limit: 25 } },
  },
  {
    tool: "moderation_mute_user",
    args: { user_id: "alice", target_ids: ["bob"] },
    path: "moderation.mute",
    payload: { user_id: "alice", target_ids: ["bob"] },
  },
  {
    tool: "moderation_unmute_user",
    args: { user_id: "alice", target_ids: ["bob"] },
    path: "moderation.unmute",
    payload: { user_id: "alice", target_ids: ["bob"] },
  },
  {
    tool: "moderation_flag_message",
    args: { entity_id: "m1", user_id: "alice", reason: "spam" },
    path: "moderation.flag",
    payload: {
      entity_id: "m1",
      entity_type: "stream:chat:v1:message",
      user_id: "alice",
      reason: "spam",
    },
  },
  {
    tool: "moderation_query_flags",
    args: { filter: { reviewed: false } },
    path: "moderation.queryModerationFlags",
    payload: { filter: { reviewed: false }, limit: 25 },
  },
  {
    tool: "moderation_query_review_queue",
    args: {},
    path: "moderation.queryReviewQueue",
    payload: { limit: 25 },
  },
  {
    tool: "moderation_submit_action",
    args: { item_id: "i1", action_type: "ban", payload: { ban: { timeout: 60 } } },
    path: "moderation.submitAction",
    payload: { item_id: "i1", action_type: "ban", ban: { timeout: 60 } },
  },
  {
    tool: "moderation_check",
    args: { entity_id: "m1", entity_creator_id: "bob", text: "hello" },
    path: "moderation.check",
    payload: {
      entity_id: "m1",
      entity_type: "stream:chat:v1:message",
      entity_creator_id: "bob",
      moderation_payload: { texts: ["hello"] },
    },
  },
  {
    tool: "moderation_query_logs",
    args: {},
    path: "moderation.queryModerationLogs",
    payload: { limit: 25 },
  },
  { tool: "moderation_list_blocklists", args: {}, path: "listBlockLists", payload: {} },
  {
    tool: "moderation_get_blocklist",
    args: { name: "profanity" },
    path: "getBlockList",
    payload: { name: "profanity" },
  },
  {
    tool: "moderation_create_blocklist",
    args: { name: "custom", words: ["foo"] },
    path: "createBlockList",
    payload: { name: "custom", words: ["foo"], type: "word" },
  },
  {
    tool: "moderation_update_blocklist",
    args: { name: "custom", words: ["bar"] },
    path: "updateBlockList",
    payload: { name: "custom", words: ["bar"] },
  },
  {
    tool: "moderation_delete_blocklist",
    args: { name: "custom" },
    path: "deleteBlockList",
    payload: { name: "custom" },
  },
];

export const callCases: ToolCase[] = [
  {
    tool: "video_create_call",
    args: { ...CALL, created_by_id: "alice", members: ["bob"], custom: { topic: "daily" } },
    path: "call.getOrCreate",
    payload: {
      data: {
        created_by_id: "alice",
        members: [{ user_id: "bob" }],
        custom: { topic: "daily" },
      },
    },
    assert: (_call, _result) => undefined,
  },
  {
    tool: "video_get_call",
    args: { ...CALL },
    path: "video.getCall",
    payload: { type: "default", id: "standup", members_limit: 25 },
  },
  {
    tool: "video_update_call",
    args: { ...CALL, custom: { topic: "retro" } },
    path: "video.updateCall",
    payload: { type: "default", id: "standup", custom: { topic: "retro" } },
  },
  {
    tool: "video_end_call",
    args: { ...CALL },
    path: "video.endCall",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_delete_call",
    args: { ...CALL, hard: true },
    path: "video.deleteCall",
    payload: { type: "default", id: "standup", hard: true },
  },
  {
    tool: "video_query_calls",
    args: { filter_conditions: { ongoing: { $eq: true } } },
    path: "video.queryCalls",
    payload: { filter_conditions: { ongoing: { $eq: true } }, limit: 10 },
  },
  {
    tool: "video_go_live",
    args: { ...CALL, start_hls: true },
    path: "video.goLive",
    payload: { type: "default", id: "standup", start_hls: true },
  },
  {
    tool: "video_stop_live",
    args: { ...CALL, continue_recording: true },
    path: "video.stopLive",
    payload: { type: "default", id: "standup", continue_recording: true },
  },
  {
    tool: "video_ring_call",
    args: { ...CALL, member_ids: ["bob"] },
    path: "video.ringCall",
    payload: { type: "default", id: "standup", members_ids: ["bob"] },
  },
  {
    tool: "video_send_call_event",
    args: { ...CALL, custom: { confetti: true }, user_id: "alice" },
    path: "video.sendCallEvent",
    payload: { type: "default", id: "standup", user_id: "alice", custom: { confetti: true } },
  },
  {
    tool: "video_get_call_report",
    args: { ...CALL },
    path: "video.getCallReport",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_query_call_stats",
    args: { filter_conditions: { call_cid: { $eq: "default:standup" } } },
    path: "video.queryCallStats",
    payload: { filter_conditions: { call_cid: { $eq: "default:standup" } }, limit: 10 },
  },
  { tool: "video_get_edges", args: {}, path: "video.getEdges", payload: undefined },
];

export const participantCases: ToolCase[] = [
  {
    tool: "video_update_call_members",
    args: { ...CALL, update_members: [{ user_id: "bob", role: "host" }] },
    path: "video.updateCallMembers",
    payload: {
      type: "default",
      id: "standup",
      update_members: [{ user_id: "bob", role: "host" }],
    },
  },
  {
    tool: "video_query_call_members",
    args: { ...CALL },
    path: "video.queryCallMembers",
    payload: { type: "default", id: "standup", limit: 25 },
  },
  {
    tool: "video_query_call_participants",
    args: { ...CALL, user_ids: ["bob"] },
    path: "video.queryCallParticipants",
    payload: {
      type: "default",
      id: "standup",
      filter_conditions: { user_id: { $in: ["bob"] } },
      limit: 25,
    },
  },
  {
    tool: "video_block_user",
    args: { ...CALL, user_id: "bob" },
    path: "video.blockUser",
    payload: { type: "default", id: "standup", user_id: "bob" },
  },
  {
    tool: "video_unblock_user",
    args: { ...CALL, user_id: "bob" },
    path: "video.unblockUser",
    payload: { type: "default", id: "standup", user_id: "bob" },
  },
  {
    tool: "video_kick_user",
    args: { ...CALL, user_id: "bob", block: true },
    path: "video.kickUser",
    payload: { type: "default", id: "standup", user_id: "bob", block: true },
  },
  {
    // Regression: audio must default to true, or the API mutes nothing.
    tool: "video_mute_users",
    args: { ...CALL, user_ids: ["bob"], muted_by_id: "alice" },
    path: "video.muteUsers",
    payload: {
      type: "default",
      id: "standup",
      muted_by_id: "alice",
      audio: true,
      user_ids: ["bob"],
    },
  },
  {
    tool: "video_mute_users",
    args: { ...CALL, mute_all_users: true, audio: false, video: true, muted_by_id: "alice" },
    path: "video.muteUsers",
    payload: {
      type: "default",
      id: "standup",
      muted_by_id: "alice",
      audio: false,
      mute_all_users: true,
      video: true,
    },
  },
  {
    tool: "video_update_user_permissions",
    args: { ...CALL, user_id: "bob", grant_permissions: ["send-audio"] },
    path: "video.updateUserPermissions",
    payload: {
      type: "default",
      id: "standup",
      user_id: "bob",
      grant_permissions: ["send-audio"],
    },
  },
  {
    tool: "video_pin",
    args: { ...CALL, session_id: "s1", user_id: "bob" },
    path: "video.videoPin",
    payload: { type: "default", id: "standup", session_id: "s1", user_id: "bob" },
  },
  {
    tool: "video_unpin",
    args: { ...CALL, session_id: "s1", user_id: "bob" },
    path: "video.videoUnpin",
    payload: { type: "default", id: "standup", session_id: "s1", user_id: "bob" },
  },
];

export const mediaCases: ToolCase[] = [
  {
    // Regression: the default was `audio_and_video`, which is not a valid
    // path segment — every default invocation failed.
    tool: "video_start_recording",
    args: { ...CALL },
    path: "video.startRecording",
    payload: { type: "default", id: "standup", recording_type: "composite" },
  },
  {
    tool: "video_start_recording",
    args: { ...CALL, recording_type: "individual", recording_external_storage: "s3" },
    path: "video.startRecording",
    payload: {
      type: "default",
      id: "standup",
      recording_type: "individual",
      recording_external_storage: "s3",
    },
  },
  {
    tool: "video_stop_recording",
    args: { ...CALL },
    path: "video.stopRecording",
    payload: { type: "default", id: "standup", recording_type: "composite" },
  },
  {
    tool: "video_list_recordings",
    args: { ...CALL },
    path: "video.listRecordings",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_delete_recording",
    args: { ...CALL, session: "s1", filename: "rec.mp4" },
    path: "video.deleteRecording",
    payload: { type: "default", id: "standup", session: "s1", filename: "rec.mp4" },
  },
  {
    tool: "video_start_transcription",
    args: { ...CALL },
    path: "video.startTranscription",
    payload: { type: "default", id: "standup", language: "auto" },
  },
  {
    tool: "video_stop_transcription",
    args: { ...CALL },
    path: "video.stopTranscription",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_list_transcriptions",
    args: { ...CALL },
    path: "video.listTranscriptions",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_delete_transcription",
    args: { ...CALL, session: "s1", filename: "t.jsonl" },
    path: "video.deleteTranscription",
    payload: { type: "default", id: "standup", session: "s1", filename: "t.jsonl" },
  },
  {
    tool: "video_start_closed_captions",
    args: { ...CALL, language: "en" },
    path: "video.startClosedCaptions",
    payload: { type: "default", id: "standup", language: "en" },
  },
  {
    tool: "video_stop_closed_captions",
    args: { ...CALL },
    path: "video.stopClosedCaptions",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_start_hls_broadcasting",
    args: { ...CALL },
    path: "video.startHLSBroadcasting",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_stop_hls_broadcasting",
    args: { ...CALL },
    path: "video.stopHLSBroadcasting",
    payload: { type: "default", id: "standup" },
  },
  {
    tool: "video_start_rtmp_broadcasts",
    args: { ...CALL, broadcasts: [{ name: "yt", stream_url: "rtmp://x" }] },
    path: "video.startRTMPBroadcasts",
    payload: {
      type: "default",
      id: "standup",
      broadcasts: [{ name: "yt", stream_url: "rtmp://x" }],
    },
  },
  {
    tool: "video_stop_rtmp_broadcast",
    args: { ...CALL, name: "yt" },
    path: "video.stopRTMPBroadcast",
    payload: { type: "default", id: "standup", name: "yt" },
  },
  {
    tool: "video_stop_all_rtmp_broadcasts",
    args: { ...CALL },
    path: "video.stopAllRTMPBroadcasts",
    payload: { type: "default", id: "standup" },
  },
];

export const videoAdminCases: ToolCase[] = [
  { tool: "video_list_call_types", args: {}, path: "video.listCallTypes", payload: undefined },
  {
    tool: "video_get_call_type",
    args: { name: "default" },
    path: "video.getCallType",
    payload: { name: "default" },
  },
  {
    tool: "video_create_call_type",
    args: { name: "webinar", settings: { backstage: { enabled: true } } },
    path: "video.createCallType",
    payload: { name: "webinar", settings: { backstage: { enabled: true } } },
  },
  {
    tool: "video_update_call_type",
    args: { name: "webinar", grants: { host: ["join-call"] } },
    path: "video.updateCallType",
    payload: { name: "webinar", grants: { host: ["join-call"] } },
  },
  {
    tool: "video_delete_call_type",
    args: { name: "webinar" },
    path: "video.deleteCallType",
    payload: { name: "webinar" },
  },
];

export const appCases: ToolCase[] = [
  { tool: "app_get_settings", args: {}, path: "getApp", payload: undefined },
  {
    tool: "app_update_settings",
    args: { settings: { webhook_url: "https://example.invalid/hook" } },
    path: "updateApp",
    payload: { webhook_url: "https://example.invalid/hook" },
  },
  {
    tool: "app_get_rate_limits",
    args: {},
    path: "getRateLimits",
    payload: { server_side: true },
  },
  { tool: "app_get_task", args: { task_id: "t1" }, path: "getTask", payload: { id: "t1" } },
];

export const ALL_CASES: ToolCase[] = [
  ...tokenCases,
  ...userCases,
  ...channelCases,
  ...messageCases,
  ...chatAdminCases,
  ...moderationCases,
  ...callCases,
  ...participantCases,
  ...mediaCases,
  ...videoAdminCases,
  ...appCases,
];
