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

const moderationActionEnum = z.enum([
  "flag",
  "shadow",
  "remove",
  "bounce",
  "bounce_flag",
  "bounce_remove",
]);

const bodyguardSeverityRuleSchema = z.looseObject({
  action: z
    .enum(["keep", "flag", "mask", "shadow", "remove", "bounce", "bounce_flag", "bounce_remove"])
    .describe("Moderation action for this severity level"),
  severity: z.enum(["low", "medium", "high", "critical"]).describe("Severity level threshold"),
});

const bodyguardRuleSchema = z.looseObject({
  label: z.string().min(1).describe("Harm category label"),
  action: z
    .enum([
      "keep",
      "flag",
      "mask",
      "mask_flag",
      "shadow",
      "remove",
      "bounce",
      "bounce_flag",
      "bounce_remove",
    ])
    .optional()
    .describe("Action taken when the label triggers"),
  severity_rules: z
    .array(bodyguardSeverityRuleSchema)
    .optional()
    .describe("Per-severity action overrides"),
});

const aiTextConfigSchema = z.looseObject({
  async: z.boolean().optional().describe("Run AI text moderation asynchronously"),
  enabled: z.boolean().optional().describe("Enable AI text moderation"),
  profile: z.string().optional().describe("Bodyguard credential profile name"),
  rules: z.array(bodyguardRuleSchema).optional().describe("Per-label moderation rules"),
  severity_rules: z
    .array(bodyguardSeverityRuleSchema)
    .optional()
    .describe("Default severity rules"),
});

const awsRekognitionRuleSchema = z.looseObject({
  label: z.string().min(1).describe("Image or video harm label"),
  min_confidence: z.number().describe("Minimum confidence threshold (0-100)"),
  action: moderationActionEnum.describe("Action taken when label exceeds threshold"),
  subclassifications: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("L2 subclassification overrides"),
});

const aiImageConfigSchema = z.looseObject({
  async: z.boolean().optional().describe("Run AI image moderation asynchronously"),
  enabled: z.boolean().optional().describe("Enable AI image moderation"),
  ocr_rules: z
    .array(
      z.looseObject({
        label: z.string().min(1).describe("OCR rule label"),
        action: moderationActionEnum.describe("Action taken when OCR rule matches"),
      })
    )
    .optional()
    .describe("Image OCR moderation rules"),
  rules: z.array(awsRekognitionRuleSchema).optional().describe("Image classification rules"),
});

const aiVideoConfigSchema = z.looseObject({
  async: z.boolean().optional().describe("Run AI video moderation asynchronously"),
  enabled: z.boolean().optional().describe("Enable AI video moderation"),
  rules: z.array(awsRekognitionRuleSchema).optional().describe("Video classification rules"),
});

const aiAudioConfigSchema = z.looseObject({
  profile: z.string().optional().describe("Audio moderation profile name"),
  rules: z.array(bodyguardRuleSchema).optional().describe("Audio moderation rules"),
});

const blockListConfigSchema = z.looseObject({
  async: z.boolean().optional().describe("Run blocklist check asynchronously"),
  enabled: z.boolean().optional().describe("Enable word blocklist moderation"),
  match_substring: z
    .boolean()
    .optional()
    .describe("Match blocked words as substrings inside tokens"),
  rules: z
    .array(
      z.looseObject({
        action: z
          .enum([
            "flag",
            "mask",
            "mask_flag",
            "shadow",
            "remove",
            "bounce",
            "bounce_flag",
            "bounce_remove",
          ])
          .describe("Action taken when the blocklist matches"),
        name: z.string().optional().describe("Blocklist name"),
        team: z.string().optional().describe("Team scope for the blocklist"),
      })
    )
    .optional()
    .describe("Blocklist rules to evaluate"),
});

const automodConfigSchema = z.looseObject({
  async: z.boolean().optional().describe("Run check asynchronously"),
  enabled: z.boolean().optional().describe("Enable this automod filter"),
  rules: z
    .array(
      z.looseObject({
        label: z.string().min(1).describe("Automod rule label"),
        threshold: z.number().describe("Score threshold (0-1) required to trigger"),
        action: moderationActionEnum.describe("Action taken when threshold is exceeded"),
      })
    )
    .optional()
    .describe("Filter rules and thresholds"),
});

const automodSemanticFiltersConfigSchema = z.looseObject({
  async: z.boolean().optional().describe("Run semantic filter check asynchronously"),
  enabled: z.boolean().optional().describe("Enable semantic filters"),
  rules: z
    .array(
      z.looseObject({
        name: z.string().min(1).describe("Semantic filter name"),
        threshold: z.number().describe("Similarity threshold"),
        action: moderationActionEnum.describe("Action taken when filter matches"),
      })
    )
    .optional()
    .describe("Semantic filter rules"),
});

const llmConfigSchema = z.looseObject({
  app_context: z.string().optional().describe("Application context provided to the moderation LLM"),
  async: z.boolean().optional().describe("Run LLM moderation asynchronously"),
  enabled: z.boolean().optional().describe("Enable LLM moderation"),
  rules: z
    .array(
      z.looseObject({
        label: z.string().min(1).describe("Harm category label"),
        action: z
          .enum(["flag", "shadow", "remove", "bounce", "bounce_flag", "bounce_remove", "keep"])
          .optional()
          .describe("Action when label matches"),
        description: z.string().optional().describe("Description of the harm category"),
        severity_rules: z
          .array(bodyguardSeverityRuleSchema)
          .optional()
          .describe("Per-severity actions"),
      })
    )
    .optional()
    .describe("LLM moderation rules"),
  severity_descriptions: z
    .record(z.string(), z.string())
    .optional()
    .describe("Custom descriptions per severity level"),
});

const floodConfigSchema = z.looseObject({
  allowlist: z
    .array(z.string().min(1))
    .optional()
    .describe("User IDs exempt from flood protection"),
  identical: z
    .looseObject({
      action: z.string().optional().describe("Action when identical message flood is detected"),
      enabled: z.boolean().optional().describe("Enable identical message flood detection"),
      threshold: z.int().optional().describe("Max identical messages in time window"),
      time_window: z.string().optional().describe("Window duration, e.g. '1m'"),
    })
    .optional()
    .describe("Identical message flood settings"),
  similar: z
    .looseObject({
      action: z.string().optional().describe("Action when similar message flood is detected"),
      enabled: z.boolean().optional().describe("Enable similar message flood detection"),
      similarity_distance: z.int().optional().describe("Edit distance threshold"),
      threshold: z.int().optional().describe("Max similar messages in time window"),
      time_window: z.string().optional().describe("Window duration, e.g. '1m'"),
    })
    .optional()
    .describe("Similar message flood settings"),
});

const googleVisionConfigSchema = z.looseObject({
  enabled: z.boolean().optional().describe("Enable Google Cloud Vision image moderation"),
});

const velocityFilterRuleSchema = z.looseObject({
  action: z
    .enum(["flag", "shadow", "remove", "ban"])
    .describe("Action taken when velocity threshold is exceeded"),
  ban_duration: z.int().optional().describe("Ban duration in seconds"),
  cascading_action: z
    .enum(["flag", "shadow", "remove", "ban"])
    .optional()
    .describe("Escalated action on repeated violations"),
  cascading_threshold: z.int().optional().describe("Violation count before cascading_action runs"),
  check_message_context: z.boolean().optional().describe("Evaluate message context"),
  fast_spam_threshold: z.int().optional().describe("Fast spam message count threshold"),
  fast_spam_ttl: z.int().optional().describe("Fast spam window in seconds"),
  ip_ban: z.boolean().optional().describe("Also ban the user's IP address"),
  probation_period: z.int().optional().describe("Probation period in seconds"),
  shadow_ban: z.boolean().optional().describe("Apply a shadow ban"),
  slow_spam_ban_duration: z.int().optional().describe("Ban duration for slow spam in seconds"),
  slow_spam_threshold: z.int().optional().describe("Slow spam message count threshold"),
  slow_spam_ttl: z.int().optional().describe("Slow spam window in seconds"),
  url_only: z.boolean().optional().describe("Count only messages containing URLs"),
});

const velocityFilterConfigSchema = z.looseObject({
  advanced_filters: z.boolean().optional().describe("Enable advanced velocity filters"),
  async: z.boolean().optional().describe("Run velocity filter asynchronously"),
  cascading_actions: z.boolean().optional().describe("Enable cascading escalation actions"),
  cids_per_user: z.int().optional().describe("Max channels a user can message per window"),
  enabled: z.boolean().optional().describe("Enable velocity spam filter"),
  first_message_only: z.boolean().optional().describe("Evaluate only first messages in channels"),
  rules: z.array(velocityFilterRuleSchema).optional().describe("Velocity spam filter rules"),
});

const ruleConditionSchema = z.looseObject({
  type: z
    .string()
    .optional()
    .describe("Condition type, e.g. 'content_count', 'text_rule', 'image_rule', or 'user_rule'"),
  confidence: z.number().optional().describe("Minimum confidence threshold"),
  call_custom_property_params: z
    .looseObject({
      operator: z.string().optional().describe("Comparison operator"),
      property_key: z.string().optional().describe("Custom call property key"),
    })
    .optional()
    .describe("Parameters for call_custom_property conditions"),
  call_type_rule_params: z
    .looseObject({
      call_type: z.string().optional().describe("Call type name"),
    })
    .optional()
    .describe("Parameters for call_type conditions"),
  call_violation_count_params: z
    .looseObject({
      threshold: z.int().optional().describe("Violation count threshold in call"),
      time_window: z.string().optional().describe("Evaluation window, e.g. '10m'"),
    })
    .optional()
    .describe("Parameters for call_violation_count conditions"),
  channel_message_count_rule_params: z
    .looseObject({
      operator: z.string().optional().describe("Comparison operator"),
      threshold: z.int().optional().describe("Channel message count threshold"),
    })
    .optional()
    .describe("Parameters for channel_message_count conditions"),
  closed_caption_rule_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Closed caption harm labels"),
      llm_harm_labels: z
        .record(z.string(), z.string())
        .optional()
        .describe("LLM harm label severity map"),
      severity: z.string().optional().describe("Minimum severity"),
      threshold: z.int().optional().describe("Violation count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for closed_caption conditions"),
  content_count_rule_params: z
    .looseObject({
      threshold: z.int().optional().describe("Message/content count threshold"),
      time_window: z.string().optional().describe("Evaluation window, e.g. '1h' or '24h'"),
    })
    .optional()
    .describe("Parameters for content_count conditions"),
  content_custom_property_count_params: z
    .looseObject({
      operator: z.string().optional().describe("Comparison operator"),
      property_key: z.string().optional().describe("Custom content property key"),
      threshold: z.int().optional().describe("Count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for content_custom_property_count conditions"),
  content_custom_property_params: z
    .looseObject({
      operator: z.string().optional().describe("Comparison operator"),
      property_key: z.string().optional().describe("Custom content property key"),
    })
    .optional()
    .describe("Parameters for content_custom_property conditions"),
  content_flag_count_rule_params: z
    .looseObject({
      threshold: z.int().optional().describe("Flag count threshold on content"),
    })
    .optional()
    .describe("Parameters for content_flag_count conditions"),
  flood_identical_params: z
    .looseObject({
      allowlist: z.array(z.string()).optional().describe("Exempt user IDs"),
      min_text_length: z.int().optional().describe("Minimum text length to evaluate"),
      threshold: z.int().optional().describe("Identical message threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
      track_across_users: z.boolean().optional().describe("Track identical messages across users"),
    })
    .optional()
    .describe("Parameters for flood_identical conditions"),
  flood_similar_params: z
    .looseObject({
      allowlist: z.array(z.string()).optional().describe("Exempt user IDs"),
      min_text_length: z.int().optional().describe("Minimum text length to evaluate"),
      similarity_distance: z.int().optional().describe("Edit distance threshold"),
      threshold: z.int().optional().describe("Similar message threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for flood_similar conditions"),
  image_content_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Image harm labels"),
      label_operator: z.string().optional().describe("Operator combining labels"),
      min_confidence: z.number().optional().describe("Minimum confidence threshold"),
    })
    .optional()
    .describe("Parameters for image_content conditions"),
  image_rule_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Image harm labels to match"),
      min_confidence: z.number().optional().describe("Minimum confidence threshold"),
      threshold: z.int().optional().describe("Violation count threshold"),
      time_window: z.string().optional().describe("Evaluation window, e.g. '1h'"),
    })
    .optional()
    .describe("Parameters for image_rule conditions"),
  ip_content_count_rule_params: z
    .looseObject({
      threshold: z.int().optional().describe("Content count threshold per IP"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for ip_content_count conditions"),
  ip_flag_count_rule_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Harm labels"),
      severity: z.string().optional().describe("Minimum severity"),
      threshold: z.int().optional().describe("Flag count threshold per IP"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for ip_flag_count conditions"),
  keyframe_ocr_rule_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Keyframe OCR harm labels"),
      threshold: z.int().optional().describe("Violation count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for keyframe_ocr conditions"),
  keyframe_rule_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Keyframe harm labels"),
      min_confidence: z.number().optional().describe("Minimum confidence threshold"),
      threshold: z.int().optional().describe("Violation count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for keyframe_rule conditions"),
  ocr_content_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("OCR harm labels"),
      label_operator: z.string().optional().describe("Operator combining labels"),
      severity: z.string().optional().describe("Minimum severity"),
    })
    .optional()
    .describe("Parameters for ocr_content conditions"),
  text_content_params: z
    .looseObject({
      blocklist_match: z.array(z.string()).optional().describe("Blocklist names to match"),
      contains_url: z.boolean().optional().describe("Require text to contain a URL"),
      harm_labels: z.array(z.string()).optional().describe("Text harm labels"),
      label_operator: z.string().optional().describe("Operator combining labels"),
      llm_harm_labels: z
        .record(z.string(), z.string())
        .optional()
        .describe("LLM harm label severity map"),
      severity: z.string().optional().describe("Minimum severity"),
      text_length: z.int().optional().describe("Text length threshold"),
      text_length_operator: z.string().optional().describe("Text length comparison operator"),
    })
    .optional()
    .describe("Parameters for text_content conditions"),
  text_rule_params: z
    .looseObject({
      blocklist_match: z.array(z.string()).optional().describe("Blocklist names to match"),
      contains_url: z.boolean().optional().describe("Require text to contain a URL"),
      harm_labels: z.array(z.string()).optional().describe("Harm labels to match"),
      llm_harm_labels: z
        .record(z.string(), z.string())
        .optional()
        .describe("LLM harm label severity map"),
      semantic_filter_min_threshold: z
        .number()
        .optional()
        .describe("Minimum semantic filter threshold"),
      semantic_filter_names: z
        .array(z.string())
        .optional()
        .describe("Semantic filter names to match"),
      severity: z.string().optional().describe("Minimum severity"),
      threshold: z.int().optional().describe("Violation count threshold"),
      time_window: z.string().optional().describe("Evaluation window, e.g. '1h'"),
    })
    .optional()
    .describe("Parameters for text_rule conditions"),
  user_channel_count_params: z
    .looseObject({
      threshold: z.int().optional().describe("Channel count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for user_channel_count conditions"),
  user_created_within_params: z
    .looseObject({
      max_age: z.string().optional().describe("Maximum account age, e.g. '24h' or '7d'"),
    })
    .optional()
    .describe("Parameters for user_created_within conditions"),
  user_custom_property_params: z
    .looseObject({
      operator: z.string().optional().describe("Comparison operator"),
      property_key: z.string().optional().describe("Custom user property key"),
    })
    .optional()
    .describe("Parameters for user_custom_property conditions"),
  user_flag_count_rule_params: z
    .looseObject({
      threshold: z.int().optional().describe("Flag count threshold on user"),
    })
    .optional()
    .describe("Parameters for user_flag_count conditions"),
  user_identical_content_count_params: z
    .looseObject({
      threshold: z.int().optional().describe("Identical content count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for user_identical_content_count conditions"),
  user_identical_image_count_params: z
    .looseObject({
      match: z.string().optional().describe("Image match mode"),
      similarity_distance: z.int().optional().describe("Perceptual hash distance threshold"),
      threshold: z.int().optional().describe("Identical image count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for user_identical_image_count conditions"),
  user_reaction_count_params: z
    .looseObject({
      count: z.string().optional().describe("Reaction count expression"),
      threshold: z.int().optional().describe("Reaction count threshold"),
      time_window: z.string().optional().describe("Evaluation window"),
    })
    .optional()
    .describe("Parameters for user_reaction_count conditions"),
  user_role_params: z
    .looseObject({
      operator: z.string().optional().describe("Comparison operator"),
      role: z.string().optional().describe("User role to match"),
    })
    .optional()
    .describe("Parameters for user_role conditions"),
  user_rule_params: z
    .looseObject({
      max_age: z.string().optional().describe("Maximum account age, e.g. '7d'"),
    })
    .optional()
    .describe("Parameters for user_rule conditions"),
  video_content_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Video harm labels"),
      label_operator: z.string().optional().describe("Operator combining labels"),
    })
    .optional()
    .describe("Parameters for video_content conditions"),
  video_rule_params: z
    .looseObject({
      harm_labels: z.array(z.string()).optional().describe("Video harm labels to match"),
      threshold: z.int().optional().describe("Violation count threshold"),
      time_window: z.string().optional().describe("Evaluation window, e.g. '1h'"),
    })
    .optional()
    .describe("Parameters for video_rule conditions"),
});

const ruleActionSchema = z.looseObject({
  type: z
    .enum([
      "ban_user",
      "flag_user",
      "flag_content",
      "block_content",
      "shadow_content",
      "bounce_flag_content",
      "bounce_content",
      "bounce_remove_content",
      "mute_video",
      "mute_audio",
      "blur",
      "call_blur",
      "end_call",
      "kick_user",
      "warning",
      "call_warning",
      "webhook_only",
    ])
    .optional()
    .describe("Automated action type"),
  reason: z.string().optional().describe("Moderation reason recorded when action triggers"),
  skip_inbox: z
    .boolean()
    .optional()
    .describe("Skip creating a review queue inbox item when this action triggers"),
  ban_options: z
    .looseObject({
      delete_messages: z
        .enum(["soft", "pruning", "hard"])
        .optional()
        .describe("Message deletion mode"),
      duration: z.int().optional().describe("Ban duration in seconds"),
      ip_ban: z.boolean().optional().describe("Also ban the user's IP address"),
      reason: z.string().optional().describe("Ban reason"),
      shadow_ban: z.boolean().optional().describe("Apply a shadow ban"),
    })
    .optional()
    .describe("Options when action type is ban_user"),
  call_options: z
    .looseObject({
      duration: z.int().optional().describe("Action duration in seconds"),
      flag_reason: z.string().optional().describe("Reason recorded on the flag"),
      kick_reason: z.string().optional().describe("Reason shown when kicking user from call"),
      mute_audio: z.boolean().optional().describe("Mute participant audio"),
      mute_video: z.boolean().optional().describe("Mute participant video"),
      reason: z.string().optional().describe("Moderation reason"),
      warning_text: z.string().optional().describe("Warning message sent to call participant"),
    })
    .optional()
    .describe("Options for call moderation actions"),
  flag_user_options: z
    .looseObject({
      reason: z.string().optional().describe("Reason for flagging the user"),
    })
    .optional()
    .describe("Options when action type is flag_user"),
});

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
    "Create or update a moderation policy configuration for text, image, video, audio, blocklists, LLM, circumvention, semantic filters, flood or toxicity.",
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
    user_id: z.string().optional().describe("User ID associated with the audit log entry"),
    ai_text_config: aiTextConfigSchema.optional().describe("AI text moderation configuration"),
    ai_image_config: aiImageConfigSchema.optional().describe("AI image moderation configuration"),
    ai_video_config: aiVideoConfigSchema.optional().describe("AI video moderation configuration"),
    ai_audio_config: aiAudioConfigSchema.optional().describe("AI audio moderation configuration"),
    aws_rekognition_config: aiImageConfigSchema
      .optional()
      .describe("AWS Rekognition image moderation configuration"),
    bodyguard_config: aiTextConfigSchema
      .optional()
      .describe("Bodyguard AI text moderation configuration"),
    block_list_config: blockListConfigSchema
      .optional()
      .describe("Word blocklist moderation configuration"),
    llm_config: llmConfigSchema.optional().describe("LLM-based moderation configuration"),
    automod_toxicity_config: automodConfigSchema
      .optional()
      .describe("Automated toxicity filter configuration"),
    automod_platform_circumvention_config: automodConfigSchema
      .optional()
      .describe("Automated platform circumvention filter configuration"),
    automod_semantic_filters_config: automodSemanticFiltersConfigSchema
      .optional()
      .describe("Automated semantic filters configuration"),
    flood_config: floodConfigSchema
      .optional()
      .describe("Flood and rate-limiting moderation configuration"),
    google_vision_config: googleVisionConfigSchema
      .optional()
      .describe("Google Vision image moderation configuration"),
    velocity_filter_config: velocityFilterConfigSchema
      .optional()
      .describe("Velocity spam filter configuration"),
  },
  handler: async (args, client) =>
    client.moderation.upsertConfig(
      defined({
        key: args.key,
        team: args.team,
        async: args.async,
        user_id: args.user_id,
        ai_text_config: args.ai_text_config,
        ai_image_config: args.ai_image_config,
        ai_video_config: args.ai_video_config,
        ai_audio_config: args.ai_audio_config,
        aws_rekognition_config: args.aws_rekognition_config,
        bodyguard_config: args.bodyguard_config,
        block_list_config: args.block_list_config,
        llm_config: args.llm_config,
        automod_toxicity_config: args.automod_toxicity_config,
        automod_platform_circumvention_config: args.automod_platform_circumvention_config,
        automod_semantic_filters_config: args.automod_semantic_filters_config,
        flood_config: args.flood_config,
        google_vision_config: args.google_vision_config,
        velocity_filter_config: args.velocity_filter_config,
      })
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
    rule_type: z.string().min(1).describe("Rule type, e.g. 'user', 'content', 'call', or 'flood'"),
    description: z.string().optional().describe("Human-readable description of the rule"),
    enabled: z.boolean().optional().describe("Whether the moderation rule is active"),
    cooldown_period: z
      .string()
      .optional()
      .describe("Cooldown duration before rule can trigger again, e.g. '24h' or '7d'"),
    config_keys: z
      .array(z.string().min(1))
      .optional()
      .describe("Moderation config keys this rule applies to"),
    conditions: z
      .array(ruleConditionSchema)
      .optional()
      .describe("Rule condition objects evaluated against content or user state"),
    groups: z
      .array(
        z.looseObject({
          logic: z.string().optional().describe("Logical operator within the group: 'AND' or 'OR'"),
          conditions: z
            .array(ruleConditionSchema)
            .optional()
            .describe("Conditions inside this condition group"),
        })
      )
      .optional()
      .describe("Nested condition groups"),
    action: ruleActionSchema.optional().describe("Action executed when the rule conditions match"),
    action_sequences: z
      .array(
        z.looseObject({
          violation_number: z.int().optional().describe("Violation number in the sequence"),
          actions: z.array(z.string()).optional().describe("Actions executed at this step"),
          call_options: z
            .looseObject({
              duration: z.int().optional().describe("Action duration in seconds"),
              flag_reason: z.string().optional().describe("Reason recorded on the flag"),
              kick_reason: z.string().optional().describe("Reason shown when kicking user"),
              mute_audio: z.boolean().optional().describe("Mute participant audio"),
              mute_video: z.boolean().optional().describe("Mute participant video"),
              reason: z.string().optional().describe("Moderation reason"),
              warning_text: z.string().optional().describe("Warning message sent to participant"),
            })
            .optional()
            .describe("Call action options for this step"),
        })
      )
      .optional()
      .describe("Escalation action sequences for call moderation rules"),
    logic: z.string().optional().describe("Boolean logic combining conditions, e.g. 'AND' or 'OR'"),
    team: z.string().optional().describe("Team the moderation rule belongs to"),
    user_id: z.string().optional().describe("User ID associated with the audit log entry"),
  },
  handler: async (args, client) =>
    client.moderation.upsertModerationRule(
      defined({
        name: args.name,
        rule_type: args.rule_type,
        description: args.description,
        enabled: args.enabled,
        cooldown_period: args.cooldown_period,
        config_keys: args.config_keys,
        conditions: args.conditions,
        groups: args.groups,
        action: args.action,
        action_sequences: args.action_sequences,
        logic: args.logic,
        team: args.team,
        user_id: args.user_id,
      })
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
      .describe(
        "Channel CID associated with the appeal (only used for channel-ban appeals), e.g. 'messaging:general'"
      ),
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
