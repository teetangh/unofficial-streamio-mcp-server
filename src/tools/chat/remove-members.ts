import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerRemoveMembers(server: McpServer): void {
  server.registerTool(
    "chat_remove_members",
    {
      description:
        "Remove members from a chat channel.",
      inputSchema: {
        channel_type: z
          .string()
          .describe("Channel type (e.g. 'messaging')"),
        channel_id: z.string().describe("Channel ID"),
        member_ids: z
          .array(z.string())
          .describe("Array of user IDs to remove"),
      },
    },
    async ({ channel_type, channel_id, member_ids }) => {
      try {
        const client = getClient();
        const response = await client.chat.updateChannel({
          type: channel_type,
          id: channel_id,
          remove_members: member_ids,
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
