import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerGetCall(server: McpServer): void {
  server.registerTool(
    "video_get_call",
    {
      description:
        "Get details of an existing video/audio call, including its settings, members, and current state.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
      },
    },
    async ({ call_type, call_id }) => {
      try {
        const client = getClient();
        const call = client.video.call(call_type, call_id);
        const response = await call.get();
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
