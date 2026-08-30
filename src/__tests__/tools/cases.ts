import type { RecordedCall } from "../mock-client.js";

export interface ToolCase {
  /** Tool name as registered. */
  tool: string;
  /** Arguments the tool is invoked with. */
  args: Record<string, unknown>;
  /** Expected `<namespace>.<method>` on the SDK client. */
  path: string;
  /** Exact payload the SDK method must receive. */
  payload?: unknown;
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
    tool: "chat_delete_message",
    args: { message_id: "m1", hard: true },
    path: "chat.deleteMessage",
    payload: { id: "m1", hard: true },
  },
];

export const chatAdminCases: ToolCase[] = [];

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
    tool: "video_query_calls",
    args: { filter_conditions: { ongoing: { $eq: true } } },
    path: "video.queryCalls",
    payload: { filter_conditions: { ongoing: { $eq: true } }, limit: 10 },
  },
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
];

export const videoAdminCases: ToolCase[] = [];

export const appCases: ToolCase[] = [];

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
