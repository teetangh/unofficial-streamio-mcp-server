import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMuteUsers } from "../../../tools/video/mute-users.js";

const mockMuteUsers = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("video_mute_users", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerMuteUsers(server);
  });

  it("mutes specific users audio on a call", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { muteUsers: mockMuteUsers.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_mute_users"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        user_ids: ["user1"],
        audio: true,
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.duration).toBe("200ms");
    expect(mockMuteUsers).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      user_ids: ["user1"],
      audio: true,
    });
  });

  it("mutes all users on a call", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { muteUsers: mockMuteUsers.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_mute_users"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        mute_all_users: true,
        audio: true,
        video: true,
        screenshare: false,
        muted_by_id: "admin",
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockMuteUsers).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      mute_all_users: true,
      audio: true,
      video: true,
      screenshare: false,
      muted_by_id: "admin",
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["video_mute_users"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        user_ids: ["user1"],
        audio: true,
      },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
