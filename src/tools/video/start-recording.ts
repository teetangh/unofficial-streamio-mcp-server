import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerStartRecording(server: McpServer): void {
  server.registerTool(
    "video_start_recording",
    {
      description:
        "Start recording a video/audio call. Requires an active call with participants.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
        recording_type: z
          .string()
          .optional()
          .describe("Recording type (default: 'audio_and_video')"),
        recording_external_storage: z
          .string()
          .optional()
          .describe("External storage name for the recording"),
      },
    },
    async ({
      call_type,
      call_id,
      recording_type,
      recording_external_storage,
    }) => {
      try {
        const client = getClient();
        const response = await client.video.startRecording({
          type: call_type,
          id: call_id,
          recording_type: recording_type ?? "audio_and_video",
          ...(recording_external_storage !== undefined && {
            recording_external_storage,
          }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
