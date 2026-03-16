import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStartRecording } from "../../../tools/video/start-recording.js";

const mockStartRecording = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("video_start_recording", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerStartRecording(server);
  });

  it("starts recording with default recording_type", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { startRecording: mockStartRecording.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_start_recording"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.duration).toBe("200ms");
    expect(mockStartRecording).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      recording_type: "audio_and_video",
    });
  });

  it("starts recording with custom recording_type and external storage", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { startRecording: mockStartRecording.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_start_recording"];
    const result = await (tool!.handler as Function)(
      {
        call_type: "default",
        call_id: "call-1",
        recording_type: "audio_only",
        recording_external_storage: "s3-bucket",
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockStartRecording).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      recording_type: "audio_only",
      recording_external_storage: "s3-bucket",
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["video_start_recording"];
    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
