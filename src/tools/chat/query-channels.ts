import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const sortParamSchema = z.object({
  field: z
    .string()
    .describe("Field to sort by (e.g. 'last_message_at', 'created_at')"),
  direction: z
    .number()
    .optional()
    .describe("Sort direction: 1 for ascending, -1 for descending"),
});

export function registerQueryChannels(server: McpServer): void {
  server.registerTool(
    "chat_query_channels",
    {
      description:
        "Query and filter chat channels. Supports Stream's filter syntax with operators like $eq, $in, $gt, $exists. Common filters: {type: 'messaging'}, {members: {$in: ['user-id']}}.",
      inputSchema: {
        filter_conditions: z
          .record(z.unknown())
          .optional()
          .describe(
            "Filter object using Stream query syntax (e.g. {type: {$eq: 'messaging'}})"
          ),
        sort: z
          .array(sortParamSchema)
          .optional()
          .describe("Sort parameters"),
        limit: z
          .number()
          .optional()
          .describe("Max results to return (default: 10, max: 30)"),
      },
    },
    async ({ filter_conditions, sort, limit }) => {
      try {
        const client = getClient();
        const response = await client.chat.queryChannels({
          filter_conditions: filter_conditions ?? {},
          sort: sort ?? [],
          limit: limit ?? 10,
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
