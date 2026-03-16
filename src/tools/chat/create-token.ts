import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

export function registerCreateToken(server: McpServer): void {
  server.registerTool(
    "chat_create_token",
    {
      description:
        "Generate a Stream user authentication token (JWT). Clients use this token to connect to Stream. Use validity_in_seconds to control expiration (default: 1 hour).",
      inputSchema: {
        user_id: z.string().describe("The user ID to generate a token for"),
        validity_in_seconds: z
          .number()
          .optional()
          .describe("Token validity in seconds (default: 3600)"),
      },
    },
    async ({ user_id, validity_in_seconds }) => {
      try {
        const client = getClient();
        const token = client.generateUserToken({
          user_id,
          validity_in_seconds,
        });
        return toolResult({ user_id, token });
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
