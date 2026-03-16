import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerUpdateCall(server: McpServer): void {
  server.registerTool(
    "video_update_call",
    {
      description:
        "Update a video/audio call's settings or custom data. Can modify recording settings, screensharing, backstage, and other configuration.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
        settings_override: z
          .record(z.unknown())
          .optional()
          .describe(
            "Settings to override (e.g. {recording: {mode: 'available'}})"
          ),
        custom: z
          .record(z.unknown())
          .optional()
          .describe("Custom data to set on the call"),
      },
    },
    async ({ call_type, call_id, settings_override, custom }) => {
      try {
        const client = getClient();
        const response = await client.video.updateCall({
          type: call_type,
          id: call_id,
          ...(settings_override !== undefined && { settings_override }),
          ...(custom !== undefined && { custom }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
