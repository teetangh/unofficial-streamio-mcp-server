import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const userSchema = z.object({
  id: z.string().describe("Unique user ID"),
  name: z.string().optional().describe("Display name"),
  role: z.string().optional().describe("User role (e.g. 'admin', 'user')"),
  image: z.string().optional().describe("Avatar URL"),
  custom: z
    .record(z.unknown())
    .optional()
    .describe("Custom fields"),
});

export function registerUpsertUsers(server: McpServer): void {
  server.registerTool(
    "chat_upsert_users",
    {
      description:
        "Create or update users in Stream. Supports batch upsert of up to 100 users. Each user must have an 'id'. Optional fields: name, role, image, custom data.",
      inputSchema: {
        users: z
          .array(userSchema)
          .describe("Array of users to create or update (max 100)"),
      },
    },
    async ({ users }) => {
      try {
        const client = getClient();
        const response = await client.upsertUsers(users);
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
