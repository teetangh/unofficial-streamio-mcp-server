import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const sortParamSchema = z.object({
  field: z
    .string()
    .describe("Field to sort by (e.g. 'created_at', 'starts_at')"),
  direction: z
    .number()
    .optional()
    .describe("1 for ascending, -1 for descending"),
});

export function registerQueryCalls(server: McpServer): void {
  server.registerTool(
    "video_query_calls",
    {
      description:
        "Query and filter video/audio calls. Supports Stream's filter syntax. Common filters: {created_by_user_id: 'user1'}, {ended_at: {$exists: false}} for active calls.",
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
          .describe("Max results to return (default: 10, max: 25)"),
      },
    },
    async ({ filter_conditions, sort, limit }) => {
      try {
        const client = getClient();
        const response = await client.video.queryCalls({
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
