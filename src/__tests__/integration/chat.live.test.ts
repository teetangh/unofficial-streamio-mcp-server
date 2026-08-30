import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, hasCredentials, LiveHarness } from "./harness.js";

const suite = hasCredentials ? describe : describe.skip;

suite("live: chat and moderation", () => {
  const harness = new LiveHarness();
  const alice = fixtureId("alice");
  const bob = fixtureId("bob");
  const carol = fixtureId("carol");
  const channelId = fixtureId("channel");
  const channel = { channel_type: "messaging", channel_id: channelId };

  let messageId: string;

  beforeAll(async () => {
    await harness.connect();
    harness.deleteUsersOnCleanup([alice, bob, carol]);
    harness.deleteChannelOnCleanup("messaging", channelId);
  }, 60_000);

  afterAll(async () => {
    await harness.teardown();
  }, 60_000);

  it("creates users", async () => {
    const result = await harness.call("chat_upsert_users", {
      users: [
        { id: alice, name: "MCP Test Alice", role: "admin" },
        { id: bob, name: "MCP Test Bob", role: "user" },
        { id: carol, name: "MCP Test Carol", role: "user" },
      ],
    });
    expect(Object.keys(result.users)).toHaveLength(3);
  });

  it("mints a user token", async () => {
    const result = await harness.call("chat_create_token", {
      user_id: alice,
      validity_in_seconds: 300,
    });
    expect(result.token.split(".")).toHaveLength(3);
    expect(result.expires_in_seconds).toBe(300);
  });

  it("queries users", async () => {
    const result = await harness.call("chat_query_users", {
      filter_conditions: { id: { $in: [alice, bob] } },
    });
    expect(result.users).toHaveLength(2);
  });

  it("creates a channel and keeps its name", async () => {
    const result = await harness.call("chat_create_channel", {
      type: "messaging",
      id: channelId,
      created_by_id: alice,
      name: "MCP Test Channel",
      members: [alice, bob],
    });

    expect(result.channel.cid).toBe(`messaging:${channelId}`);
    // Regression: `name` used to be sent at the top of `data` and dropped.
    expect(result.channel.custom.name).toBe("MCP Test Channel");
    expect(result.members).toHaveLength(2);
  });

  it("sends a message", async () => {
    const result = await harness.call("chat_send_message", {
      ...channel,
      text: "Hello from the MCP live suite",
      user_id: alice,
    });
    messageId = result.message.id;
    expect(result.message.text).toBe("Hello from the MCP live suite");
    expect(result.message.user.id).toBe(alice);
  });

  it("finds the channel and its message by query", async () => {
    const result = await harness.call("chat_query_channels", {
      filter_conditions: { cid: `messaging:${channelId}` },
      message_limit: 10,
    });
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].message_count).toBeGreaterThan(0);
  });

  it("renames the channel", async () => {
    const result = await harness.call("chat_update_channel_data", {
      ...channel,
      set: { name: "Renamed by MCP" },
    });
    expect(result.channel.custom.name).toBe("Renamed by MCP");
  });

  it("adds and removes members", async () => {
    const added = await harness.call("chat_add_members", {
      ...channel,
      member_ids: [carol],
    });
    expect(added.members.map((m: any) => m.user_id)).toContain(carol);

    const removed = await harness.call("chat_remove_members", {
      ...channel,
      member_ids: [carol],
    });
    expect(removed.members.map((m: any) => m.user_id)).not.toContain(carol);
  });

  it("promotes and demotes a moderator", async () => {
    const promoted = await harness.call("chat_update_channel", {
      ...channel,
      add_moderators: [bob],
      user_id: alice,
    });
    expect(promoted.members.find((m: any) => m.user_id === bob)?.channel_role).toBe(
      "channel_moderator"
    );

    await harness.call("chat_update_channel", {
      ...channel,
      demote_moderators: [bob],
      user_id: alice,
    });
  });

  it("rejects an update that would change nothing", async () => {
    const error = await harness.callExpectingError("chat_update_channel", {
      ...channel,
      user_id: alice,
    });
    expect(error).toMatch(/Nothing to do/);
    expect(error).toMatch(/chat_update_channel_data/);
  });

  it("flags a message for moderation", async () => {
    const result = await harness.call("moderation_flag_message", {
      entity_id: messageId,
      user_id: alice,
      entity_creator_id: alice,
      reason: "mcp live test",
    });
    expect(result.item_id ?? result.duration).toBeDefined();
  });

  it("bans and unbans a user", async () => {
    await harness.call("moderation_ban_user", {
      target_user_id: bob,
      banned_by_id: alice,
      reason: "mcp live test",
      timeout: 1,
    });

    await harness.call("moderation_unban_user", {
      target_user_id: bob,
      unbanned_by_id: alice,
      banned_by_id: alice,
    });
  });

  it("deletes the message", async () => {
    const result = await harness.call("chat_delete_message", {
      message_id: messageId,
      hard: true,
    });
    expect(result.message.id).toBe(messageId);
  });
});
