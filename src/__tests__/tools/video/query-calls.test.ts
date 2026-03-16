import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQueryCalls } from "../../../tools/video/query-calls.js";

const mockQueryCalls = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: () => ({ video: { queryCalls: mockQueryCalls } }),
}));

describe("video_query_calls", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryCalls(server);
  });

  it("queries calls with filters", async () => {
    mockQueryCalls.mockResolvedValue({
      calls: [{ id: "call-1" }, { id: "call-2" }],
    });

    const tool = server["_registeredTools"]["video_query_calls"];
    const result = await (tool!.handler as Function)(
      { filter_conditions: { ended_at: { $exists: false } }, limit: 5 },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.calls).toHaveLength(2);
  });

  it("uses defaults when no params provided", async () => {
    mockQueryCalls.mockResolvedValue({ calls: [] });

    const tool = server["_registeredTools"]["video_query_calls"];
    await (tool!.handler as Function)({}, {});

    expect(mockQueryCalls).toHaveBeenCalledWith({
      filter_conditions: {},
      sort: [],
      limit: 10,
    });
  });
});
