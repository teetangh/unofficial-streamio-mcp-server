import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const memberSchema = z.object({
  user_id: z.string().describe("User ID"),
  role: z.string().optional().describe("Member role (e.g. 'host', 'speaker')"),
});

export function registerUpdateCallMembers(server: McpServer): void {
  server.registerTool(
    "video_update_call_members",
    {
      description:
        "Add, update, or remove members from a video/audio call.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
        update_members: z
          .array(memberSchema)
          .optional()
          .describe("Members to add or update"),
        remove_members: z
          .array(z.string())
          .optional()
          .describe("User IDs to remove from the call"),
      },
    },
    async ({ call_type, call_id, update_members, remove_members }) => {
      try {
        const client = getClient();
        const response = await client.video.updateCallMembers({
          type: call_type,
          id: call_id,
          ...(update_members !== undefined && { update_members }),
          ...(remove_members !== undefined && { remove_members }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
