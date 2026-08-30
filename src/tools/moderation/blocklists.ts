import { z } from "zod";
import { defined } from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { defineTool, type ToolDef } from "../define.js";

const listBlockLists = defineTool({
  name: "moderation_list_blocklists",
  title: "List blocklists",
  toolset: "moderation",
  description:
    "List the app's word blocklists, including Stream's built-in lists. Blocklists are attached to a channel type to take effect.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    team: z.string().optional().describe("Restrict to a team (multi-tenant apps)"),
  },
  handler: async (args, client) => client.listBlockLists(defined({ team: args.team })),
});

const getBlockList = defineTool({
  name: "moderation_get_blocklist",
  title: "Get blocklist",
  toolset: "moderation",
  description: "Get one blocklist and its words.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Blocklist name"),
    team: z.string().optional().describe("Team the blocklist belongs to"),
  },
  handler: async (args, client) =>
    client.getBlockList(defined({ name: args.name, team: args.team })),
});

const createBlockList = defineTool({
  name: "moderation_create_blocklist",
  title: "Create blocklist",
  toolset: "moderation",
  description:
    "Create a word blocklist. Attach it to a channel type with chat_update_channel_type to enforce it.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Unique blocklist name"),
    words: z.array(z.string().min(1)).min(1).describe("Words or patterns to block"),
    type: z
      .enum(["word", "regex", "domain", "domain_allowlist", "email", "email_allowlist"])
      .optional()
      .describe("How the entries are interpreted. Default: word."),
    is_substring_matching_enabled: z
      .boolean()
      .optional()
      .describe("Match the words anywhere inside a longer word"),
    is_plural_check_enabled: z.boolean().optional().describe("Also match plural forms"),
    is_leet_check_enabled: z.boolean().optional().describe("Also match leetspeak substitutions"),
    team: z.string().optional().describe("Team the blocklist belongs to"),
  },
  handler: async (args, client) =>
    client.createBlockList(
      defined({
        name: args.name,
        words: args.words,
        type: args.type,
        is_substring_matching_enabled: args.is_substring_matching_enabled,
        is_plural_check_enabled: args.is_plural_check_enabled,
        is_leet_check_enabled: args.is_leet_check_enabled,
        team: args.team,
      })
    ),
});

const updateBlockList = defineTool({
  name: "moderation_update_blocklist",
  title: "Update blocklist",
  toolset: "moderation",
  description:
    "Update a blocklist. `words` replaces the entire list — read the current words with moderation_get_blocklist first if you are adding to it.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Blocklist name"),
    words: z.array(z.string().min(1)).optional().describe("Replacement word list"),
    is_substring_matching_enabled: z.boolean().optional(),
    is_plural_check_enabled: z.boolean().optional(),
    is_leet_check_enabled: z.boolean().optional(),
    team: z.string().optional().describe("Team the blocklist belongs to"),
  },
  handler: async (args, client) => {
    const payload = defined({
      words: args.words,
      is_substring_matching_enabled: args.is_substring_matching_enabled,
      is_plural_check_enabled: args.is_plural_check_enabled,
      is_leet_check_enabled: args.is_leet_check_enabled,
      team: args.team,
    });
    if (Object.keys(payload).length === 0) {
      throw new ToolInputError("Nothing to update — pass `words` or at least one matching option.");
    }
    return client.updateBlockList({ name: args.name, ...payload });
  },
});

const deleteBlockList = defineTool({
  name: "moderation_delete_blocklist",
  title: "Delete blocklist",
  toolset: "moderation",
  description: "Delete a custom blocklist. Stream's built-in lists cannot be deleted.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Blocklist name to delete"),
    team: z.string().optional().describe("Team the blocklist belongs to"),
  },
  handler: async (args, client) =>
    client.deleteBlockList(defined({ name: args.name, team: args.team })),
});

export const blocklistTools: ToolDef<any>[] = [
  listBlockLists,
  getBlockList,
  createBlockList,
  updateBlockList,
  deleteBlockList,
];
