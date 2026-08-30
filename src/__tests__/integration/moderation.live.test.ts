import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, hasCredentials, LiveHarness } from "./harness.js";

const suite = hasCredentials ? describe : describe.skip;

/**
 * Errors that mean the request itself was malformed. Probes for endpoints that
 * need a live participant must reject these: the point of those probes is that
 * a wrong field shows up here rather than as a backend state error.
 */
const SCHEMA_ERROR =
  /404 |Invalid input|is a required field|unknown field|cannot be blank|must be provided/i;

suite("live: moderation, users and app", () => {
  const harness = new LiveHarness();
  const moderator = fixtureId("mod");
  const offender = fixtureId("offender");
  const channelId = fixtureId("modchannel");
  const channel = { channel_type: "messaging", channel_id: channelId };
  let messageId: string;

  beforeAll(async () => {
    await harness.connect();
    await harness.call("chat_upsert_users", {
      users: [
        { id: moderator, name: "MCP Test Moderator", role: "admin" },
        { id: offender, name: "MCP Test Offender", role: "user" },
      ],
    });
    harness.trackUsers(moderator, offender);

    await harness.call("chat_create_channel", {
      type: "messaging",
      id: channelId,
      created_by_id: moderator,
      members: [moderator, offender],
    });
    harness.deleteChannelOnCleanup("messaging", channelId);

    const sent = await harness.call("chat_send_message", {
      ...channel,
      text: "message under review",
      user_id: offender,
    });
    messageId = sent.message.id;
  }, 60_000);

  afterAll(async () => {
    await harness.teardown();
  }, 60_000);

  it("bans and unbans a user", async () => {
    await harness.call("moderation_ban_user", {
      target_user_id: offender,
      banned_by_id: moderator,
      reason: "mcp live test",
      timeout: 1,
    });

    const banned = await harness.call("moderation_query_banned_users", {
      filter_conditions: { user_id: { $eq: offender } },
    });
    expect(banned.bans.length).toBeGreaterThan(0);

    await harness.call("moderation_unban_user", {
      target_user_id: offender,
      unbanned_by_id: moderator,
    });
  });

  it("mutes and unmutes a user", async () => {
    const muted = await harness.call("moderation_mute_user", {
      user_id: moderator,
      target_ids: [offender],
    });
    expect(muted.mutes ?? muted.mute).toBeDefined();

    await harness.call("moderation_unmute_user", {
      user_id: moderator,
      target_ids: [offender],
    });
  });

  it("flags a message and finds it in the review queue", { timeout: 20_000 }, async () => {
    const flagged = await harness.call("moderation_flag_message", {
      entity_id: messageId,
      user_id: moderator,
      entity_creator_id: offender,
      reason: "spam",
    });
    expect(flagged.item_id ?? flagged.duration).toBeDefined();

    const queue = await harness.call("moderation_query_review_queue", { limit: 10 });
    expect(Array.isArray(queue.items)).toBe(true);
  });

  it("submits an action on a review queue item", { timeout: 30_000 }, async () => {
    const queue = await harness.call("moderation_query_review_queue", { limit: 10 });
    const item = queue.items?.[0];
    if (!item) {
      // Nothing queued on this app; still prove the endpoint accepts our shape.
      const result = await harness.callEither("moderation_submit_action", {
        item_id: "no-such-item",
        action_type: "mark_reviewed",
        user_id: moderator,
      });
      expect(result.text).not.toMatch(SCHEMA_ERROR);
      return;
    }

    const result = await harness.callEither("moderation_submit_action", {
      item_id: item.id,
      action_type: "mark_reviewed",
      user_id: moderator,
    });
    expect(result.text).not.toMatch(SCHEMA_ERROR);
  });

  it("queries moderation flags and logs", async () => {
    const flags = await harness.call("moderation_query_flags", { limit: 5 });
    expect(Array.isArray(flags.flags ?? flags.items)).toBe(true);

    const logs = await harness.call("moderation_query_logs", { limit: 5 });
    expect(Array.isArray(logs.logs ?? logs.items)).toBe(true);
  });

  it("checks text against the moderation policy", async () => {
    const result = await harness.call("moderation_check", {
      entity_id: messageId,
      entity_creator_id: offender,
      text: "hello world",
      test_mode: true,
    });
    expect(result.recommended_action ?? result.status ?? result.duration).toBeDefined();
  });

  it("manages a blocklist", { timeout: 30_000 }, async () => {
    const name = fixtureId("blocklist");
    await harness.call("moderation_create_blocklist", { name, words: ["mcptestword"] });
    harness.onCleanup(() => harness.call("moderation_delete_blocklist", { name }));

    const fetched = await harness.call("moderation_get_blocklist", { name });
    expect(fetched.blocklist.words).toContain("mcptestword");

    await harness.call("moderation_update_blocklist", { name, words: ["mcptestword2"] });

    const listed = await harness.call("moderation_list_blocklists", {});
    expect(listed.blocklists.some((entry: any) => entry.name === name)).toBe(true);
  });

  it("blocks and unblocks between users", async () => {
    await harness.call("users_block", { user_id: moderator, blocked_user_id: offender });

    const blocked = await harness.call("users_get_blocked", { user_id: moderator });
    expect(blocked.blocks.some((b: any) => b.blocked_user_id === offender)).toBe(true);

    await harness.call("users_unblock", { user_id: moderator, blocked_user_id: offender });
  });

  it("deactivates and reactivates a user", async () => {
    const temp = fixtureId("temp");
    await harness.call("chat_upsert_users", { users: [{ id: temp, name: "Temp" }] });
    harness.trackUsers(temp);

    const deactivated = await harness.call("users_deactivate", { user_id: temp });
    expect(deactivated.user.deactivated_at).toBeDefined();

    const reactivated = await harness.call("users_reactivate", { user_id: temp });
    expect(reactivated.user.id).toBe(temp);
  });

  it("updates a user partially", async () => {
    const result = await harness.call("users_update_partial", {
      users: [{ id: offender, set: { name: "Renamed Offender" } }],
    });
    expect(result.users[offender].name).toBe("Renamed Offender");
  });

  it("creates a guest user", async () => {
    const guestId = fixtureId("guestuser");
    const result = await harness.call("users_create_guest", { id: guestId, name: "Guest" });
    harness.trackUsers(result.user.id);
    expect(result.user.role).toBe("guest");
  });

  it("reads app settings, rate limits and channel/call types", async () => {
    const app = await harness.call("app_get_settings");
    expect(app.app.name).toBeDefined();

    const limits = await harness.call("app_get_rate_limits", { server_side: true });
    expect(limits.server_side).toBeDefined();

    // A named endpoint must come back whether or not its quota has been used;
    // untouched is the normal case, and it used to return nothing.
    const named = await harness.call("app_get_rate_limits", {
      server_side: true,
      endpoints: "UpdateChannelPartial,NoSuchEndpointXYZ",
    });
    expect(named.server_side.limits.UpdateChannelPartial.limit).toBeGreaterThan(0);
    expect(named.unmatched_endpoints).toEqual(["NoSuchEndpointXYZ"]);

    const channelTypes = await harness.call("chat_list_channel_types");
    expect(channelTypes.channel_types.map((t: any) => t.name)).toContain("messaging");

    const messaging = await harness.call("chat_get_channel_type", { name: "messaging" });
    expect(messaging.name).toBe("messaging");

    const callTypes = await harness.call("video_list_call_types");
    expect(callTypes.call_types.map((t: any) => t.name)).toContain("default");

    const defaultCallType = await harness.call("video_get_call_type", { name: "default" });
    expect(defaultCallType.name).toBe("default");
    // Grants are the reason to read a call type, and they are a NOISE_KEY —
    // any shrink-based compaction would delete them.
    expect(Object.keys(defaultCallType.grants).length).toBeGreaterThan(0);
    expect(defaultCallType.settings.backstage).toBeDefined();
    expect(defaultCallType.settings.recording.layout.options.count).toBeGreaterThan(0);
    expect(defaultCallType.settings.recording.layout.options.keys).toBeUndefined();
    // The whole payload used to be ~13.8KB, most of it layout styling.
    expect(JSON.stringify(defaultCallType).length).toBeLessThan(8000);

    const edges = await harness.call("video_get_edges");
    expect(edges.edges.length).toBeGreaterThan(0);
  });

  it("exports a channel and polls the task", async () => {
    const started = await harness.call("chat_export_channels", {
      channel_cids: [`messaging:${channelId}`],
    });
    expect(started.task_id).toBeDefined();

    const task = await harness.call("app_get_task", { task_id: started.task_id });
    expect(task.status).toBeDefined();
  });

  it("exports a user", async () => {
    const result = await harness.call("users_export", { user_id: offender });
    expect(result.user.id).toBe(offender);
  });

  it("deletes the flagged message", async () => {
    const result = await harness.call("chat_delete_message", { message_id: messageId, hard: true });
    expect(result.message.id).toBe(messageId);
  });
});
