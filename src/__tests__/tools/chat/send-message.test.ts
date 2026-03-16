import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSendMessage } from "../../../tools/chat/send-message.js";

const mockSendMessage = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: () => ({ chat: { sendMessage: mockSendMessage } }),
}));

describe("chat_send_message", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerSendMessage(server);
  });

  it("sends a message to a channel", async () => {
    const mockResponse = {
      message: { id: "msg-1", text: "hello", user: { id: "john" } },
    };
    mockSendMessage.mockResolvedValue(mockResponse);

    const tool = server["_registeredTools"]["chat_send_message"];
    const result = await (tool!.handler as Function)(
      {
        channel_type: "messaging",
        channel_id: "general",
        text: "hello",
        user_id: "john",
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.message.text).toBe("hello");
    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "messaging",
      id: "general",
      message: { text: "hello", user_id: "john" },
    });
  });
});
