import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const sortParamSchema = z.object({
  field: z.string().describe("Field to sort by (e.g. 'user_id')"),
  direction: z
    .number()
    .optional()
    .describe("1 for ascending, -1 for descending"),
});

export function registerQueryCallMembers(server: McpServer): void {
  server.registerTool(
    "video_query_call_members",
    {
      description:
        "Query and filter members of a video/audio call.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
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
          .describe("Max results to return (default: 25)"),
      },
    },
    async ({ call_type, call_id, filter_conditions, sort, limit }) => {
      try {
        const client = getClient();
        const response = await client.video.queryCallMembers({
          type: call_type,
          id: call_id,
          ...(filter_conditions !== undefined && { filter_conditions }),
          ...(sort !== undefined && { sort }),
          ...(limit !== undefined && { limit }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
