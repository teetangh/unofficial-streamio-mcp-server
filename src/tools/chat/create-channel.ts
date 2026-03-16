import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerCreateChannel(server: McpServer): void {
  server.registerTool(
    "chat_create_channel",
    {
      description:
        "Create or get a chat channel. Channel types: 'messaging', 'livestream', 'team', 'commerce', 'gaming'. If the channel already exists, returns it.",
      inputSchema: {
        type: z
          .string()
          .describe("Channel type (e.g. 'messaging', 'livestream', 'team')"),
        id: z
          .string()
          .optional()
          .describe(
            "Channel ID. Auto-generated if omitted for distinct channels."
          ),
        name: z.string().optional().describe("Channel display name"),
        created_by_id: z
          .string()
          .describe("User ID of the channel creator"),
        members: z
          .array(z.string())
          .optional()
          .describe("Array of user IDs to add as members"),
      },
    },
    async ({ type, id, name, created_by_id, members }) => {
      try {
        const client = getClient();
        const memberRequests = members?.map((user_id) => ({ user_id }));

        if (id) {
          const channel = client.chat.channel(type, id);
          const response = await channel.getOrCreate({
            data: {
              created_by_id,
              ...(name !== undefined && { name }),
              ...(memberRequests !== undefined && { members: memberRequests }),
            },
          });
          return toolResult(response);
        }

        const response = await client.chat.getOrCreateDistinctChannel({
          type,
          data: {
            created_by_id,
            ...(name !== undefined && { name }),
            members: memberRequests ?? [],
          },
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
