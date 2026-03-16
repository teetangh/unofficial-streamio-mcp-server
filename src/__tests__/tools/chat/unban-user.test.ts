import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnbanUser } from "../../../tools/chat/unban-user.js";

const mockUnban = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("chat_unban_user", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerUnbanUser(server);
  });

  it("unbans a user globally", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      moderation: { unban: mockUnban.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_unban_user"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { target_user_id: "bad-user" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.duration).toBe("200ms");
    expect(mockUnban).toHaveBeenCalledWith({
      target_user_id: "bad-user",
    });
  });

  it("unbans a user from a specific channel", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      moderation: { unban: mockUnban.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_unban_user"];
    const result = await (tool!.handler as Function)(
      {
        target_user_id: "bad-user",
        channel_cid: "messaging:general",
        unbanned_by_id: "admin",
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockUnban).toHaveBeenCalledWith({
      target_user_id: "bad-user",
      channel_cid: "messaging:general",
      unbanned_by_id: "admin",
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["chat_unban_user"];
    const result = await (tool!.handler as Function)(
      { target_user_id: "bad-user" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
