import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListTranscriptions } from "../../../tools/video/list-transcriptions.js";

const mockListTranscriptions = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("video_list_transcriptions", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerListTranscriptions(server);
  });

  it("lists transcriptions for a call", async () => {
    const mockResponse = { transcriptions: [] };
    mockGetClient.mockReturnValue({
      video: { listTranscriptions: mockListTranscriptions.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_list_transcriptions"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.transcriptions).toEqual([]);
    expect(mockListTranscriptions).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["video_list_transcriptions"];
    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
