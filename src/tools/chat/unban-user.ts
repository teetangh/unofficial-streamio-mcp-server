import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerUnbanUser(server: McpServer): void {
  server.registerTool(
    "chat_unban_user",
    {
      description:
        "Unban a previously banned user. Can unban globally or from a specific channel.",
      inputSchema: {
        target_user_id: z.string().describe("User ID to unban"),
        channel_cid: z
          .string()
          .optional()
          .describe(
            "Channel CID to unban from (e.g. 'messaging:general'). Omit for global unban."
          ),
        unbanned_by_id: z
          .string()
          .optional()
          .describe("User ID of the moderator performing the unban"),
      },
    },
    async ({ target_user_id, channel_cid, unbanned_by_id }) => {
      try {
        const client = getClient();
        const response = await client.moderation.unban({
          target_user_id,
          ...(channel_cid !== undefined && { channel_cid }),
          ...(unbanned_by_id !== undefined && { unbanned_by_id }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
