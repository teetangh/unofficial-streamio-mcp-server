import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { ALL_TOOLS } from "../tools/registry.js";

const ENV_KEYS = [
  "STREAM_API_KEY",
  "STREAM_API_SECRET",
  "STREAM_MCP_TOOLSETS",
  "STREAM_MCP_READ_ONLY",
] as const;

let saved: Record<string, string | undefined>;

async function connect() {
  const { server, toolCount } = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, toolCount };
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.STREAM_API_KEY = "test-key";
  process.env.STREAM_API_SECRET = "test-secret";
  delete process.env.STREAM_MCP_TOOLSETS;
  delete process.env.STREAM_MCP_READ_ONLY;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("MCP server", () => {
  it("lists every tool plus its aliases", async () => {
    const { client, toolCount } = await connect();
    const { tools } = await client.listTools();

    const aliasCount = ALL_TOOLS.reduce((sum, tool) => sum + (tool.aliases?.length ?? 0), 0);
    expect(toolCount).toBe(ALL_TOOLS.length);
    expect(tools.length).toBe(ALL_TOOLS.length + aliasCount);
    await client.close();
  });

  it("exposes a valid object input schema and annotations on every tool", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(tool.annotations, tool.name).toBeDefined();
      // `verbose` is injected by registerTool for every tool.
      expect(Object.keys(tool.inputSchema.properties ?? {}), tool.name).toContain("verbose");
    }
    await client.close();
  });

  it("rejects arguments that fail schema validation", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "video_start_recording",
      arguments: { call_type: "default", call_id: "c1", recording_type: "audio_and_video" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/recording_type/);
    await client.close();
  });

  it("rejects a sort direction that is not 1 or -1", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "video_query_calls",
      arguments: { sort: [{ field: "created_at", direction: 0 }] },
    });

    expect(result.isError).toBe(true);
    await client.close();
  });

  it("rejects a limit above the documented cap", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "chat_query_channels",
      arguments: { limit: 500 },
    });

    expect(result.isError).toBe(true);
    await client.close();
  });

  it("returns a tool error rather than throwing when credentials are missing", async () => {
    delete process.env.STREAM_API_KEY;
    delete process.env.STREAM_API_SECRET;
    const { resetClient } = await import("../clients/index.js");
    resetClient();

    const { client } = await connect();
    const result = await client.callTool({
      name: "chat_create_token",
      arguments: { user_id: "alice" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/STREAM_API_KEY/);
    await client.close();
    resetClient();
  });

  it("registers only the selected toolsets", async () => {
    process.env.STREAM_MCP_TOOLSETS = "app";
    const { client, toolCount } = await connect();
    const { tools } = await client.listTools();

    expect(toolCount).toBe(ALL_TOOLS.filter((tool) => tool.toolset === "app").length);
    expect(tools.every((tool) => tool.name.startsWith("app_"))).toBe(true);
    await client.close();
  });

  it("registers only read-only tools in read-only mode", async () => {
    process.env.STREAM_MCP_READ_ONLY = "true";
    const { client } = await connect();
    const { tools } = await client.listTools();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.some((tool) => tool.name === "chat_delete_message")).toBe(false);
    await client.close();
  });

  it("serves a working tool call end to end", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "chat_create_token",
      arguments: { user_id: "alice", validity_in_seconds: 120 },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content as { text: string }[])[0].text);
    expect(payload.user_id).toBe("alice");
    expect(payload.expires_in_seconds).toBe(120);
    expect(payload.token.split(".")).toHaveLength(3);
    await client.close();
  });

  it("warns when a deprecated alias is used", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "auth_create_user_token",
      arguments: { user_id: "alice" },
    });

    expect(result.isError).toBeFalsy();
    const texts = (result.content as { text: string }[]).map((entry) => entry.text);
    expect(texts[0]).toMatch(/deprecated/);
    expect(texts[0]).toMatch(/chat_create_token/);
    await client.close();
  });
});
