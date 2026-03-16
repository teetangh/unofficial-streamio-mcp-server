import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStopRecording } from "../../../tools/video/stop-recording.js";

const mockStopRecording = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn());

vi.mock("../../../clients/index.js", () => ({
  getClient: mockGetClient,
}));

describe("video_stop_recording", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerStopRecording(server);
  });

  it("stops recording on a call", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { stopRecording: mockStopRecording.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_stop_recording"];
    expect(tool).toBeDefined();

    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.duration).toBe("200ms");
    expect(mockStopRecording).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      recording_type: "audio_and_video",
    });
  });

  it("stops recording with custom recording_type", async () => {
    const mockResponse = { duration: "200ms" };
    mockGetClient.mockReturnValue({
      video: { stopRecording: mockStopRecording.mockResolvedValue(mockResponse) },
    });

    const tool = server["_registeredTools"]["video_stop_recording"];
    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1", recording_type: "audio_only" },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(mockStopRecording).toHaveBeenCalledWith({
      type: "default",
      id: "call-1",
      recording_type: "audio_only",
    });
  });

  it("returns error when client throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("Missing STREAM_API_KEY or STREAM_API_SECRET");
    });

    const tool = server["_registeredTools"]["video_stop_recording"];
    const result = await (tool!.handler as Function)(
      { call_type: "default", call_id: "call-1" },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing STREAM_API_KEY");
  });
});
