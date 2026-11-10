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
  // `user_id` is attribution only and must not satisfy the guard.
  ["chat_update_channel", { ...CHANNEL, user_id: "alice" }, /Nothing to do/],
  ["chat_update_channel_data", { ...CHANNEL }, /`set` or `unset`/],
  // Stream rejects a system message with no acting user, and its error names
  // neither the field nor why.
  [
    "chat_truncate_channel",
    { ...CHANNEL, system_message: "cleared" },
    /`system_message` is posted by a user/,
  ],
  // A deactivated-user scan pages by id, so offset and sort cannot apply.
  ["chat_query_users", { deactivated_only: true, offset: 10 }, /pages by ascending user id/],
  ["chat_query_users", { deactivated_only: true, sort: [{ field: "id" }] }, /ascending user id/],
  [
    "chat_query_users",
    { deactivated_only: true, filter_conditions: { id: { $in: ["alice"] } } },
    /`filter_conditions.id` cannot be set/,
  ],
  ["chat_update_member", { ...CHANNEL, user_id: "bob" }, /`set` or `unset`/],
  ["chat_update_message_partial", { message_id: "m1" }, /`set` or `unset`/],
  [
    "chat_search_messages",
    { filter_conditions: { type: "messaging" } },
    /`query` or `message_filter_conditions`/,
  ],
  [
    "chat_search_messages",
    { filter_conditions: {}, query: "x", offset: 1, next: "cursor" },
    /`offset` or `next`/,
  ],
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
  [
    "video_update_user_permissions",
    { ...CALL, user_id: "bob" },
    /`grant_permissions` or `revoke_permissions`/,
  ],
  ["video_update_call_type", { name: "webinar" }, /Nothing to update/],
  ["video_query_call_participants", { ...CALL }, /`user_ids` and\/or `published_tracks`/],
  ["moderation_update_blocklist", { name: "custom" }, /Nothing to update/],
  // `team` scopes the target blocklist; it is not itself a change.
  ["moderation_update_blocklist", { name: "custom", team: "eng" }, /Nothing to update/],
  ["chat_update_poll_partial", { poll_id: "p1", user_id: "alice" }, /`set` or `unset`/],
  [
    "chat_cast_poll_vote",
    { message_id: "m1", poll_id: "p1", user_id: "alice" },
    /`option_id` or `answer_text`/,
  ],
  ["users_update_group", { id: "g1" }, /`name` or `description`/],
  [
    "video_create_sip_routing_rule",
    { name: "inbound", trunk_ids: ["tr1"], caller_configs: { id: "{{sip.from.user}}" } },
    /`direct_routing_configs` or `pin_routing_configs`/,
  ],
  ["app_query_team_usage_stats", { month: "2026-09", start_date: "2026-09-01" }, /not both/],
  ["app_query_team_usage_stats", { start_date: "2026-09-01" }, /together/],
  ["app_query_team_usage_stats", { team: "", next: "c1" }, /cannot be combined/],
  ["app_check_sqs", { sqs_secret: "s" }, /Pass `sqs_url`/],
  ["app_check_sns", { sns_key: "k" }, /Pass `sns_topic_arn`/],
  [
    "moderation_query_future_channel_bans",
    {},
    /`user_id` \(the banning user\) or `target_user_id`/,
  ],
  ["moderation_create_policy_test_set", { name: "neither" }, /exactly one of `rows` or `seed`/],
  [
    "moderation_create_policy_test_set",
    { name: "both", rows: [{ text: "hi" }], seed: { limit: 5 } },
    /exactly one of `rows` or `seed`/,
  ],
  [
    // Stream enforces the same rule on update (verified live).
    "video_update_sip_routing_rule",
    {
      id: "rr1",
      name: "inbound",
      trunk_ids: ["tr1"],
      caller_configs: { id: "{{sip.from.user}}" },
    },
    /`direct_routing_configs` or `pin_routing_configs`/,
  ],
];

describe("tool input rejections", () => {
  it.each(REJECTIONS)("%s rejects invalid combinations", async (tool, args, pattern) => {
    const mock = mockClient();
    await expect(callTool(tool, args, mock.client)).rejects.toThrow(pattern);
    expect(mock.calls.filter((call) => call.path !== "video.call")).toHaveLength(0);
  });
});

describe("webhook target checks", () => {
  // Seen live: with no target and nothing saved, Stream answers status "ok".
  it.each([
    ["app_check_sqs", { app: { sqs_url: "", event_hooks: [] } }],
    ["app_check_sns", { app: { sns_topic_arn: "", event_hooks: [{ sns_topic_arn: "" }] } }],
  ])("%s refuses instead of reporting a false ok when nothing is saved", async (tool, app) => {
    const mock = mockClient({ getApp: app });
    await expect(callTool(tool, {}, mock.client)).rejects.toThrow(/nothing to check/);
    expect(mock.calls.map((call) => call.path)).toEqual(["getApp"]);
  });
});
