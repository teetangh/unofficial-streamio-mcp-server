import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerFlagMessage(server: McpServer): void {
  server.registerTool(
    "chat_flag_message",
    {
      description:
        "Flag a chat message for moderation review. Creates a moderation flag that can be reviewed by moderators.",
      inputSchema: {
        message_id: z.string().describe("Message ID to flag"),
        reason: z
          .string()
          .optional()
          .describe("Reason for flagging the message"),
        user_id: z
          .string()
          .optional()
          .describe("User ID of the person flagging"),
      },
    },
    async ({ message_id, reason, user_id }) => {
      try {
        const client = getClient();
        const response = await client.moderation.flag({
          entity_id: message_id,
          entity_type: "stream:chat:v1:message",
          ...(reason !== undefined && { reason }),
          ...(user_id !== undefined && { user_id }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
