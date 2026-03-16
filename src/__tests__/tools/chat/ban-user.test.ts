import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBanUser } from "../../../tools/chat/ban-user.js";

const mockBan = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("chat_ban_user", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerBanUser(server);
  });

  it("bans a user with a reason", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      moderation: { ban: mockBan.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_ban_user"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { target_user_id: "bad-user", reason: "spam" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.duration).toBe("200ms");
    expect(mockBan).toHaveBeenCalledWith({
      target_user_id: "bad-user",
      reason: "spam",
    });
  });

  it("bans a user with all optional fields", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      moderation: { ban: mockBan.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_ban_user"];
    const result = await (tool!.handler as Function)(
      {
        target_user_id: "bad-user",
        banned_by_id: "admin",
        channel_cid: "messaging:general",
        reason: "harassment",
        timeout: 60,
        ip_ban: true,
        shadow: true,
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockBan).toHaveBeenCalledWith({
      target_user_id: "bad-user",
      banned_by_id: "admin",
      channel_cid: "messaging:general",
      reason: "harassment",
      timeout: 60,
      ip_ban: true,
      shadow: true,
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["chat_ban_user"];
    const result = await (tool!.handler as Function)(
      { target_user_id: "bad-user", reason: "spam" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
