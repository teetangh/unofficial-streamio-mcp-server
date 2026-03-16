import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUpsertUsers } from "../../../tools/chat/upsert-users.js";

const mockUpsertUsers = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: () => ({ upsertUsers: mockUpsertUsers }),
}));

describe("chat_upsert_users", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerUpsertUsers(server);
  });

  it("upserts users successfully", async () => {
    const mockResponse = { users: { john: { id: "john", name: "John" } } };
    mockUpsertUsers.mockResolvedValue(mockResponse);

    const tool = server["_registeredTools"]["chat_upsert_users"];
    const result = await (tool!.handler as Function)(
      { users: [{ id: "john", name: "John" }] },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.users.john.id).toBe("john");
  });

  it("returns error on API failure", async () => {
    mockUpsertUsers.mockRejectedValue(
      Object.assign(new Error("Rate limit exceeded"), {
        status: 429,
        code: 9,
      })
    );

    const tool = server["_registeredTools"]["chat_upsert_users"];
    const result = await (tool!.handler as Function)(
      { users: [{ id: "john" }] },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Stream API Error (429)");
  });
});
