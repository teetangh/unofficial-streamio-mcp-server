import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUpdateCallMembers } from "../../../tools/video/update-call-members.js";

const mockUpdateCallMembers = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("video_update_call_members", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerUpdateCallMembers(server);
  });

  it("adds members to a call", async () => {
    const mockResponse = { members: [{ user_id: "jane" }], duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { updateCallMembers: mockUpdateCallMembers.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_update_call_members"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        update_members: [{ user_id: "jane" }],
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.members).toEqual([{ user_id: "jane" }]);
    expect(mockUpdateCallMembers).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      update_members: [{ user_id: "jane" }],
    });
  });

  it("removes members from a call", async () => {
    const mockResponse = { members: [], duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { updateCallMembers: mockUpdateCallMembers.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_update_call_members"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        remove_members: ["jane"],
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockUpdateCallMembers).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      remove_members: ["jane"],
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["video_update_call_members"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        update_members: [{ user_id: "jane" }],
      },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
