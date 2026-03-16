import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateToken } from "../../../tools/chat/create-token.js";

const mockGenerateUserToken = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("chat_create_token", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerCreateToken(server);
  });

  it("generates a token for a user", async () => {
    mockGetClient.mockReturnValue({
      generateUserToken: mockGenerateUserToken.mockReturnValue("mock-jwt-token"),
    });

    const tool = server["_registeredTools"]["chat_create_token"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { user_id: "john", validity_in_seconds: 7200 },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.user_id).toBe("john");
    expect(parsed.token).toBe("mock-jwt-token");
    expect(mockGenerateUserToken).toHaveBeenCalledWith({
      user_id: "john",
      validity_in_seconds: 7200,
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["chat_create_token"];
    const result = await (tool!.handler as Function)(
      { user_id: "john" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
