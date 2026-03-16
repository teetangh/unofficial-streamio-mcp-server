import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerUnblockUser(server: McpServer): void {
  server.registerTool(
    "video_unblock_user",
    {
      description:
        "Unblock a previously blocked user from a video/audio call.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
        user_id: z.string().describe("User ID to unblock"),
      },
    },
    async ({ call_type, call_id, user_id }) => {
      try {
        const client = getClient();
        const response = await client.video.unblockUser({
          type: call_type,
          id: call_id,
          user_id,
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
