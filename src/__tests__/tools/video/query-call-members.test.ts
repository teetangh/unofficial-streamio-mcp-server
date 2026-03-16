import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQueryCallMembers } from "../../../tools/video/query-call-members.js";

const mockQueryCallMembers = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("video_query_call_members", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryCallMembers(server);
  });

  it("queries call members with default parameters", async () => {
    const mockResponse = { members: [], duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { queryCallMembers: mockQueryCallMembers.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_query_call_members"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.members).toEqual([]);
    expect(mockQueryCallMembers).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
    });
  });

  it("queries call members with filters, sort, and limit", async () => {
    const mockResponse = { members: [{ user_id: "jane" }], duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { queryCallMembers: mockQueryCallMembers.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_query_call_members"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        filter_conditions: { role: { $eq: "host" } },
        sort: [{ field: "user_id", direction: 1 }],
        limit: 10,
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.members).toEqual([{ user_id: "jane" }]);
    expect(mockQueryCallMembers).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      filter_conditions: { role: { $eq: "host" } },
      sort: [{ field: "user_id", direction: 1 }],
      limit: 10,
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["video_query_call_members"];
    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
