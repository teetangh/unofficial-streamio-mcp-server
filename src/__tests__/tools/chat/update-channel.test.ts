import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUpdateChannel } from "../../../tools/chat/update-channel.js";

const mockUpdateChannelPartial = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("chat_update_channel", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerUpdateChannel(server);
  });

  it("partially updates a channel with set fields", async () => {
    const mockResponse = { channel: { id: "general", name: "New" } };
    mockGetClient.mockReturnValue({
      chat: { updateChannelPartial: mockUpdateChannelPartial.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_update_channel"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { channel_type: "messaging", channel_id: "general", set: { name: "New" } },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.channel.name).toBe("New");
    expect(mockUpdateChannelPartial).toHaveBeenCalledWith({
      type: "messaging",
      id: "general",
      set: { name: "New" },
    });
  });

  it("partially updates a channel with unset fields", async () => {
    const mockResponse = { channel: { id: "general" } };
    mockGetClient.mockReturnValue({
      chat: { updateChannelPartial: mockUpdateChannelPartial.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_update_channel"];
    const result = await (tool!.handler as Function)(
      { channel_type: "messaging", channel_id: "general", unset: ["image", "description"] },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockUpdateChannelPartial).toHaveBeenCalledWith({
      type: "messaging",
      id: "general",
      unset: ["image", "description"],
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["chat_update_channel"];
    const result = await (tool!.handler as Function)(
      { channel_type: "messaging", channel_id: "general", set: { name: "New" } },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
