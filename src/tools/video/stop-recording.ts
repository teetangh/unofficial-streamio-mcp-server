import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerStopRecording(server: McpServer): void {
  server.registerTool(
    "video_stop_recording",
    {
      description: "Stop an active recording on a video/audio call.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
        recording_type: z
          .string()
          .optional()
          .describe("Recording type (default: 'audio_and_video')"),
      },
    },
    async ({ call_type, call_id, recording_type }) => {
      try {
        const client = getClient();
        const response = await client.video.stopRecording({
          type: call_type,
          id: call_id,
          recording_type: recording_type ?? "audio_and_video",
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
