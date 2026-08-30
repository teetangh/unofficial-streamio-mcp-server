import { z } from "zod";
import { defineTool, type ToolDef } from "../define.js";

const DEFAULT_VALIDITY_SECONDS = 3600;

const validity = z
  .int()
  .min(60)
  .max(60 * 60 * 24 * 365)
  .optional()
  .describe(`Token lifetime in seconds (default: ${DEFAULT_VALIDITY_SECONDS}, i.e. 1 hour)`);

const createUserToken = defineTool({
  name: "chat_create_token",
  title: "Create user token",
  toolset: "users",
  description:
    "Mint a Stream user JWT. Clients present this to connect to chat and to join calls. The user must already exist (see chat_upsert_users). Treat the token as a credential — it grants that user's access until it expires.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  aliases: ["auth_create_user_token"],
  inputSchema: {
    user_id: z.string().min(1).describe("User ID the token is for"),
    validity_in_seconds: validity,
  },
  handler: async (args, client) => {
    const validityInSeconds = args.validity_in_seconds ?? DEFAULT_VALIDITY_SECONDS;
    const token = client.generateUserToken({
      user_id: args.user_id,
      validity_in_seconds: validityInSeconds,
    });
    return {
      user_id: args.user_id,
      token,
      expires_in_seconds: validityInSeconds,
      expires_at: new Date(Date.now() + validityInSeconds * 1000).toISOString(),
    };
  },
});

export const tokenTools: ToolDef<any>[] = [createUserToken];
