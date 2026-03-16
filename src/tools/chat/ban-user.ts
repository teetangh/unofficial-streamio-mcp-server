import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerBanUser(server: McpServer): void {
  server.registerTool(
    "chat_ban_user",
    {
      description:
        "Ban a user. Can ban globally or from a specific channel. Supports shadow bans and timed bans.",
      inputSchema: {
        target_user_id: z.string().describe("User ID to ban"),
        banned_by_id: z
          .string()
          .optional()
          .describe("User ID of the moderator performing the ban"),
        channel_cid: z
          .string()
          .optional()
          .describe(
            "Channel CID to ban from (e.g. 'messaging:general'). Omit for global ban."
          ),
        reason: z.string().optional().describe("Reason for the ban"),
        timeout: z
          .number()
          .optional()
          .describe("Ban duration in minutes. Omit for permanent ban."),
        ip_ban: z
          .boolean()
          .optional()
          .describe("Also ban the user's IP address"),
        shadow: z
          .boolean()
          .optional()
          .describe(
            "Shadow ban — user can still post but messages are invisible to others"
          ),
      },
    },
    async ({
      target_user_id,
      banned_by_id,
      channel_cid,
      reason,
      timeout,
      ip_ban,
      shadow,
    }) => {
      try {
        const client = getClient();
        const response = await client.moderation.ban({
          target_user_id,
          ...(banned_by_id !== undefined && { banned_by_id }),
          ...(channel_cid !== undefined && { channel_cid }),
          ...(reason !== undefined && { reason }),
          ...(timeout !== undefined && { timeout }),
          ...(ip_ban !== undefined && { ip_ban }),
          ...(shadow !== undefined && { shadow }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
