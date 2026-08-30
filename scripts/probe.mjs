/**
 * Read-only connectivity probe. Calls every tool annotated `readOnlyHint`
 * against the configured Stream app and reports which succeed. Makes no
 * writes and creates nothing, so it is safe against a production app.
 *
 *   npm run build && npm run probe
 *
 * Fixtures (a channel, a call, a user, a message) are discovered from the app
 * itself; tools with no available fixture are reported as SKIP.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(ROOT, "build", "server.js"))) {
  console.error("build/ is missing — run `npm run build` first.");
  process.exit(1);
}
if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
  console.error("Set STREAM_API_KEY and STREAM_API_SECRET first.");
  process.exit(1);
}

const { createServer } = await import(new URL("../build/server.js", import.meta.url));

process.env.STREAM_MCP_READ_ONLY = "true";
const { server } = createServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "probe", version: "0.0.0" });
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.map((entry) => entry.text).join("\n");
  return { isError: Boolean(result.isError), text };
}

async function firstOf(name, args, pick) {
  const result = await call(name, { ...args, verbose: true });
  if (result.isError) return null;
  try {
    return pick(JSON.parse(result.text)) ?? null;
  } catch {
    return null;
  }
}

const channel = await firstOf("chat_query_channels", { limit: 1 }, (d) => d.channels?.[0]?.channel);
const aCall = await firstOf("video_query_calls", { limit: 1 }, (d) => d.calls?.[0]?.call);
const user = await firstOf("chat_query_users", { limit: 1 }, (d) => d.users?.[0]);
const message = channel
  ? await firstOf(
      "chat_get_channel",
      { channel_type: channel.type, channel_id: channel.id, message_limit: 1 },
      (d) => d.messages?.[0]
    )
  : null;

console.log(
  `Fixtures — channel: ${channel?.cid ?? "none"}, call: ${aCall?.cid ?? "none"}, ` +
    `user: ${user?.id ?? "none"}, message: ${message?.id ?? "none"}\n`
);

const channelRef = channel && { channel_type: channel.type, channel_id: channel.id };
const callRef = aCall && { call_type: aCall.type, call_id: aCall.id };

const ARGS = {
  chat_get_channel: channelRef && { ...channelRef, message_limit: 2 },
  chat_query_channels: { limit: 2 },
  chat_query_members: channelRef && { ...channelRef, limit: 2 },
  chat_get_message: message && { message_id: message.id },
  chat_get_many_messages: channelRef && message && { ...channelRef, message_ids: [message.id] },
  chat_get_replies: message && { parent_message_id: message.id, limit: 2 },
  chat_get_pinned_messages: channelRef && { ...channelRef, limit: 2 },
  chat_get_reactions: message && { message_id: message.id },
  chat_get_thread: message?.reply_count ? { parent_message_id: message.id } : null,
  chat_query_threads: user && { user_id: user.id, limit: 2 },
  chat_search_messages: channel && {
    filter_conditions: { cid: channel.cid },
    query: "a",
    limit: 2,
  },
  chat_unread_counts: user && { user_id: user.id },
  chat_query_users: { limit: 2 },
  chat_list_channel_types: {},
  chat_get_channel_type: { name: "messaging" },
  users_get_blocked: user && { user_id: user.id },
  users_export: user && { user_id: user.id },
  moderation_query_banned_users: { limit: 2 },
  moderation_query_flags: { limit: 2 },
  moderation_query_review_queue: { limit: 2 },
  moderation_query_logs: { limit: 2 },
  moderation_check: user && {
    entity_id: "probe",
    entity_creator_id: user.id,
    text: "hello",
    test_mode: true,
  },
  moderation_list_blocklists: {},
  video_get_call: callRef,
  video_query_calls: { limit: 2 },
  video_query_call_members: callRef && { ...callRef, limit: 2 },
  video_query_call_participants: callRef && user && { ...callRef, user_ids: [user.id] },
  video_list_recordings: callRef,
  video_list_transcriptions: callRef,
  video_get_call_report: aCall?.session ? callRef : null,
  video_query_call_stats: { limit: 2 },
  video_get_edges: {},
  video_list_call_types: {},
  video_get_call_type: { name: "default" },
  app_get_settings: {},
  app_get_rate_limits: { server_side: true },
};

const { tools } = await client.listTools();
const pad = (value, width) => String(value).padEnd(width);
let ok = 0;
let failed = 0;
let skipped = 0;

for (const tool of tools) {
  const args = ARGS[tool.name];
  if (args === undefined || args === null) {
    skipped += 1;
    console.log(`${pad("SKIP", 6)} ${pad(tool.name, 34)} no fixture available`);
    continue;
  }
  const result = await call(tool.name, args);
  if (result.isError) {
    failed += 1;
    console.log(`${pad("FAIL", 6)} ${pad(tool.name, 34)} ${result.text.split("\n")[0]}`);
  } else {
    ok += 1;
    console.log(`${pad("OK", 6)} ${pad(tool.name, 34)} ${result.text.length} bytes`);
  }
}

console.log(`\n${ok} ok, ${failed} failed, ${skipped} skipped`);
await client.close();
process.exit(failed > 0 ? 1 : 0);
