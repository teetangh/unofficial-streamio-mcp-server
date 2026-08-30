import { z } from "zod";
import { defineTool, type ToolDef } from "../define.js";

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
  compact: (raw: { app?: Record<string, unknown> }) => {
    const { channel_configs, call_types, policies, grants, ...app } = raw.app ?? {};
    return {
      app,
      _omitted: {
        channel_configs: Object.keys((channel_configs as object) ?? {}),
        call_types: Object.keys((call_types as object) ?? {}),
        policy_count: Array.isArray(policies) ? policies.length : undefined,
        role_count: Object.keys((grants as object) ?? {}).length,
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
  handler: async (args, client) => client.updateApp(args.settings as never),
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
  compact: (raw: Record<string, any>) => {
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

export const appTools: ToolDef<any>[] = [getAppSettings, updateAppSettings, getRateLimits, getTask];
