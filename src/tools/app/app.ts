import type { GetApplicationResponse, GetRateLimitsResponse } from "@stream-io/node-sdk";
import { z } from "zod";
import { ToolInputError } from "../../utils/errors.js";

/**
 * Every field Stream's UpdateAppRequest accepts. The SDK builds its request
 * body from this fixed list, so anything outside it is dropped without error.
 */
const APP_SETTING_KEYS = new Set([
  "activity_metrics_config",
  "allowed_flag_reasons",
  "apn_config",
  "async_moderation_config",
  "async_url_enrich_enabled",
  "auto_translation_enabled",
  "before_message_send_hook_attempt_timeout_ms",
  "before_message_send_hook_url",
  "cdn_expiration_seconds",
  "channel_hide_members_only",
  "chat_primary_use_case",
  "custom_action_handler_url",
  "datadog_info",
  "disable_auth_checks",
  "disable_permissions_checks",
  "enable_hook_payload_compression",
  "enforce_unique_usernames",
  "event_hooks",
  "feed_audit_logs_enabled",
  "feeds_moderation_enabled",
  "file_upload_config",
  "firebase_config",
  "grants",
  "guest_user_creation_disabled",
  "huawei_config",
  "image_moderation_block_labels",
  "image_moderation_enabled",
  "image_moderation_labels",
  "image_upload_config",
  "max_aggregated_activities_length",
  "member_custom_on_messages_enabled",
  "moderation_analytics_enabled",
  "moderation_dashboard_preferences",
  "moderation_enabled",
  "moderation_onboarding_complete",
  "moderation_webhook_url",
  "multi_tenant_enabled",
  "permission_version",
  "push_config",
  "reminders_interval",
  "reminders_max_members",
  "reminders_max_per_user",
  "revoke_tokens_issued_before",
  "sns_key",
  "sns_secret",
  "sns_topic_arn",
  "sqs_key",
  "sqs_secret",
  "sqs_url",
  "user_response_time_enabled",
  "user_search_disallowed_roles",
  "video_primary_use_case",
  "webhook_events",
  "webhook_url",
  "xiaomi_config",
]);
import { defineTool, type AnyToolDef } from "../define.js";

const getAppSettings = defineTool({
  name: "app_get_settings",
  title: "Get app settings",
  toolset: "app",
  description:
    "Read the Stream app's configuration: enabled features, permission version, webhook URLs, push providers, file upload rules and channel/call type summaries.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {},
  // The raw payload embeds every channel and call type config (~55KB). Those
  // have dedicated tools, so drop them and keep the app-level settings.
  compact: (raw: GetApplicationResponse) => {
    const { channel_configs, call_types, policies, grants, ...app } = raw.app;
    return {
      app,
      _omitted: {
        channel_configs: Object.keys(channel_configs ?? {}),
        call_types: Object.keys(call_types ?? {}),
        policy_count: policies?.length,
        role_count: Object.keys(grants ?? {}).length,
      },
      _hint:
        "Use chat_get_channel_type / video_get_call_type for the omitted per-type configuration.",
    };
  },
  handler: async (_args, client) => client.getApp(),
});

const updateAppSettings = defineTool({
  name: "app_update_settings",
  title: "Update app settings",
  toolset: "app",
  description:
    "Update the Stream app's configuration. Changes are global and take effect immediately — read the current settings with app_get_settings first. Pass only the keys you intend to change, e.g. {webhook_url: 'https://…'} or {multi_tenant_enabled: true}.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    settings: z
      .record(z.string(), z.unknown())
      .describe(
        "Settings to change, e.g. {webhook_url: 'https://example.com/hook', webhook_events: ['message.new'], async_url_enrich_enabled: true}"
      ),
  },
  handler: async (args, client) => {
    // The SDK serialises only the named UpdateAppRequest fields, so a typo
    // would be dropped silently and the call would report success having
    // changed nothing.
    const unknown = Object.keys(args.settings).filter((key) => !APP_SETTING_KEYS.has(key));
    if (unknown.length > 0) {
      throw new ToolInputError(
        `Unknown app setting(s): ${unknown.join(", ")}. Stream ignores unrecognised keys, so this would have silently done nothing. Valid keys: ${[...APP_SETTING_KEYS].sort().join(", ")}`
      );
    }
    return client.updateApp(args.settings);
  },
});

const getRateLimits = defineTool({
  name: "app_get_rate_limits",
  title: "Get rate limits",
  toolset: "app",
  description:
    "Read the app's current API rate limits and remaining quota, optionally narrowed to specific endpoints.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    server_side: z.boolean().optional().describe("Include server-side limits"),
    endpoints: z
      .string()
      .optional()
      .describe(
        "Comma-separated endpoint names to narrow the result, e.g. 'QueryChannels,SendMessage'"
      ),
  },
  // The app exposes ~230 endpoints; only the ones with consumed quota matter.
  compact: (raw: GetRateLimitsResponse) => {
    const summarise = (group: Record<string, any> | undefined) => {
      if (!group) return undefined;
      const used = Object.entries(group).filter(
        ([, value]) => value?.remaining !== undefined && value.remaining < value.limit
      );
      return {
        endpoint_count: Object.keys(group).length,
        consumed: Object.fromEntries(used.slice(0, 40)),
      };
    };
    return {
      server_side: summarise(raw.server_side),
      android: summarise(raw.android),
      ios: summarise(raw.ios),
      web: summarise(raw.web),
      _hint:
        "Only endpoints with consumed quota are listed. Pass `endpoints` to inspect specific ones, or verbose:true for all.",
    };
  },
  handler: async (args, client) =>
    client.getRateLimits({
      ...(args.server_side !== undefined
        ? { server_side: args.server_side }
        : { server_side: true }),
      ...(args.endpoints !== undefined && { endpoints: args.endpoints }),
    }),
});

const getTask = defineTool({
  name: "app_get_task",
  title: "Get async task status",
  toolset: "app",
  description:
    "Poll an asynchronous task started by chat_export_channels or users_delete. Returns its status and, once complete, the result or download URL.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { task_id: z.string().min(1).describe("Task ID returned by the operation") },
  handler: async (args, client) => client.getTask({ id: args.task_id }),
});

export const appTools: AnyToolDef[] = [getAppSettings, updateAppSettings, getRateLimits, getTask];
