import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerAddMembers(server: McpServer): void {
  server.registerTool(
    "chat_add_members",
    {
      description:
        "Add members to a chat channel. Members must be existing Stream users.",
      inputSchema: {
        channel_type: z
          .string()
          .describe("Channel type (e.g. 'messaging')"),
        channel_id: z.string().describe("Channel ID"),
        member_ids: z
          .array(z.string())
          .describe("Array of user IDs to add as members"),
      },
    },
    async ({ channel_type, channel_id, member_ids }) => {
      try {
        const client = getClient();
        const response = await client.chat.updateChannel({
          type: channel_type,
          id: channel_id,
          add_members: member_ids.map((user_id) => ({ user_id })),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
