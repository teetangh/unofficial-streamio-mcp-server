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
  "STREAM_MCP_DYNAMIC_TOOLSETS",
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
  delete process.env.STREAM_MCP_DYNAMIC_TOOLSETS;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("MCP server", () => {
  it("lists every registered tool", async () => {
    const { client, toolCount } = await connect();
    const { tools } = await client.listTools();

    expect(toolCount).toBe(ALL_TOOLS.length);
    expect(tools.length).toBe(ALL_TOOLS.length);
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

  it("rejects a custom chat event_type containing a dot over MCP transport", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "chat_send_event",
      arguments: {
        channel_type: "messaging",
        channel_id: "general",
        event_type: "typing.start",
        user_id: "alice",
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/Stream reserves the dot character/);
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

  it("rejects a malformed datetime before building a request", async () => {
    const { client } = await connect();

    const result = await client.callTool({
      name: "video_create_call",
      arguments: {
        call_type: "default",
        call_id: "c1",
        created_by_id: "alice",
        starts_at: "not-a-date",
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/starts_at/);
    await client.close();
  });

  it("rejects an empty datetime rather than silently dropping it", async () => {
    const { client } = await connect();

    // Empty text used to pass the schema, fail the truthiness check, and be
    // removed by `defined` — so the caller's intent vanished without an error.
    const result = await client.callTool({
      name: "video_create_call",
      arguments: {
        call_type: "default",
        call_id: "c1",
        created_by_id: "alice",
        starts_at: "",
      },
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

    // A fixed list, not a filter over the registry under test — otherwise a
    // missing registration would satisfy both sides. `.every()` alone is also
    // vacuously true for an empty result.
    const expected = [
      "app_get_settings",
      "app_update_settings",
      "app_get_rate_limits",
      "app_get_task",
      "app_list_roles",
      "app_create_role",
      "app_delete_role",
      "app_list_permissions",
      "app_get_permission",
      "app_list_push_providers",
      "app_upsert_push_provider",
      "app_delete_push_provider",
      "app_check_push",
      "app_verify_webhook",
      "app_list_external_storage",
      "app_create_external_storage",
      "app_update_external_storage",
      "app_delete_external_storage",
      "app_check_external_storage",
    ];
    expect(tools.map((tool) => tool.name).sort()).toEqual([...expected].sort());
    expect(toolCount).toBe(expected.length);
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

  it("supports on-demand toolset activation when STREAM_MCP_DYNAMIC_TOOLSETS=true", async () => {
    process.env.STREAM_MCP_DYNAMIC_TOOLSETS = "true";
    const { client } = await connect();

    const initial = await client.listTools();
    expect(initial.tools.map((t) => t.name).sort()).toEqual([
      "stream_enable_toolset",
      "stream_list_toolsets",
    ]);

    const listResult = await client.callTool({
      name: "stream_list_toolsets",
      arguments: {},
    });
    expect(listResult.isError).toBeFalsy();
    const summary = JSON.parse((listResult.content as { text: string }[])[0].text) as {
      toolsets: { toolset: string; enabled: boolean; tool_count: number; tools: string[] }[];
    };
    expect(summary.toolsets.length).toBeGreaterThan(0);
    expect(summary.toolsets.every((entry) => entry.enabled === false)).toBe(true);

    const enableResult = await client.callTool({
      name: "stream_enable_toolset",
      arguments: { toolsets: ["app"] },
    });
    expect(enableResult.isError).toBeFalsy();

    const afterEnable = await client.listTools();
    expect(afterEnable.tools.some((t) => t.name === "app_get_settings")).toBe(true);
    expect(afterEnable.tools.some((t) => t.name === "chat_send_message")).toBe(false);
    await client.close();
  });

  it("exposes MCP resources, resource templates, and operational prompts", async () => {
    const { client } = await connect();

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining([
        "stream://app/settings",
        "stream://app/rate-limits",
        "stream://chat/channel-types",
        "stream://video/call-types",
        "stream://moderation/blocklists",
      ])
    );

    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toEqual(
      expect.arrayContaining([
        "stream://chat/channel-types/{name}",
        "stream://video/call-types/{name}",
      ])
    );

    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "call-quality-debug",
      "channel-incident-debug",
      "moderation-triage",
      "rate-limit-diagnosis",
    ]);

    const prompt = await client.getPrompt({
      name: "channel-incident-debug",
      arguments: { channel_type: "messaging", channel_id: "general" },
    });
    expect(prompt.messages).toHaveLength(1);
    expect(JSON.stringify(prompt.messages[0].content)).toMatch(/messaging:general/);
    await client.close();
  });
});
