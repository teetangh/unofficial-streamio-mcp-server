import { z } from "zod";
import { customData, defined } from "../../schemas/common.js";
import { defineTool, type ToolDef } from "../define.js";

/** Stream's moderation entity types, as used by flag/check/review. */
const ENTITY_TYPES = [
  "stream:chat:v1:message",
  "stream:user",
  "stream:v2:video:call",
  "stream:feeds:v2:activity",
  "stream:feeds:v2:reaction",
] as const;

const banUser = defineTool({
  name: "moderation_ban_user",
  title: "Ban user",
  toolset: "moderation",
  description:
    "Ban a user app-wide, or from one channel when `channel_cid` is given. A shadow ban lets the user keep posting while hiding their messages from everyone else.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  aliases: ["chat_ban_user"],
  inputSchema: {
    target_user_id: z.string().min(1).describe("User ID to ban"),
    // Stream rejects a server-side ban without an acting user:
    // "either user or user_id must be provided when using server side auth".
    banned_by_id: z.string().min(1).describe("Moderator performing the ban"),
    channel_cid: z
      .string()
      .optional()
      .describe("Ban from this channel only, e.g. 'messaging:general'. Omit for an app-wide ban."),
    reason: z.string().optional().describe("Reason recorded with the ban"),
    timeout: z
      .int()
      .min(1)
      .optional()
      .describe("Ban duration in minutes. Omit for a permanent ban."),
    shadow: z
      .boolean()
      .optional()
      .describe("Shadow ban — the user can still post, but only they see their messages"),
    ip_ban: z.boolean().optional().describe("Also ban the user's IP address"),
    delete_messages: z
      .enum(["soft", "pruning", "hard"])
      .optional()
      .describe("Also delete the user's existing messages"),
  },
  handler: async (args, client) =>
    client.moderation.ban(
      defined({
        target_user_id: args.target_user_id,
        banned_by_id: args.banned_by_id,
        channel_cid: args.channel_cid,
        reason: args.reason,
        timeout: args.timeout,
        shadow: args.shadow,
        ip_ban: args.ip_ban,
        delete_messages: args.delete_messages,
      })
    ),
});

const unbanUser = defineTool({
  name: "moderation_unban_user",
  title: "Unban user",
  toolset: "moderation",
  description:
    "Lift a ban. Pass the same `channel_cid` that was used to ban, or omit it to lift an app-wide ban. `banned_by_id` selects which ban to lift when a user was banned by several moderators; `unbanned_by_id` records who is lifting it.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  aliases: ["chat_unban_user"],
  inputSchema: {
    target_user_id: z.string().min(1).describe("User ID to unban"),
    channel_cid: z
      .string()
      .optional()
      .describe("Channel the ban was applied to. Omit for an app-wide unban."),
    unbanned_by_id: z.string().optional().describe("Moderator performing the unban"),
    banned_by_id: z
      .string()
      .optional()
      .describe(
        "Moderator who created the ban being lifted. Only needed to disambiguate between bans by different moderators."
      ),
  },
  handler: async (args, client) =>
    client.moderation.unban(
      defined({
        target_user_id: args.target_user_id,
        channel_cid: args.channel_cid,
        unbanned_by_id: args.unbanned_by_id,
        // The `created_by` query param identifies who created the *ban*, not
        // who is lifting it — they are different people.
        created_by: args.banned_by_id,
      })
    ),
});

const flagContent = defineTool({
  name: "moderation_flag_message",
  title: "Flag content for review",
  toolset: "moderation",
  description:
    "Flag a message (or other entity) for moderator review. The flag lands in the review queue — see moderation_query_review_queue.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  aliases: ["chat_flag_message"],
  inputSchema: {
    entity_id: z.string().min(1).describe("ID of the entity to flag (a message ID for messages)"),
    entity_type: z
      .enum(ENTITY_TYPES)
      .default("stream:chat:v1:message")
      .describe("Type of entity being flagged"),
    user_id: z.string().min(1).describe("User raising the flag"),
    entity_creator_id: z.string().optional().describe("User who created the flagged entity"),
    reason: z.string().optional().describe("Reason for the flag, e.g. 'spam', 'hate'"),
    custom: customData,
  },
  handler: async (args, client) =>
    client.moderation.flag(
      defined({
        entity_id: args.entity_id,
        entity_type: args.entity_type ?? "stream:chat:v1:message",
        user_id: args.user_id,
        entity_creator_id: args.entity_creator_id,
        reason: args.reason,
        custom: args.custom,
      })
    ),
});

export const moderationTools: ToolDef<any>[] = [banUser, unbanUser, flagContent];
