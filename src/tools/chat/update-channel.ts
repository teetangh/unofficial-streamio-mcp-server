import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerUpdateChannel(server: McpServer): void {
  server.registerTool(
    "chat_update_channel",
    {
      description:
        "Partially update a chat channel. Use 'set' to add/update fields and 'unset' to remove fields. This is a partial update — only specified fields are changed.",
      inputSchema: {
        channel_type: z
          .string()
          .describe("Channel type (e.g. 'messaging')"),
        channel_id: z.string().describe("Channel ID"),
        set: z
          .record(z.unknown())
          .optional()
          .describe(
            "Fields to set (e.g. {name: 'New Name', image: 'https://...'})"
          ),
        unset: z
          .array(z.string())
          .optional()
          .describe("Field names to remove (e.g. ['image', 'description'])"),
      },
    },
    async ({ channel_type, channel_id, set, unset }) => {
      try {
        const client = getClient();
        const response = await client.chat.updateChannelPartial({
          type: channel_type,
          id: channel_id,
          ...(set !== undefined && { set }),
          ...(unset !== undefined && { unset }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
