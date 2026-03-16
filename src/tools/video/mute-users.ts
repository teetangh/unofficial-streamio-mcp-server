import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerMuteUsers(server: McpServer): void {
  server.registerTool(
    "video_mute_users",
    {
      description:
        "Mute users in a video/audio call. Can mute specific users or all users. Supports muting audio, video, and screenshare independently.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
        user_ids: z
          .array(z.string())
          .optional()
          .describe("User IDs to mute. Omit if using mute_all_users."),
        mute_all_users: z
          .boolean()
          .optional()
          .describe("Mute all users in the call"),
        audio: z.boolean().optional().describe("Mute audio (default: true)"),
        video: z.boolean().optional().describe("Mute video"),
        screenshare: z.boolean().optional().describe("Mute screenshare"),
        muted_by_id: z
          .string()
          .optional()
          .describe("User ID of the moderator performing the mute"),
      },
    },
    async ({
      call_type,
      call_id,
      user_ids,
      mute_all_users,
      audio,
      video,
      screenshare,
      muted_by_id,
    }) => {
      try {
        const client = getClient();
        const response = await client.video.muteUsers({
          type: call_type,
          id: call_id,
          ...(user_ids !== undefined && { user_ids }),
          ...(mute_all_users !== undefined && { mute_all_users }),
          ...(audio !== undefined && { audio }),
          ...(video !== undefined && { video }),
          ...(screenshare !== undefined && { screenshare }),
          ...(muted_by_id !== undefined && { muted_by_id }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
