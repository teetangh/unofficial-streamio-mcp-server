import { describe, expect, it } from "vitest";
import { callTool } from "../helpers.js";
import { mockClient } from "../mock-client.js";

const CHANNEL = { channel_type: "messaging", channel_id: "general" };
const CALL = { call_type: "default", call_id: "standup" };

/** Cross-field rules that a per-field zod schema cannot express. */
const REJECTIONS: [string, Record<string, unknown>, RegExp][] = [
  ["chat_create_channel", { type: "messaging", created_by_id: "alice" }, /at least 2 members/],
  [
    "chat_create_channel",
    { type: "messaging", created_by_id: "alice", members: ["alice"] },
    /at least 2 members/,
  ],
  ["chat_update_channel", { ...CHANNEL }, /Nothing to do/],
  ["chat_update_channel", { ...CHANNEL, user_id: "alice" }, /Nothing to do/],
  ["chat_update_channel_data", { ...CHANNEL }, /`set` or `unset`/],
  [
    "chat_upsert_users",
    { users: [{ id: "alice" }, { id: "alice", name: "dup" }] },
    /Duplicate user id/,
  ],
  ["video_update_call", { ...CALL }, /Nothing to update/],
  ["video_update_call_members", { ...CALL }, /`update_members` or `remove_members`/],
  ["video_mute_users", { ...CALL, muted_by_id: "alice" }, /`user_ids` or `mute_all_users: true`/],
  [
    "video_mute_users",
    { ...CALL, muted_by_id: "alice", user_ids: [] },
    /`user_ids` or `mute_all_users: true`/,
  ],
];

describe("tool input rejections", () => {
  it.each(REJECTIONS)("%s rejects invalid combinations", async (tool, args, pattern) => {
    const mock = mockClient();
    await expect(callTool(tool, args, mock.client)).rejects.toThrow(pattern);
    expect(mock.calls.filter((call) => call.path !== "video.call")).toHaveLength(0);
  });
});
