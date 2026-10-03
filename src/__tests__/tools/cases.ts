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
    // Stream rejects every operator on `deactivated_at`, so the only way to
    // isolate deactivated users is to page by ascending id and filter locally.
    // Keyset, not offset: Stream caps `offset` at 1,000.
    tool: "chat_query_users",
    args: { deactivated_only: true, limit: 20 },
    path: "queryUsers",
    payload: {
      payload: {
        filter_conditions: { id: { $gt: "" } },
        sort: [{ field: "id", direction: 1 }],
        limit: 100,
        include_deactivated_users: true,
      },
    },
    overrides: {
      queryUsers: {
        duration: "1ms",
        users: [{ id: "alice", deactivated_at: new Date("2026-08-01T00:00:00Z") }, { id: "bob" }],
      },
    },
    assert: (_call, result) => {
      const value = result as {
        users: { id: string }[];
        scan: { scanned: number; pages: number; complete: boolean; next_id?: string };
      };
      if (value.users.length !== 1 || value.users[0].id !== "alice") {
        throw new Error("scan kept a user that is not deactivated");
      }
      // A short page means the end of the app's users was reached.
      if (!value.scan.complete || value.scan.scanned !== 2 || value.scan.pages !== 1) {
        throw new Error("scan summary does not describe the pages actually read");
      }
      if (value.scan.next_id !== undefined) throw new Error("a complete scan has no cursor");
    },
  },
  {
    tool: "chat_query_users",
    args: { deactivated_only: true, after_id: "mcptest-u9", limit: 20 },
    path: "queryUsers",
    payload: {
      payload: {
        filter_conditions: { id: { $gt: "mcptest-u9" } },
        sort: [{ field: "id", direction: 1 }],
        limit: 100,
        include_deactivated_users: true,
      },
    },
    overrides: { queryUsers: { duration: "1ms", users: [] } },
  },
  {
    // A page can hold more matches than were asked for. The resume cursor must
    // be the last user returned, not the last one examined, or the trimmed
    // matches are skipped on the next call.
    tool: "chat_query_users",
    args: { deactivated_only: true, limit: 2 },
    path: "queryUsers",
    payload: {
      payload: {
        filter_conditions: { id: { $gt: "" } },
        sort: [{ field: "id", direction: 1 }],
        limit: 100,
        include_deactivated_users: true,
      },
    },
    overrides: {
      queryUsers: {
        duration: "1ms",
        users: ["a", "b", "c"].map((id) => ({ id, deactivated_at: new Date("2026-08-01Z") })),
      },
    },
    assert: (_call, result) => {
      const value = result as {
        users: { id: string }[];
        scan: { complete: boolean; next_id?: string };
      };
      if (value.users.map((user) => user.id).join() !== "a,b") {
        throw new Error("scan returned more than the requested limit");
      }
      if (value.scan.complete) throw new Error("a trimmed scan is not complete");
      if (value.scan.next_id !== "b") throw new Error("resume cursor skips the trimmed matches");
    },
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
    // A plain read goes through Stream's GET endpoint, which 404s on an id
    // that does not exist. The create-or-query endpoint would have created it
    // — on a tool annotated readOnlyHint.
    tool: "chat_get_channel",
    args: { ...CHANNEL },
    path: "apiClient.sendRequest",
    payload: [
      "GET",
      "/api/v2/chat/channels/{type}/{id}",
      { type: "messaging", id: "general" },
      { payload: JSON.stringify({ state: true, messages_limit: 25, members_limit: 30 }) },
    ],
  },
  {
    // Paging falls through to create-or-query, because the GET endpoint
    // accepts `messages_id_lt` and ignores it. The GET above still runs first,
    // so an unknown id has already 404'd by this point.
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
    args: { ...CHANNEL, event_type: "typing_start", user_id: "alice" },
    path: "chat.sendEvent",
    payload: {
      type: "messaging",
      id: "general",
      event: { type: "typing_start", user_id: "alice" },
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
    args: { ...CHANNEL, limit: 50, user_id: "alice" },
    // Read via GET /channels/{type}/{id}/pinned_messages with a JSON `payload`
    // query param so an unknown channel 404s without creating a phantom channel
    // and `limit` is honored beyond channel state's 10-pin cap.
    path: "apiClient.sendRequest",
    payload: [
      "GET",
      "/api/v2/chat/channels/{type}/{id}/pinned_messages",
      { type: "messaging", id: "general" },
      {
        payload: JSON.stringify({
          limit: 50,
          sort: [{ field: "pinned_at", direction: -1 }],
          user_id: "alice",
        }),
      },
    ],
    overrides: {
      "apiClient.sendRequest": Promise.resolve({ messages: [{ id: "m1" }] }),
    },
    assert: (_call, result) => {
      const value = result as { pinned_messages: { id: string }[] };
      if (value.pinned_messages.length !== 1 || value.pinned_messages[0].id !== "m1") {
        throw new Error("pinned message not surfaced");
      }
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
  {
    // The description tells callers to write a time range as an $and of
    // single-operator expressions, because Stream rejects two operators on one
    // field. That nesting has to reach the SDK untouched.
    tool: "video_query_call_stats",
    args: {
      filter_conditions: {
        $and: [
          { created_at: { $gt: "2026-06-01T00:00:00Z" } },
          { created_at: { $lt: "2026-09-01T00:00:00Z" } },
        ],
      },
      limit: 5,
    },
    path: "video.queryCallStats",
    payload: {
      filter_conditions: {
        $and: [
          { created_at: { $gt: "2026-06-01T00:00:00Z" } },
          { created_at: { $lt: "2026-09-01T00:00:00Z" } },
        ],
      },
      limit: 5,
    },
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

export const deviceAndGroupCases: ToolCase[] = [
  {
    tool: "users_list_devices",
    args: { user_id: "alice" },
    path: "listDevices",
    payload: { user_id: "alice" },
  },
  {
    tool: "users_create_device",
    args: {
      id: "tok1",
      push_provider: "firebase",
      user_id: "alice",
      push_provider_name: "fcm",
    },
    path: "createDevice",
    payload: {
      id: "tok1",
      push_provider: "firebase",
      user_id: "alice",
      push_provider_name: "fcm",
    },
  },
  {
    tool: "users_delete_device",
    args: { id: "tok1", user_id: "alice" },
    path: "deleteDevice",
    payload: { id: "tok1", user_id: "alice" },
  },
  {
    tool: "users_list_groups",
    args: { team_id: "t1" },
    path: "listUserGroups",
    payload: { limit: 25, team_id: "t1" },
  },
  {
    tool: "users_get_group",
    args: { id: "g1" },
    path: "getUserGroup",
    payload: { id: "g1" },
  },
  {
    tool: "users_create_group",
    args: { name: "VIPs", member_ids: ["alice"] },
    path: "createUserGroup",
    payload: { name: "VIPs", member_ids: ["alice"] },
  },
  {
    tool: "users_update_group",
    args: { id: "g1", name: "Admins" },
    path: "updateUserGroup",
    payload: { id: "g1", name: "Admins" },
  },
  {
    tool: "users_delete_group",
    args: { id: "g1" },
    path: "deleteUserGroup",
    payload: { id: "g1" },
  },
  {
    tool: "users_add_group_members",
    args: { id: "g1", member_ids: ["bob"], as_admin: true },
    path: "addUserGroupMembers",
    payload: { id: "g1", member_ids: ["bob"], as_admin: true },
  },
  {
    tool: "users_remove_group_members",
    args: { id: "g1", member_ids: ["bob"] },
    path: "removeUserGroupMembers",
    payload: { id: "g1", member_ids: ["bob"] },
  },
  {
    tool: "users_deactivate_batch",
    args: { user_ids: ["alice", "bob"], mark_messages_deleted: true },
    path: "deactivateUsers",
    payload: { user_ids: ["alice", "bob"], mark_messages_deleted: true },
  },
  {
    tool: "users_reactivate_batch",
    args: { user_ids: ["alice", "bob"], restore_messages: true },
    path: "reactivateUsers",
    payload: { user_ids: ["alice", "bob"], restore_messages: true },
  },
];

export const pollCases: ToolCase[] = [
  {
    tool: "chat_create_poll",
    args: { name: "Lunch?", user_id: "alice", options: [{ text: "Tacos" }] },
    path: "createPoll",
    payload: { name: "Lunch?", user_id: "alice", options: [{ text: "Tacos" }] },
  },
  {
    tool: "chat_get_poll",
    args: { poll_id: "p1" },
    path: "getPoll",
    payload: { poll_id: "p1" },
  },
  {
    tool: "chat_update_poll_partial",
    args: { poll_id: "p1", user_id: "alice", set: { is_closed: true } },
    path: "updatePollPartial",
    payload: { poll_id: "p1", user_id: "alice", set: { is_closed: true } },
  },
  {
    tool: "chat_delete_poll",
    args: { poll_id: "p1", user_id: "alice" },
    path: "deletePoll",
    payload: { poll_id: "p1", user_id: "alice" },
  },
  {
    tool: "chat_query_polls",
    args: { user_id: "alice", filter: { is_closed: false } },
    path: "queryPolls",
    payload: { filter: { is_closed: false }, limit: 25, user_id: "alice" },
  },
  {
    tool: "chat_create_poll_option",
    args: { poll_id: "p1", text: "Sushi", user_id: "alice" },
    path: "createPollOption",
    payload: { poll_id: "p1", text: "Sushi", user_id: "alice" },
  },
  {
    tool: "chat_delete_poll_option",
    args: { poll_id: "p1", option_id: "opt1", user_id: "alice" },
    path: "deletePollOption",
    payload: { poll_id: "p1", option_id: "opt1", user_id: "alice" },
  },
  {
    tool: "chat_cast_poll_vote",
    args: { message_id: "m1", poll_id: "p1", user_id: "alice", option_id: "opt1" },
    path: "chat.castPollVote",
    payload: { message_id: "m1", poll_id: "p1", user_id: "alice", vote: { option_id: "opt1" } },
  },
  {
    tool: "chat_delete_poll_vote",
    args: { message_id: "m1", poll_id: "p1", vote_id: "v1", user_id: "alice" },
    path: "chat.deletePollVote",
    payload: { message_id: "m1", poll_id: "p1", vote_id: "v1", user_id: "alice" },
  },
  {
    tool: "chat_query_poll_votes",
    args: { poll_id: "p1", user_id: "alice" },
    path: "queryPollVotes",
    payload: { poll_id: "p1", limit: 25, user_id: "alice" },
  },
  {
    tool: "chat_create_reminder",
    args: { message_id: "m1", user_id: "alice", remind_at: "2026-09-01T15:00:00Z" },
    path: "chat.createReminder",
    payload: {
      message_id: "m1",
      user_id: "alice",
      remind_at: new Date("2026-09-01T15:00:00Z"),
    },
  },
  {
    tool: "chat_update_reminder",
    args: { message_id: "m1", user_id: "alice", remind_at: "2026-09-02T15:00:00Z" },
    path: "chat.updateReminder",
    payload: {
      message_id: "m1",
      user_id: "alice",
      remind_at: new Date("2026-09-02T15:00:00Z"),
    },
  },
  {
    tool: "chat_delete_reminder",
    args: { message_id: "m1", user_id: "alice" },
    path: "chat.deleteReminder",
    payload: { message_id: "m1", user_id: "alice" },
  },
  {
    tool: "chat_query_reminders",
    args: { user_id: "alice" },
    path: "chat.queryReminders",
    payload: { user_id: "alice", limit: 25 },
  },
  {
    tool: "chat_get_draft",
    args: { ...CHANNEL, user_id: "alice" },
    path: "chat.getDraft",
    payload: { type: "messaging", id: "general", user_id: "alice" },
  },
  {
    tool: "chat_delete_draft",
    args: { ...CHANNEL, user_id: "alice" },
    path: "chat.deleteDraft",
    payload: { type: "messaging", id: "general", user_id: "alice" },
  },
  {
    tool: "chat_query_drafts",
    args: { user_id: "alice" },
    path: "chat.queryDrafts",
    payload: { user_id: "alice", limit: 25 },
  },
];

export const commandAndBatchCases: ToolCase[] = [
  { tool: "chat_list_commands", args: {}, path: "chat.listCommands", payload: undefined },
  {
    tool: "chat_get_command",
    args: { name: "giphy" },
    path: "chat.getCommand",
    payload: { name: "giphy" },
  },
  {
    tool: "chat_create_command",
    args: { name: "ticket", description: "Create a ticket", args: "[title]" },
    path: "chat.createCommand",
    payload: { name: "ticket", description: "Create a ticket", args: "[title]" },
  },
  {
    tool: "chat_update_command",
    args: { name: "ticket", description: "Updated ticket command" },
    path: "chat.updateCommand",
    payload: { name: "ticket", description: "Updated ticket command" },
  },
  {
    tool: "chat_delete_command",
    args: { name: "ticket" },
    path: "chat.deleteCommand",
    payload: { name: "ticket" },
  },
  {
    tool: "chat_get_push_templates",
    args: { push_provider_type: "firebase" },
    path: "getPushTemplates",
    payload: { push_provider_type: "firebase" },
  },
  {
    tool: "chat_upsert_push_template",
    args: {
      push_provider_type: "firebase",
      event_type: "message.new",
      template: "{{ message.text }}",
    },
    path: "upsertPushTemplate",
    payload: {
      push_provider_type: "firebase",
      event_type: "message.new",
      template: "{{ message.text }}",
    },
  },
  {
    tool: "chat_delete_channels_batch",
    args: { cids: ["messaging:general"], hard_delete: true },
    path: "chat.deleteChannels",
    payload: { cids: ["messaging:general"], hard_delete: true },
  },
  {
    tool: "chat_unread_counts_batch",
    args: { user_ids: ["alice", "bob"] },
    path: "chat.unreadCountsBatch",
    payload: { user_ids: ["alice", "bob"] },
  },
  {
    tool: "chat_query_message_history",
    args: { filter: { message_id: "m1" } },
    path: "chat.queryMessageHistory",
    payload: { filter: { message_id: "m1" }, limit: 25 },
  },
];

export const moderationPolicyCases: ToolCase[] = [
  {
    tool: "moderation_query_configs",
    args: {},
    path: "moderation.queryModerationConfigs",
    payload: { limit: 25 },
  },
  {
    tool: "moderation_get_config",
    args: { key: "default" },
    path: "moderation.getConfig",
    payload: { key: "default" },
  },
  {
    tool: "moderation_upsert_config",
    args: {
      key: "default",
      async: true,
      velocity_filter_config: {
        enabled: true,
        rules: [{ action: "flag", fast_spam_threshold: 5, fast_spam_ttl: 60 }],
      },
    },
    path: "moderation.upsertConfig",
    payload: {
      key: "default",
      async: true,
      velocity_filter_config: {
        enabled: true,
        rules: [{ action: "flag", fast_spam_threshold: 5, fast_spam_ttl: 60 }],
      },
    },
  },
  {
    tool: "moderation_delete_config",
    args: { key: "default" },
    path: "moderation.deleteConfig",
    payload: { key: "default" },
  },
  {
    tool: "moderation_query_rules",
    args: {},
    path: "moderation.queryModerationRules",
    payload: { limit: 25 },
  },
  {
    tool: "moderation_get_rule",
    args: { id: "r1" },
    path: "moderation.getModerationRule",
    payload: { id: "r1" },
  },
  {
    tool: "moderation_upsert_rule",
    args: {
      name: "spam-rule",
      rule_type: "user",
      enabled: true,
      conditions: [
        { type: "user_created_within", user_created_within_params: { max_age: "24h" } },
        { type: "user_role", user_role_params: { role: "user", operator: "eq" } },
      ],
    },
    path: "moderation.upsertModerationRule",
    payload: {
      name: "spam-rule",
      rule_type: "user",
      enabled: true,
      conditions: [
        { type: "user_created_within", user_created_within_params: { max_age: "24h" } },
        { type: "user_role", user_role_params: { role: "user", operator: "eq" } },
      ],
    },
  },
  {
    tool: "moderation_delete_rule",
    args: { id: "r1" },
    path: "moderation.deleteModerationRule",
    payload: { id: "r1" },
  },
  {
    tool: "moderation_get_review_queue_item",
    args: { id: "rq1" },
    path: "moderation.getReviewQueueItem",
    payload: { id: "rq1" },
  },
  {
    tool: "moderation_appeal",
    args: {
      entity_id: "m1",
      entity_type: "stream:chat:v1:message",
      user_id: "alice",
      appeal_reason: "false positive",
    },
    path: "moderation.appeal",
    payload: {
      entity_id: "m1",
      entity_type: "stream:chat:v1:message",
      user_id: "alice",
      appeal_reason: "false positive",
    },
  },
  {
    tool: "moderation_get_appeal",
    args: { id: "ap1" },
    path: "moderation.getAppeal",
    payload: { id: "ap1" },
  },
  {
    tool: "moderation_query_appeals",
    args: {},
    path: "moderation.queryAppeals",
    payload: { limit: 25 },
  },
];

export const videoAnalyticsCases: ToolCase[] = [
  {
    tool: "video_get_active_calls_status",
    args: {},
    path: "video.getActiveCallsStatus",
    payload: undefined,
  },
  {
    tool: "video_query_aggregate_call_stats",
    args: { from: "2026-08-01", to: "2026-08-07" },
    path: "video.queryAggregateCallStats",
    payload: {
      from: "2026-08-01",
      to: "2026-08-07",
      report_types: [
        "call_quality",
        "user_feedback",
        "sdk_usage",
        "network_metrics",
        "call_duration",
        "call_participant_count",
        "calls_per_day",
      ],
    },
  },
  {
    tool: "video_query_call_session_stats",
    args: {},
    path: "video.queryCallSessionStats",
    payload: { limit: 25 },
  },
  {
    tool: "video_query_call_participant_stats",
    args: { ...CALL, session: "s1" },
    path: "video.queryCallSessionParticipantStats",
    payload: { call_type: "default", call_id: "standup", session: "s1", limit: 25 },
  },
  {
    tool: "video_get_participant_stats_timeline",
    args: { ...CALL, session: "s1", user: "alice", user_session: "us1" },
    path: "video.getCallSessionParticipantStatsTimeline",
    payload: {
      call_type: "default",
      call_id: "standup",
      session: "s1",
      user: "alice",
      user_session: "us1",
    },
  },
  {
    tool: "video_query_user_feedback",
    args: { full: true },
    path: "video.queryUserFeedback",
    payload: { limit: 25, full: true },
  },
  {
    tool: "video_start_frame_recording",
    args: { ...CALL, recording_external_storage: "s3-frames" },
    path: "call.startFrameRecording",
    payload: { recording_external_storage: "s3-frames" },
  },
  {
    tool: "video_stop_frame_recording",
    args: { ...CALL },
    path: "call.stopFrameRecording",
    payload: undefined,
  },
  {
    tool: "video_send_closed_caption",
    args: { ...CALL, text: "Hello", speaker_id: "alice", user_id: "alice" },
    path: "call.sendClosedCaption",
    payload: { text: "Hello", speaker_id: "alice", user_id: "alice" },
  },
  {
    tool: "video_list_sip_trunks",
    args: {},
    path: "video.listSIPTrunks",
    payload: undefined,
  },
  {
    tool: "video_create_sip_trunk",
    args: { name: "main-trunk", numbers: ["+15551234567"] },
    path: "video.createSIPTrunk",
    payload: { name: "main-trunk", numbers: ["+15551234567"] },
  },
  {
    tool: "video_update_sip_trunk",
    args: { id: "tr1", name: "updated-trunk", numbers: ["+15551234567"] },
    path: "video.updateSIPTrunk",
    payload: { id: "tr1", name: "updated-trunk", numbers: ["+15551234567"] },
  },
  {
    tool: "video_delete_sip_trunk",
    args: { id: "tr1" },
    path: "video.deleteSIPTrunk",
    payload: { id: "tr1" },
  },
  {
    tool: "video_list_sip_routing_rules",
    args: {},
    path: "video.listSIPInboundRoutingRule",
    payload: undefined,
  },
  {
    tool: "video_create_sip_routing_rule",
    args: {
      name: "inbound-rule",
      trunk_ids: ["tr1"],
      caller_configs: { id: "{{sip.from.user}}" },
      direct_routing_configs: { call_type: "default", call_id: "sip-{{sip.to.user}}" },
    },
    path: "video.createSIPInboundRoutingRule",
    payload: {
      name: "inbound-rule",
      trunk_ids: ["tr1"],
      caller_configs: { id: "{{sip.from.user}}" },
      direct_routing_configs: { call_type: "default", call_id: "sip-{{sip.to.user}}" },
    },
  },
  {
    tool: "video_delete_sip_routing_rule",
    args: { id: "rr1" },
    path: "video.deleteSIPInboundRoutingRule",
    payload: { id: "rr1" },
  },
];

export const platformCases: ToolCase[] = [
  { tool: "app_list_roles", args: {}, path: "listRoles", payload: undefined },
  {
    tool: "app_create_role",
    args: { name: "reviewer" },
    path: "createRole",
    payload: { name: "reviewer" },
  },
  {
    tool: "app_delete_role",
    args: { name: "reviewer" },
    path: "deleteRole",
    payload: { name: "reviewer" },
  },
  { tool: "app_list_permissions", args: {}, path: "listPermissions", payload: undefined },
  {
    tool: "app_get_permission",
    args: { id: "create-channel" },
    path: "getPermission",
    payload: { id: "create-channel" },
  },
  { tool: "app_list_push_providers", args: {}, path: "listPushProviders", payload: undefined },
  {
    tool: "app_upsert_push_provider",
    args: {
      type: "firebase",
      name: "fcm-main",
      firebase_credentials: "{}",
      disabled_at: "2026-09-01T15:00:00Z",
    },
    path: "upsertPushProvider",
    payload: {
      push_provider: {
        type: "firebase",
        name: "fcm-main",
        firebase_credentials: "{}",
        disabled_at: new Date("2026-09-01T15:00:00Z"),
      },
    },
  },
  {
    tool: "app_delete_push_provider",
    args: { type: "firebase", name: "fcm-main" },
    path: "deletePushProvider",
    payload: { type: "firebase", name: "fcm-main" },
  },
  {
    tool: "app_check_push",
    args: { user_id: "alice", skip_devices: true },
    path: "checkPush",
    payload: { user_id: "alice", skip_devices: true },
  },
  {
    tool: "app_verify_webhook",
    args: { raw_body: '{"type":"message.new"}', signature: "sig123" },
    path: "verifyWebhook",
    payload: ['{"type":"message.new"}', "sig123"],
    overrides: { verifyWebhook: true },
    assert: (_call, result) => {
      if ((result as { valid: boolean }).valid !== true) {
        throw new Error("expected valid=true");
      }
    },
  },
  {
    tool: "app_list_external_storage",
    args: {},
    path: "listExternalStorage",
    payload: undefined,
  },
  {
    tool: "app_create_external_storage",
    args: {
      name: "archive-s3",
      storage_type: "s3",
      bucket: "my-bucket",
      aws_s3: { s3_region: "us-east-1" },
    },
    path: "createExternalStorage",
    payload: {
      name: "archive-s3",
      storage_type: "s3",
      bucket: "my-bucket",
      aws_s3: { s3_region: "us-east-1" },
    },
  },
  {
    tool: "app_update_external_storage",
    args: { name: "archive-s3", storage_type: "s3", bucket: "my-bucket-2" },
    path: "updateExternalStorage",
    payload: { name: "archive-s3", storage_type: "s3", bucket: "my-bucket-2" },
  },
  {
    tool: "app_delete_external_storage",
    args: { name: "archive-s3" },
    path: "deleteExternalStorage",
    payload: { name: "archive-s3" },
  },
  {
    tool: "app_check_external_storage",
    args: { name: "archive-s3" },
    path: "checkExternalStorage",
    payload: { name: "archive-s3" },
  },
];

export const ALL_CASES: ToolCase[] = [
  ...tokenCases,
  ...userCases,
  ...deviceAndGroupCases,
  ...channelCases,
  ...messageCases,
  ...pollCases,
  ...chatAdminCases,
  ...commandAndBatchCases,
  ...moderationCases,
  ...moderationPolicyCases,
  ...callCases,
  ...participantCases,
  ...mediaCases,
  ...videoAdminCases,
  ...videoAnalyticsCases,
  ...appCases,
  ...platformCases,
];
