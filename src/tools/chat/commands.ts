import { z } from "zod";
import { defined, limit, nextCursor, prevCursor, sortParams } from "../../schemas/common.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const pushProviderType = z
  .enum(["apn", "firebase", "huawei", "xiaomi"])
  .describe("Push notification provider type");

const listCommands = defineTool({
  name: "chat_list_commands",
  title: "List slash commands",
  toolset: "chat-admin",
  description: "List all built-in and custom slash commands registered in the Stream application.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {},
  handler: async (_args, client) => client.chat.listCommands(),
});

const getCommand = defineTool({
  name: "chat_get_command",
  title: "Get slash command",
  toolset: "chat-admin",
  description: "Retrieve the configuration of a single custom or built-in slash command by name.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    name: z.string().min(1).describe("Slash command name, e.g. 'giphy' or 'ticket'"),
  },
  handler: async (args, client) => client.chat.getCommand({ name: args.name }),
});

const createCommand = defineTool({
  name: "chat_create_command",
  title: "Create slash command",
  toolset: "chat-admin",
  description: "Register a new custom slash command that can be enabled on channel types.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    name: z.string().min(1).describe("Unique command name without leading slash, e.g. 'ticket'"),
    description: z
      .string()
      .min(1)
      .describe("Human-readable description shown in command autocomplete"),
    args: z
      .string()
      .optional()
      .describe("Arguments usage hint shown in autocomplete, e.g. '[text]'"),
    set: z.string().optional().describe("Command group or set name used for organizing commands"),
  },
  handler: async (args, client) =>
    client.chat.createCommand(
      defined({
        name: args.name,
        description: args.description,
        args: args.args,
        set: args.set,
      })
    ),
});

const updateCommand = defineTool({
  name: "chat_update_command",
  title: "Update slash command",
  toolset: "chat-admin",
  description:
    "Replace an existing custom slash command's configuration (full update: omitting args or set resets them to empty strings).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    name: z.string().min(1).describe("Command name to update"),
    description: z.string().min(1).describe("Updated description shown in command autocomplete"),
    args: z.string().optional().describe("Updated arguments usage hint, e.g. '[text]'"),
    set: z.string().optional().describe("Updated command group or set name"),
  },
  handler: async (args, client) =>
    client.chat.updateCommand(
      defined({
        name: args.name,
        description: args.description,
        args: args.args,
        set: args.set,
      })
    ),
});

const deleteCommand = defineTool({
  name: "chat_delete_command",
  title: "Delete slash command",
  toolset: "chat-admin",
  description: "Delete a custom slash command by name. Built-in commands cannot be deleted.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Custom command name to delete"),
  },
  handler: async (args, client) => client.chat.deleteCommand({ name: args.name }),
});

const getPushTemplates = defineTool({
  name: "chat_get_push_templates",
  title: "Get push notification templates",
  toolset: "chat-admin",
  description:
    "Retrieve push notification payload templates configured for a push provider type. Requires Push v3 configured on the application.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    push_provider_type: pushProviderType,
    push_provider_name: z.string().optional().describe("Named push provider configuration"),
  },
  handler: async (args, client) =>
    client.getPushTemplates(
      defined({
        push_provider_type: args.push_provider_type,
        push_provider_name: args.push_provider_name,
      })
    ),
});

const upsertPushTemplate = defineTool({
  name: "chat_upsert_push_template",
  title: "Create or update push template",
  toolset: "chat-admin",
  description:
    "Create or update a push notification payload template for a specific event and push provider. Requires Push v3 configured on the application.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    push_provider_type: pushProviderType,
    event_type: z
      .enum(["message.new", "message.updated", "reaction.new", "notification.reminder_due"])
      .describe("Chat event type that triggers the push notification"),
    template: z.string().optional().describe("Push payload template string (Handlebars syntax)"),
    enable_push: z
      .boolean()
      .optional()
      .describe("Whether push notifications are enabled for this event type"),
    push_provider_name: z.string().optional().describe("Named push provider configuration"),
  },
  handler: async (args, client) =>
    client.upsertPushTemplate(
      defined({
        push_provider_type: args.push_provider_type,
        event_type: args.event_type,
        template: args.template,
        enable_push: args.enable_push,
        push_provider_name: args.push_provider_name,
      })
    ),
});

const deleteChannelsBatch = defineTool({
  name: "chat_delete_channels_batch",
  title: "Delete channels in batch",
  toolset: "chat-admin",
  description:
    "Delete multiple chat channels asynchronously in a single batch operation by their channel CIDs. Returns a task ID to poll with app_get_task.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    cids: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("Channel CIDs to delete, e.g. ['messaging:general'] (max 100)"),
    hard_delete: z
      .boolean()
      .optional()
      .describe("Permanently remove channels and all their messages"),
  },
  handler: async (args, client) =>
    client.chat.deleteChannels(
      defined({
        cids: args.cids,
        hard_delete: args.hard_delete,
      })
    ),
});

const unreadCountsBatch = defineTool({
  name: "chat_unread_counts_batch",
  title: "Get unread counts in batch",
  toolset: "chat",
  description:
    "Fetch unread message and channel counts for multiple users in a single batch request.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    user_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("User IDs to fetch unread counts for (max 100)"),
  },
  handler: async (args, client) => client.chat.unreadCountsBatch({ user_ids: args.user_ids }),
});

const queryMessageHistory = defineTool({
  name: "chat_query_message_history",
  title: "Query message edit history",
  toolset: "chat",
  description:
    "Query the version history of edited messages across channels using filter conditions and cursor pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    filter: z
      .record(z.string(), z.unknown())
      .describe("Filter conditions for message history, e.g. {message_id: 'm1'}"),
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.chat.queryMessageHistory(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

export const commandAndBatchTools: AnyToolDef[] = [
  listCommands,
  getCommand,
  createCommand,
  updateCommand,
  deleteCommand,
  getPushTemplates,
  upsertPushTemplate,
  deleteChannelsBatch,
  unreadCountsBatch,
  queryMessageHistory,
];
