import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFlagMessage } from "../../../tools/chat/flag-message.js";

const mockFlag = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("chat_flag_message", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerFlagMessage(server);
  });

  it("flags a message for moderation", async () => {
    const mockResponse = { item_id: "msg-1", duration: "200ms" };
    mockGetClient.mockReturnValue({
      moderation: { flag: mockFlag.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_flag_message"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { message_id: "msg-1", reason: "offensive" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.item_id).toBe("msg-1");
    expect(mockFlag).toHaveBeenCalledWith({
      entity_id: "msg-1",
      entity_type: "stream:chat:v1:message",
      reason: "offensive",
    });
  });

  it("flags a message with user_id", async () => {
    const mockResponse = { item_id: "msg-1" };
    mockGetClient.mockReturnValue({
      moderation: { flag: mockFlag.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["chat_flag_message"];
    const result = await (tool!.handler as Function)(
      { message_id: "msg-1", reason: "spam", user_id: "reporter-1" },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockFlag).toHaveBeenCalledWith({
      entity_id: "msg-1",
      entity_type: "stream:chat:v1:message",
      reason: "spam",
      user_id: "reporter-1",
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["chat_flag_message"];
    const result = await (tool!.handler as Function)(
      { message_id: "msg-1", reason: "offensive" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
