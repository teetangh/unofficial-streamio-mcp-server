import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRemoveMembers } from "../../../tools/chat/remove-members.js";

const mockUpdateChannel = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("chat_remove_members", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerRemoveMembers(server);
  });

  it("removes members from a channel", async () => {
    const mockResponse = { members: [] };
    mockGetClient.mockReturnValue({
      chat: { updateChannel: mockUpdateChannel.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_remove_members"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { channel_type: "messaging", channel_id: "general", member_ids: ["user1"] },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.members).toEqual([]);
    expect(mockUpdateChannel).toHaveBeenCalledWith({
      type: "messaging",
      id: "general",
      remove_members: ["user1"],
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["chat_remove_members"];
    const result = await (tool!.handler as Function)(
      { channel_type: "messaging", channel_id: "general", member_ids: ["user1"] },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
