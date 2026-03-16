import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDeleteMessage } from "../../../tools/chat/delete-message.js";

const mockDeleteMessage = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("chat_delete_message", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerDeleteMessage(server);
  });

  it("soft deletes a message by default", async () => {
    const mockResponse = { message: { id: "msg-1", deleted_at: "2026-01-01T00:00:00Z" } };
    mockGetClient.mockReturnValue({
      chat: { deleteMessage: mockDeleteMessage.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_delete_message"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { message_id: "msg-1" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.message.id).toBe("msg-1");
    expect(mockDeleteMessage).toHaveBeenCalledWith({
      id: "msg-1",
    });
  });

  it("hard deletes a message when hard=true", async () => {
    const mockResponse = { message: { id: "msg-1" } };
    mockGetClient.mockReturnValue({
      chat: { deleteMessage: mockDeleteMessage.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_delete_message"];
    const result = await (tool!.handler as Function)(
      { message_id: "msg-1", hard: true },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockDeleteMessage).toHaveBeenCalledWith({
      id: "msg-1",
      hard: true,
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["chat_delete_message"];
    const result = await (tool!.handler as Function)(
      { message_id: "msg-1" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
