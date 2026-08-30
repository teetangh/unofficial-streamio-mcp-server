import { z } from "zod";
import {
  customData,
  defined,
  filterConditions,
  limit,
  nextCursor,
  prevCursor,
  sortParams,
} from "../../schemas/common.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

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

const queryBannedUsers = defineTool({
  name: "moderation_query_banned_users",
  title: "Query banned users",
  toolset: "moderation",
  description:
    "List current bans. Common filters: {user_id: {$eq: 'alice'}}, {channel_cid: {$eq: 'messaging:general'}}, {banned_by_id: {$eq: 'mod'}}.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
  },
  compact: bounded,
  handler: async (args, client) =>
    client.queryBannedUsers({
      payload: defined({
        filter_conditions: args.filter_conditions ?? {},
        sort: args.sort,
        limit: args.limit ?? 25,
      }),
    }),
});

const muteUser = defineTool({
  name: "moderation_mute_user",
  title: "Mute user",
  toolset: "moderation",
  description:
    "Mute one or more users on behalf of another user. Muted users' messages are hidden from the muting user only.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User doing the muting"),
    target_ids: z.array(z.string().min(1)).min(1).describe("User IDs to mute"),
    timeout: z.int().min(1).optional().describe("Mute duration in minutes. Omit for indefinite."),
  },
  handler: async (args, client) =>
    client.moderation.mute(
      defined({ user_id: args.user_id, target_ids: args.target_ids, timeout: args.timeout })
    ),
});

const unmuteUser = defineTool({
  name: "moderation_unmute_user",
  title: "Unmute user",
  toolset: "moderation",
  description:
    "Remove a user-level mute, so the muted user's messages become visible again to the user who muted them.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User who created the mute"),
    target_ids: z.array(z.string().min(1)).min(1).describe("User IDs to unmute"),
  },
  handler: async (args, client) =>
    client.moderation.unmute({ user_id: args.user_id, target_ids: args.target_ids }),
});

const queryFlags = defineTool({
  name: "moderation_query_flags",
  title: "Query moderation flags",
  toolset: "moderation",
  description:
    "List moderation flags. Common filters: {entity_type: {$eq: 'stream:chat:v1:message'}}, {reporter_id: {$eq: 'alice'}}, {reviewed: false}.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  compact: bounded,
  handler: async (args, client) =>
    client.moderation.queryModerationFlags(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const queryReviewQueue = defineTool({
  name: "moderation_query_review_queue",
  title: "Query review queue",
  toolset: "moderation",
  description:
    "List items awaiting moderator review. Common filters: {entity_type: {$eq: 'stream:chat:v1:message'}}, {review_queue_item_status: {$eq: 'pending'}}. Act on an item with moderation_submit_action.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
    stats_only: z.boolean().optional().describe("Return only aggregate counts, not the items"),
  },
  // A page of 10 items is ~48KB raw, most of it per-item action history and
  // the app-level action/filter config.
  compact: (raw: { items?: any[]; stats?: unknown; next?: string; prev?: string }) => ({
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      entity_creator_id: item.entity_creator_id,
      status: item.status,
      recommended_action: item.recommended_action,
      severity: item.severity,
      created_at: item.created_at,
      reviewed_at: item.reviewed_at,
      flag_count: item.flags?.length,
      flag_reasons: [...new Set((item.flags ?? []).map((flag: any) => flag.reason))],
      moderation_payload: item.moderation_payload,
    })),
    stats: raw.stats,
    next: raw.next,
    prev: raw.prev,
    _hint: "Summarised. Pass verbose:true for full items, action history and config.",
  }),
  handler: async (args, client) =>
    client.moderation.queryReviewQueue(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
        stats_only: args.stats_only,
      })
    ),
});

const submitAction = defineTool({
  name: "moderation_submit_action",
  title: "Act on a review queue item",
  toolset: "moderation",
  description:
    "Resolve a review queue item: mark it reviewed, delete the content, ban or unban the user, and so on. Get `item_id` from moderation_query_review_queue. Action-specific options go in `payload`, keyed by the action type (e.g. {ban: {timeout: 60, reason: 'spam'}}).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    item_id: z.string().min(1).describe("Review queue item ID"),
    action_type: z
      .enum([
        "mark_reviewed",
        "delete_message",
        "delete_user",
        "delete_user_messages",
        "ban",
        "unban",
        "block",
        "unblock",
        "shadow_block",
        "restore",
        "kick_user",
        "end_call",
        "escalate",
        "de_escalate",
        "bypass",
        "custom",
      ])
      .describe("Action to take on the item"),
    user_id: z.string().optional().describe("Moderator performing the action"),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Action-specific options, keyed by action type, e.g. {ban: {timeout: 60, reason: 'spam'}} or {delete_message: {hard_delete: true}}"
      ),
  },
  handler: async (args, client) =>
    client.moderation.submitAction(
      defined({
        ...(args.payload ?? {}),
        item_id: args.item_id,
        action_type: args.action_type,
        user_id: args.user_id,
      })
    ),
});

const checkContent = defineTool({
  name: "moderation_check",
  title: "Check content against moderation policy",
  toolset: "moderation",
  description:
    "Run text through the app's moderation policy without posting it, returning the recommended action. Useful for pre-screening user-generated content.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    entity_id: z.string().min(1).describe("An ID for the content being checked"),
    entity_type: z
      .enum(ENTITY_TYPES)
      .default("stream:chat:v1:message")
      .describe("Type of entity being checked"),
    entity_creator_id: z.string().min(1).describe("User who authored the content"),
    text: z.string().min(1).describe("The text to check"),
    config_key: z.string().optional().describe("Moderation config to check against"),
    test_mode: z.boolean().optional().describe("Evaluate without recording a moderation result"),
  },
  handler: async (args, client) =>
    client.moderation.check(
      defined({
        entity_id: args.entity_id,
        entity_type: args.entity_type ?? "stream:chat:v1:message",
        entity_creator_id: args.entity_creator_id,
        moderation_payload: { texts: [args.text] },
        config_key: args.config_key,
        test_mode: args.test_mode,
      })
    ),
});

const queryLogs = defineTool({
  name: "moderation_query_logs",
  title: "Query moderation logs",
  toolset: "moderation",
  description: "List moderation actions taken on the app — who did what, to whom, and when.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  compact: bounded,
  handler: async (args, client) =>
    client.moderation.queryModerationLogs(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

export const moderationTools: AnyToolDef[] = [
  banUser,
  unbanUser,
  flagContent,
  queryBannedUsers,
  muteUser,
  unmuteUser,
  queryFlags,
  queryReviewQueue,
  submitAction,
  checkContent,
  queryLogs,
];
