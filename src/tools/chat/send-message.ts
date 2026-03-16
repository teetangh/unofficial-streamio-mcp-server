import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerSendMessage(server: McpServer): void {
  server.registerTool(
    "chat_send_message",
    {
      description:
        "Send a message to a chat channel. The message is sent on behalf of the specified user.",
      inputSchema: {
        channel_type: z
          .string()
          .describe("Channel type (e.g. 'messaging')"),
        channel_id: z.string().describe("Channel ID"),
        text: z.string().describe("Message text content"),
        user_id: z.string().describe("User ID sending the message"),
      },
    },
    async ({ channel_type, channel_id, text, user_id }) => {
      try {
        const client = getClient();
        const response = await client.chat.sendMessage({
          type: channel_type,
          id: channel_id,
          message: { text, user_id },
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
