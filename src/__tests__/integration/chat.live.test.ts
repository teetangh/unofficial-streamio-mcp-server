import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, hasCredentials, LiveHarness } from "./harness.js";

const suite = hasCredentials ? describe : describe.skip;

suite("live: chat", () => {
  const harness = new LiveHarness();
  const alice = fixtureId("alice");
  const bob = fixtureId("bob");
  const channelId = fixtureId("channel");
  const channel = { channel_type: "messaging", channel_id: channelId };

  let messageId: string;
  let replyId: string;

  beforeAll(async () => {
    await harness.connect();

    await harness.call("chat_upsert_users", {
      users: [
        { id: alice, name: "MCP Test Alice", role: "admin" },
        { id: bob, name: "MCP Test Bob", role: "user" },
      ],
    });
    harness.trackUsers(alice, bob);
  }, 60_000);

  afterAll(async () => {
    await harness.teardown();
  }, 60_000);

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

  it("creates a channel with a name", async () => {
    const result = await harness.call("chat_create_channel", {
      type: "messaging",
      id: channelId,
      created_by_id: alice,
      name: "MCP Test Channel",
      members: [alice, bob],
    });
    harness.deleteChannelOnCleanup("messaging", channelId);

    expect(result.channel.cid).toBe(`messaging:${channelId}`);
    // Regression: `name` used to be sent at the top level of `data` and dropped.
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
  });

  it("reads the channel back including its messages", async () => {
    const result = await harness.call("chat_get_channel", { ...channel, message_limit: 10 });
    expect(result.messages.map((m: any) => m.id)).toContain(messageId);
  });

  it("gets a single message", async () => {
    const result = await harness.call("chat_get_message", { message_id: messageId });
    expect(result.message.id).toBe(messageId);
  });

  it("gets several messages at once", async () => {
    const result = await harness.call("chat_get_many_messages", {
      ...channel,
      message_ids: [messageId],
    });
    expect(result.messages).toHaveLength(1);
  });

  it("replies in a thread and reads the replies", async () => {
    const reply = await harness.call("chat_send_message", {
      ...channel,
      text: "Threaded reply",
      user_id: bob,
      parent_id: messageId,
    });
    replyId = reply.message.id;

    const replies = await harness.call("chat_get_replies", { parent_message_id: messageId });
    expect(replies.messages.map((m: any) => m.id)).toContain(replyId);
  });

  it("gets the thread", async () => {
    const result = await harness.call("chat_get_thread", { parent_message_id: messageId });
    expect(result.thread.parent_message_id).toBe(messageId);
  });

  it("queries threads for a user", async () => {
    const result = await harness.call("chat_query_threads", { user_id: alice });
    expect(Array.isArray(result.threads)).toBe(true);
  });

  it("adds and removes a reaction", async () => {
    const added = await harness.call("chat_send_reaction", {
      message_id: messageId,
      type: "like",
      user_id: bob,
    });
    expect(added.reaction.type).toBe("like");

    const listed = await harness.call("chat_get_reactions", { message_id: messageId });
    expect(listed.reactions).toHaveLength(1);

    const removed = await harness.call("chat_delete_reaction", {
      message_id: messageId,
      type: "like",
      user_id: bob,
    });
    expect(removed.reaction.type).toBe("like");
  });

  it("edits a message fully and partially", async () => {
    const full = await harness.call("chat_update_message", {
      message_id: messageId,
      text: "Edited by the live suite",
      user_id: alice,
    });
    expect(full.message.text).toBe("Edited by the live suite");

    const partial = await harness.call("chat_update_message_partial", {
      message_id: messageId,
      set: { text: "Partially edited" },
      user_id: alice,
    });
    expect(partial.message.text).toBe("Partially edited");
  });

  it("translates a message", async () => {
    const result = await harness.call("chat_translate_message", {
      message_id: messageId,
      language: "es",
    });
    expect(result.message.i18n).toBeDefined();
  });

  it("pins a message and lists pinned messages", async () => {
    await harness.call("chat_update_message_partial", {
      message_id: messageId,
      set: { pinned: true },
      user_id: alice,
    });

    const pinned = await harness.call("chat_get_pinned_messages", channel);
    expect(pinned.pinned_messages.map((m: any) => m.id)).toContain(messageId);
  });

  it("searches messages", async () => {
    const result = await harness.call("chat_search_messages", {
      filter_conditions: { cid: `messaging:${channelId}` },
      query: "Partially",
    });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("queries channels", async () => {
    const result = await harness.call("chat_query_channels", {
      filter_conditions: { cid: `messaging:${channelId}` },
    });
    expect(result.channels).toHaveLength(1);
  });

  it("queries channel members", async () => {
    const result = await harness.call("chat_query_members", {
      ...channel,
      filter_conditions: { id: { $in: [bob] } },
    });
    expect(result.members).toHaveLength(1);
  });

  it("updates channel data", async () => {
    const result = await harness.call("chat_update_channel_data", {
      ...channel,
      set: { name: "Renamed by MCP" },
    });
    expect(result.channel.custom.name).toBe("Renamed by MCP");
  });

  it("updates a member", async () => {
    const result = await harness.call("chat_update_member", {
      ...channel,
      user_id: bob,
      set: { nickname: "Bobby" },
    });
    expect(result.channel_member.custom.nickname).toBe("Bobby");
  });

  it("adds and removes members", async () => {
    const carol = fixtureId("carol");
    await harness.call("chat_upsert_users", { users: [{ id: carol, name: "Carol" }] });
    harness.trackUsers(carol);

    const added = await harness.call("chat_add_members", { ...channel, member_ids: [carol] });
    expect(added.members.map((m: any) => m.user_id)).toContain(carol);

    const removed = await harness.call("chat_remove_members", { ...channel, member_ids: [carol] });
    expect(removed.members.map((m: any) => m.user_id)).not.toContain(carol);
  });

  it("hides and shows a channel", async () => {
    await harness.call("chat_hide_channel", { ...channel, user_id: bob });
    const shown = await harness.call("chat_show_channel", { ...channel, user_id: bob });
    expect(shown.duration).toBeDefined();
  });

  it("mutes and unmutes a channel", async () => {
    const muted = await harness.call("chat_mute_channel", {
      user_id: bob,
      channel_cids: [`messaging:${channelId}`],
    });
    expect(muted.channel_mute.channel.id).toBe(channelId);

    await harness.call("chat_unmute_channel", {
      user_id: bob,
      channel_cids: [`messaging:${channelId}`],
    });
  });

  it("marks read and unread and reports counts", async () => {
    await harness.call("chat_mark_read", { ...channel, user_id: bob });
    await harness.call("chat_mark_unread", { ...channel, user_id: bob, message_id: messageId });
    const counts = await harness.call("chat_unread_counts", { user_id: bob });
    expect(counts.total_unread_count).toBeGreaterThanOrEqual(0);
  });

  it("sends a custom channel event", async () => {
    const result = await harness.call("chat_send_event", {
      ...channel,
      event_type: "mcp_test",
      user_id: alice,
    });
    expect(result.event.type).toBe("mcp_test");
  });

  it("deletes and undeletes a message", async () => {
    const deleted = await harness.call("chat_delete_message", { message_id: replyId });
    expect(deleted.message.id).toBe(replyId);

    const restored = await harness.call("chat_undelete_message", {
      message_id: replyId,
      undeleted_by: alice,
    });
    expect(restored.message.id).toBe(replyId);
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

  it("deletes a throwaway channel", async () => {
    const throwaway = fixtureId("delchannel");
    await harness.call("chat_create_channel", {
      type: "messaging",
      id: throwaway,
      created_by_id: alice,
    });
    const result = await harness.call("chat_delete_channel", {
      channel_type: "messaging",
      channel_id: throwaway,
      hard_delete: true,
    });
    expect(result.channel?.id ?? result.duration).toBeDefined();
  });

  it("soft-deletes and restores a user", { timeout: 60_000 }, async () => {
    const doomed = fixtureId("doomed");
    await harness.call("chat_upsert_users", { users: [{ id: doomed, name: "Doomed" }] });
    harness.trackUsers(doomed);

    const deleted = await harness.call("users_delete", { user_ids: [doomed], user: "soft" });
    expect(deleted.task_id).toBeDefined();

    // Deletion is asynchronous. Falling through a still-running task would
    // make the restore below fail intermittently, so require a terminal state.
    let status: string | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const task = await harness.call("app_get_task", { task_id: deleted.task_id });
      status = task.status;
      if (status !== "pending" && status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(status, "delete task did not reach a terminal state").toBe("completed");

    const restored = await harness.call("users_restore", { user_ids: [doomed] });
    expect(restored.duration).toBeDefined();
  });

  it("truncates the channel", async () => {
    await harness.call("chat_truncate_channel", { ...channel, user_id: alice });
    const after = await harness.call("chat_get_channel", channel);
    expect(after.messages).toHaveLength(0);
  });
});
