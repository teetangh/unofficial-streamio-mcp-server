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
  compact: false,
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
