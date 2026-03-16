import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStartTranscription } from "../../../tools/video/start-transcription.js";

const mockStartTranscription = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("video_start_transcription", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerStartTranscription(server);
  });

  it("starts transcription with a language", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { startTranscription: mockStartTranscription.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_start_transcription"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1", language: "en" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.duration).toBe("200ms");
    expect(mockStartTranscription).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      language: "en",
    });
  });

  it("starts transcription with external storage", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { startTranscription: mockStartTranscription.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_start_transcription"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        language: "fr",
        transcription_external_storage: "s3-bucket",
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockStartTranscription).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      language: "fr",
      transcription_external_storage: "s3-bucket",
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["video_start_transcription"];
    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1", language: "en" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
