import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerListRecordings(server: McpServer): void {
  server.registerTool(
    "video_list_recordings",
    {
      description:
        "List all recordings for a video/audio call.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
      },
    },
    async ({ call_type, call_id }) => {
      try {
        const client = getClient();
        const response = await client.video.listRecordings({
          type: call_type,
          id: call_id,
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
