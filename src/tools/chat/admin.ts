import type { ListChannelTypesResponse } from "@stream-io/node-sdk";
import { z } from "zod";
import { defined } from "../../schemas/common.js";
import { defineTool, type AnyToolDef } from "../define.js";

const listChannelTypes = defineTool({
  name: "chat_list_channel_types",
  title: "List channel types",
  toolset: "chat-admin",
  description:
    "List the app's channel types with their key feature flags. Returns a summary — use chat_get_channel_type for one type's full configuration and permission grants.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {},
  // The full listing is ~44KB of config blobs; summarise it instead.
  compact: (raw: ListChannelTypesResponse) => ({
    channel_types: Object.values(raw.channel_types ?? {}).map((type) => ({
      name: type.name,
      typing_events: type.typing_events,
      read_events: type.read_events,
      replies: type.replies,
      reactions: type.reactions,
      uploads: type.uploads,
      search: type.search,
      mutes: type.mutes,
      max_message_length: type.max_message_length,
      message_retention: type.message_retention,
      automod: type.automod,
      automod_behavior: type.automod_behavior,
      roles: Object.keys(type.grants ?? {}),
      commands: type.commands,
    })),
    _hint: "Use chat_get_channel_type for one type's full settings and grants.",
  }),
  handler: async (_args, client) => client.chat.listChannelTypes(),
});

const getChannelType = defineTool({
  name: "chat_get_channel_type",
  title: "Get channel type",
  toolset: "chat-admin",
  description: "Get one channel type's full configuration, including its permission grants.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Channel type name, e.g. 'messaging'"),
  },
  compact: false,
  handler: async (args, client) => client.chat.getChannelType({ name: args.name }),
});

const createChannelType = defineTool({
  name: "chat_create_channel_type",
  title: "Create channel type",
  toolset: "chat-admin",
  description:
    "Create a custom channel type. `automod`, `automod_behavior` and `max_message_length` are required by Stream. Read an existing type with chat_get_channel_type first to see sensible values.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Unique channel type name"),
    automod: z
      .enum(["disabled", "simple", "AI"])
      .describe("Automod mode. Use 'disabled' unless you have moderation configured."),
    automod_behavior: z.enum(["flag", "block"]).describe("What automod does on a match"),
    max_message_length: z
      .int()
      .min(1)
      .max(10000)
      .describe("Maximum message length in characters (Stream's default is 5000)"),
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Additional settings, e.g. {typing_events: true, read_events: true, replies: true, reactions: true, uploads: true, message_retention: 'infinite'}"
      ),
    grants: z
      .record(z.string(), z.array(z.string()))
      .optional()
      .describe("Permission grants keyed by role, e.g. {channel_member: ['read-channel']}"),
  },
  compact: false,
  handler: async (args, client) =>
    client.chat.createChannelType({
      ...(args.settings ?? {}),
      name: args.name,
      automod: args.automod,
      automod_behavior: args.automod_behavior,
      max_message_length: args.max_message_length,
      ...defined({ grants: args.grants }),
    }),
});

const updateChannelType = defineTool({
  name: "chat_update_channel_type",
  title: "Update channel type",
  toolset: "chat-admin",
  description:
    "Update a channel type's settings or permission grants. Applies to every channel of that type, app-wide. Stream requires `automod`, `automod_behavior` and `max_message_length` on every update — read the current values with chat_get_channel_type and pass them back unchanged if you are not changing them.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Channel type name"),
    automod: z.enum(["disabled", "simple", "AI"]).describe("Automod mode"),
    automod_behavior: z
      .enum(["flag", "block", "shadow_block"])
      .describe("What automod does on a match"),
    max_message_length: z.int().min(1).max(10000).describe("Maximum message length in characters"),
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Other settings to change, e.g. {typing_events: false, replies: true}"),
    grants: z
      .record(z.string(), z.array(z.string()))
      .optional()
      .describe("Permission grants keyed by role"),
  },
  compact: false,
  handler: async (args, client) =>
    client.chat.updateChannelType({
      ...(args.settings ?? {}),
      name: args.name,
      automod: args.automod,
      automod_behavior: args.automod_behavior,
      max_message_length: args.max_message_length,
      ...defined({ grants: args.grants }),
    }),
});

const deleteChannelType = defineTool({
  name: "chat_delete_channel_type",
  title: "Delete channel type",
  toolset: "chat-admin",
  description:
    "Delete a custom channel type. Fails if any channel of that type still exists. Built-in types cannot be deleted.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Channel type name to delete"),
  },
  handler: async (args, client) => client.chat.deleteChannelType({ name: args.name }),
});

const exportChannels = defineTool({
  name: "chat_export_channels",
  title: "Export channels",
  toolset: "chat-admin",
  description:
    "Start an asynchronous export of one or more channels and their messages. Returns a task id — poll it with app_get_task to get the download URL.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    channel_cids: z
      .array(z.string().min(1))
      .min(1)
      .max(25)
      .describe("Channel CIDs to export, e.g. ['messaging:general']"),
    include_truncated_messages: z
      .boolean()
      .optional()
      .describe("Include messages removed by a truncate"),
    clear_deleted_message_text: z.boolean().optional().describe("Blank out deleted message text"),
  },
  handler: async (args, client) =>
    client.chat.exportChannels(
      defined({
        channels: args.channel_cids.map((cid) => ({ cid })),
        include_truncated_messages: args.include_truncated_messages,
        clear_deleted_message_text: args.clear_deleted_message_text,
      })
    ),
});

export const chatAdminTools: AnyToolDef[] = [
  listChannelTypes,
  getChannelType,
  createChannelType,
  updateChannelType,
  deleteChannelType,
  exportChannels,
];
