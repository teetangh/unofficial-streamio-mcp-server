import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerDeleteMessage(server: McpServer): void {
  server.registerTool(
    "chat_delete_message",
    {
      description:
        "Delete a chat message. Soft delete by default (message marked as deleted but kept). Use hard=true for permanent removal.",
      inputSchema: {
        message_id: z.string().describe("Message ID to delete"),
        hard: z
          .boolean()
          .optional()
          .describe("Hard delete (permanently remove). Default: false (soft delete)."),
      },
    },
    async ({ message_id, hard }) => {
      try {
        const client = getClient();
        const response = await client.chat.deleteMessage({
          id: message_id,
          ...(hard !== undefined && { hard }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
