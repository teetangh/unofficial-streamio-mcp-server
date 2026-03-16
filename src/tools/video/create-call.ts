import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const memberSchema = z.object({
  user_id: z.string().describe("Member user ID"),
  role: z
    .string()
    .optional()
    .describe("Member role (e.g. 'host', 'speaker')"),
});

export function registerCreateCall(server: McpServer): void {
  server.registerTool(
    "video_create_call",
    {
      description:
        "Create a video/audio call. Call types: 'default' (group call), 'livestream' (broadcast), 'audio_room' (audio-only), 'development' (testing). Returns call details including join credentials.",
      inputSchema: {
        call_type: z
          .string()
          .describe(
            "Call type: 'default', 'livestream', 'audio_room', or 'development'"
          ),
        call_id: z.string().describe("Unique call ID"),
        created_by_id: z
          .string()
          .describe("User ID of the call creator"),
        members: z
          .array(memberSchema)
          .optional()
          .describe("Initial call members"),
        custom: z
          .record(z.unknown())
          .optional()
          .describe("Custom data for the call"),
      },
    },
    async ({ call_type, call_id, created_by_id, members, custom }) => {
      try {
        const client = getClient();
        const call = client.video.call(call_type, call_id);
        const response = await call.create({
          data: {
            created_by_id,
            ...(members !== undefined && { members }),
            ...(custom !== undefined && { custom }),
          },
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
