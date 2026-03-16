import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateCall } from "../../../tools/video/create-call.js";

const mockCreate = vi.hoisted(() => vi.fn());
const mockCall = vi.hoisted(() => vi.fn(() => ({ create: mockCreate })));

vi.mock("../../../clients/index.js", () => ({
  getClient: () => ({ video: { call: mockCall } }),
}));

describe("video_create_call", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerCreateCall(server);
  });

  it("creates a call successfully", async () => {
    mockCreate.mockResolvedValue({
      call: { id: "call-1", type: "default" },
    });

    const tool = server["_registeredTools"]["video_create_call"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        created_by_id: "john",
        members: [{ user_id: "jane", role: "speaker" }],
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.call.id).toBe("call-1");
    expect(mockCall).toHaveBeenCalledWith("default", "call-1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        created_by_id: "john",
        members: [{ user_id: "jane", role: "speaker" }],
      },
    });
  });

  it("returns error on failure", async () => {
    mockCreate.mockRejectedValue(new Error("Call type not found"));

    const tool = server["_registeredTools"]["video_create_call"];
    const result = await (tool!.handler as Function)(
      { call_type: "invalid", call_id: "x", created_by_id: "john" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Call type not found");
  });
});
