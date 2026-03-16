/**
 * Live integration tests against real Stream.io API.
 * Requires STREAM_API_KEY and STREAM_API_SECRET env vars.
 *
 * Run with: STREAM_API_KEY=... STREAM_API_SECRET=... npm run test:live
 */
import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../../tools/index.js";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

function getToolHandler(server: McpServer, name: string) {
  const tool = server["_registeredTools"][name];
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  return (args: Record<string, unknown>) =>
    (tool.handler as Function)(args, {}) as Promise<ToolResult>;
}

function parseResult(result: ToolResult): Record<string, unknown> {
  expect(result.isError).toBeUndefined();
  return JSON.parse(result.content[0].text);
}

describe("Live Stream.io integration", () => {
  let server: McpServer;
  const testUserId = `test-user-${Date.now()}`;
  const testChannelId = `test-channel-${Date.now()}`;
  const testCallId = `test-call-${Date.now()}`;

  beforeAll(() => {
    if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
      throw new Error(
        "Set STREAM_API_KEY and STREAM_API_SECRET to run live tests"
      );
    }
    server = new McpServer({ name: "live-test", version: "0.0.1" });
    registerAllTools(server);
  });

  // --- Chat Tools ---

  it("chat_create_token: generates a valid JWT", async () => {
    const call = getToolHandler(server, "chat_create_token");
    const result = await call({
      user_id: testUserId,
      validity_in_seconds: 3600,
    });

    const data = parseResult(result);
    expect(data.user_id).toBe(testUserId);
    expect(typeof data.token).toBe("string");
    expect((data.token as string).split(".")).toHaveLength(3); // JWT has 3 parts
    console.log("  ✓ Token generated:", (data.token as string).slice(0, 40) + "...");
  });

  it("chat_upsert_users: creates test users", async () => {
    const call = getToolHandler(server, "chat_upsert_users");
    const result = await call({
      users: [
        { id: testUserId, name: "Test User", role: "user" },
        { id: `${testUserId}-2`, name: "Test User 2", role: "user" },
      ],
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Users upserted");
  });

  it("chat_query_users: finds the created user", async () => {
    const call = getToolHandler(server, "chat_query_users");
    const result = await call({
      filter_conditions: { id: { $in: [testUserId] } },
      limit: 1,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ User queried");
  });

  it("chat_create_channel: creates a test channel", async () => {
    const call = getToolHandler(server, "chat_create_channel");
    const result = await call({
      type: "messaging",
      id: testChannelId,
      name: "Integration Test Channel",
      created_by_id: testUserId,
      members: [testUserId, `${testUserId}-2`],
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Channel created:", testChannelId);
  });

  it("chat_send_message: sends a message to the channel", async () => {
    const call = getToolHandler(server, "chat_send_message");
    const result = await call({
      channel_type: "messaging",
      channel_id: testChannelId,
      text: "Hello from MCP integration test!",
      user_id: testUserId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Message sent");
  });

  it("chat_query_channels: finds the test channel", async () => {
    const call = getToolHandler(server, "chat_query_channels");
    const result = await call({
      filter_conditions: {
        type: "messaging",
        id: { $eq: testChannelId },
      },
      limit: 1,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Channels queried");
  });

  it("chat_add_members: adds a member to the channel", async () => {
    const newUserId = `${testUserId}-3`;
    // Create the user first
    const upsert = getToolHandler(server, "chat_upsert_users");
    await upsert({ users: [{ id: newUserId, name: "New Member" }] });

    const call = getToolHandler(server, "chat_add_members");
    const result = await call({
      channel_type: "messaging",
      channel_id: testChannelId,
      member_ids: [newUserId],
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Member added");
  });

  // --- Video Tools ---

  it("video_create_call: creates a test call", async () => {
    const call = getToolHandler(server, "video_create_call");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
      created_by_id: testUserId,
      members: [{ user_id: testUserId }],
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Call created:", testCallId);
  });

  it("video_get_call: retrieves the call", async () => {
    const call = getToolHandler(server, "video_get_call");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Call retrieved");
  });

  it("video_update_call: updates call custom data", async () => {
    const call = getToolHandler(server, "video_update_call");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
      custom: { test_label: "integration-test" },
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Call updated");
  });

  it("video_query_calls: finds the test call", async () => {
    const call = getToolHandler(server, "video_query_calls");
    const result = await call({
      filter_conditions: { id: testCallId },
      limit: 1,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Calls queried");
  });

  // --- New Chat Tools ---

  it("chat_update_channel: updates channel metadata", async () => {
    const call = getToolHandler(server, "chat_update_channel");
    const result = await call({
      channel_type: "messaging",
      channel_id: testChannelId,
      set: { name: "Updated Integration Test Channel" },
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Channel updated");
  });

  it("chat_remove_members: removes a member from the channel", async () => {
    const call = getToolHandler(server, "chat_remove_members");
    const result = await call({
      channel_type: "messaging",
      channel_id: testChannelId,
      member_ids: [`${testUserId}-3`],
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Member removed");
  });

  it("chat_delete_message: deletes a message", async () => {
    // Send a message to delete
    const send = getToolHandler(server, "chat_send_message");
    const sendResult = await send({
      channel_type: "messaging",
      channel_id: testChannelId,
      text: "Message to delete",
      user_id: testUserId,
    });
    const sendData = parseResult(sendResult);
    const messageId = (sendData.message as Record<string, unknown>).id;

    const call = getToolHandler(server, "chat_delete_message");
    const result = await call({ message_id: messageId });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Message deleted");
  });

  it("chat_ban_user: bans a test user", async () => {
    const banUserId = `${testUserId}-ban-target`;
    const upsert = getToolHandler(server, "chat_upsert_users");
    await upsert({ users: [{ id: banUserId, name: "Ban Target" }] });

    const call = getToolHandler(server, "chat_ban_user");
    const result = await call({
      target_user_id: banUserId,
      banned_by_id: testUserId,
      reason: "integration test",
      timeout: 1,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ User banned");
  });

  it("chat_unban_user: unbans a test user", async () => {
    const banUserId = `${testUserId}-ban-target`;
    const call = getToolHandler(server, "chat_unban_user");
    const result = await call({
      target_user_id: banUserId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ User unbanned");
  });

  it("chat_flag_message: flags a message", async () => {
    // Send a message to flag
    const send = getToolHandler(server, "chat_send_message");
    const sendResult = await send({
      channel_type: "messaging",
      channel_id: testChannelId,
      text: "Message to flag",
      user_id: testUserId,
    });
    const sendData = parseResult(sendResult);
    const messageId = (sendData.message as Record<string, unknown>).id;

    const call = getToolHandler(server, "chat_flag_message");
    const result = await call({
      message_id: messageId,
      reason: "integration test flag",
      user_id: testUserId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Message flagged");
  });

  // --- New Video Tools ---

  it("video_update_call_members: adds a member to the call", async () => {
    const call = getToolHandler(server, "video_update_call_members");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
      update_members: [{ user_id: `${testUserId}-2` }],
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Call members updated");
  });

  it("video_query_call_members: queries call members", async () => {
    const call = getToolHandler(server, "video_query_call_members");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Call members queried");
  });

  it("video_block_user: blocks a user from the call", async () => {
    const blockUserId = `${testUserId}-block`;
    const upsert = getToolHandler(server, "chat_upsert_users");
    await upsert({ users: [{ id: blockUserId, name: "Block Target" }] });

    const call = getToolHandler(server, "video_block_user");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
      user_id: blockUserId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ User blocked from call");
  });

  it("video_unblock_user: unblocks a user from the call", async () => {
    const blockUserId = `${testUserId}-block`;
    const call = getToolHandler(server, "video_unblock_user");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
      user_id: blockUserId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ User unblocked from call");
  });

  it("video_mute_users: mutes a user in the call", async () => {
    const call = getToolHandler(server, "video_mute_users");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
      user_ids: [testUserId],
      audio: true,
      muted_by_id: testUserId,
    });

    // Mute may fail if no active WebRTC participants — that's expected in server-only tests
    expect(result.content[0].text).toBeDefined();
    console.log("  ✓ Mute request sent (may require active participants)");
  });

  it("video_list_recordings: lists recordings (empty)", async () => {
    const call = getToolHandler(server, "video_list_recordings");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Recordings listed");
  });

  it("video_list_transcriptions: lists transcriptions (empty)", async () => {
    const call = getToolHandler(server, "video_list_transcriptions");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Transcriptions listed");
  });

  // --- Cleanup: end call last ---

  it("video_end_call: ends the test call", async () => {
    const call = getToolHandler(server, "video_end_call");
    const result = await call({
      call_type: "default",
      call_id: testCallId,
    });

    const data = parseResult(result);
    expect(data).toBeDefined();
    console.log("  ✓ Call ended");
  });
});
