import { z } from "zod";
import {
  defined,
  filterConditions,
  limit,
  nextCursor,
  prevCursor,
  sortParams,
} from "../../schemas/common.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const queryModerationConfigs = defineTool({
  name: "moderation_query_configs",
  title: "Query moderation configs",
  toolset: "moderation",
  description:
    "List moderation policy configurations with optional filtering, sorting and cursor pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.moderation.queryModerationConfigs(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const getModerationConfig = defineTool({
  name: "moderation_get_config",
  title: "Get moderation config",
  toolset: "moderation",
  description: "Get a single moderation policy configuration by its key and optional team.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    key: z.string().min(1).describe("Moderation config key, e.g. 'default' or 'messaging:default'"),
    team: z.string().optional().describe("Team the moderation config belongs to"),
  },
  handler: async (args, client) =>
    client.moderation.getConfig(defined({ key: args.key, team: args.team })),
});

const upsertModerationConfig = defineTool({
  name: "moderation_upsert_config",
  title: "Upsert moderation config",
  toolset: "moderation",
  description:
    "Create or update a moderation policy configuration for text, image, video, blocklists, LLM or toxicity.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    key: z.string().min(1).describe("Moderation config key to create or update"),
    team: z.string().optional().describe("Team the moderation config belongs to"),
    async: z
      .boolean()
      .optional()
      .describe("Run moderation checks asynchronously instead of inline"),
    ai_text_config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("AI text moderation configuration"),
    ai_image_config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("AI image moderation configuration"),
    ai_video_config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("AI video moderation configuration"),
    block_list_config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Word blocklist moderation configuration"),
    llm_config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("LLM-based moderation configuration"),
    automod_toxicity_config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Automated toxicity filter configuration"),
    flood_config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Flood and rate-limiting moderation configuration"),
  },
  handler: async (args, client) =>
    client.moderation.upsertConfig(
      defined({
        key: args.key,
        team: args.team,
        async: args.async,
        ai_text_config: args.ai_text_config,
        ai_image_config: args.ai_image_config,
        ai_video_config: args.ai_video_config,
        block_list_config: args.block_list_config,
        llm_config: args.llm_config,
        automod_toxicity_config: args.automod_toxicity_config,
        flood_config: args.flood_config,
      }) as never
    ),
});

const deleteModerationConfig = defineTool({
  name: "moderation_delete_config",
  title: "Delete moderation config",
  toolset: "moderation",
  description: "Delete a moderation policy configuration by its key and optional team.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    key: z.string().min(1).describe("Moderation config key to delete"),
    team: z.string().optional().describe("Team the moderation config belongs to"),
  },
  handler: async (args, client) =>
    client.moderation.deleteConfig(defined({ key: args.key, team: args.team })),
});

const queryModerationRules = defineTool({
  name: "moderation_query_rules",
  title: "Query moderation rules",
  toolset: "moderation",
  description:
    "List custom moderation rules with optional filtering, sorting and cursor pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.moderation.queryModerationRules(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const getModerationRule = defineTool({
  name: "moderation_get_rule",
  title: "Get moderation rule",
  toolset: "moderation",
  description:
    "Get a single moderation rule by its unique ID, including its conditions and actions.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    id: z.string().min(1).describe("Moderation rule ID"),
  },
  handler: async (args, client) => client.moderation.getModerationRule({ id: args.id }),
});

const upsertModerationRule = defineTool({
  name: "moderation_upsert_rule",
  title: "Upsert moderation rule",
  toolset: "moderation",
  description:
    "Create or update a moderation rule with conditions, target config keys and automated actions.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    name: z.string().min(1).describe("Unique moderation rule name"),
    rule_type: z.string().min(1).describe("Rule type, e.g. 'user', 'content' or 'call'"),
    description: z.string().optional().describe("Human-readable description of the rule"),
    enabled: z.boolean().optional().describe("Whether the moderation rule is active"),
    config_keys: z
      .array(z.string().min(1))
      .optional()
      .describe("Moderation config keys this rule applies to"),
    conditions: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Rule condition objects evaluated against content or user state"),
    action: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Action executed when the rule conditions match"),
    logic: z.string().optional().describe("Boolean logic combining conditions, e.g. 'AND' or 'OR'"),
    team: z.string().optional().describe("Team the moderation rule belongs to"),
  },
  handler: async (args, client) =>
    client.moderation.upsertModerationRule(
      defined({
        name: args.name,
        rule_type: args.rule_type,
        description: args.description,
        enabled: args.enabled,
        config_keys: args.config_keys,
        conditions: args.conditions,
        action: args.action,
        logic: args.logic,
        team: args.team,
      }) as never
    ),
});

const deleteModerationRule = defineTool({
  name: "moderation_delete_rule",
  title: "Delete moderation rule",
  toolset: "moderation",
  description: "Delete a custom moderation rule by its unique ID.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("Moderation rule ID to delete"),
  },
  handler: async (args, client) => client.moderation.deleteModerationRule({ id: args.id }),
});

const getReviewQueueItem = defineTool({
  name: "moderation_get_review_queue_item",
  title: "Get review queue item",
  toolset: "moderation",
  description:
    "Get a single moderation review queue item by ID, including its flags and moderation payload.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("Review queue item ID"),
  },
  handler: async (args, client) => client.moderation.getReviewQueueItem({ id: args.id }),
});

const submitAppeal = defineTool({
  name: "moderation_appeal",
  title: "Submit moderation appeal",
  toolset: "moderation",
  description: "Submit an appeal against a moderation decision on a message, user or other entity.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    entity_id: z.string().min(1).describe("ID of the moderated entity being appealed"),
    entity_type: z
      .string()
      .min(1)
      .describe("Entity type, e.g. 'stream:chat:v1:message' or 'stream:user'"),
    user_id: z.string().min(1).describe("User ID submitting the appeal"),
    appeal_reason: z
      .string()
      .min(1)
      .describe("Explanation for why the moderation action should be overturned"),
    channel_cid: z
      .string()
      .optional()
      .describe("Channel CID associated with the entity, e.g. 'messaging:general'"),
    review_queue_item_id: z
      .string()
      .optional()
      .describe("Review queue item ID associated with the moderation action"),
  },
  handler: async (args, client) =>
    client.moderation.appeal(
      defined({
        entity_id: args.entity_id,
        entity_type: args.entity_type,
        user_id: args.user_id,
        appeal_reason: args.appeal_reason,
        channel_cid: args.channel_cid,
        review_queue_item_id: args.review_queue_item_id,
      })
    ),
});

const getAppeal = defineTool({
  name: "moderation_get_appeal",
  title: "Get moderation appeal",
  toolset: "moderation",
  description: "Get a single moderation appeal by its unique ID, including its status and history.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("Appeal ID"),
  },
  handler: async (args, client) => client.moderation.getAppeal({ id: args.id }),
});

const queryAppeals = defineTool({
  name: "moderation_query_appeals",
  title: "Query moderation appeals",
  toolset: "moderation",
  description: "List moderation appeals with optional filtering, sorting and cursor pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.moderation.queryAppeals(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

export const moderationPolicyTools: AnyToolDef[] = [
  queryModerationConfigs,
  getModerationConfig,
  upsertModerationConfig,
  deleteModerationConfig,
  queryModerationRules,
  getModerationRule,
  upsertModerationRule,
  deleteModerationRule,
  getReviewQueueItem,
  submitAppeal,
  getAppeal,
  queryAppeals,
];
