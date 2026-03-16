import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const sortParamSchema = z.object({
  field: z
    .string()
    .describe("Field to sort by (e.g. 'created_at', 'name')"),
  direction: z
    .number()
    .optional()
    .describe("1 for ascending, -1 for descending"),
});

export function registerQueryUsers(server: McpServer): void {
  server.registerTool(
    "chat_query_users",
    {
      description:
        "Query and filter users. Supports Stream's filter syntax. Common filters: {id: {$in: ['user1', 'user2']}}, {role: 'admin'}, {name: {$autocomplete: 'john'}}.",
      inputSchema: {
        filter_conditions: z
          .record(z.unknown())
          .optional()
          .describe("Filter object using Stream query syntax"),
        sort: z
          .array(sortParamSchema)
          .optional()
          .describe("Sort parameters"),
        limit: z
          .number()
          .optional()
          .describe("Max results to return (default: 10, max: 100)"),
      },
    },
    async ({ filter_conditions, sort, limit }) => {
      try {
        const client = getClient();
        const response = await client.queryUsers({
          payload: {
            filter_conditions: filter_conditions ?? {},
            sort: sort ?? [],
            limit: limit ?? 10,
          },
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
