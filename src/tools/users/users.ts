import { z } from "zod";
import {
  customData,
  defined,
  filterConditions,
  limit,
  offset,
  sortParams,
} from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const userSchema = z.object({
  id: z.string().min(1).describe("Unique user ID"),
  name: z.string().optional().describe("Display name"),
  role: z.string().optional().describe("App role, e.g. 'user', 'admin', 'moderator', 'guest'"),
  image: z.string().optional().describe("Avatar URL"),
  language: z.string().optional().describe("Preferred language code, e.g. 'en'"),
  teams: z.array(z.string()).optional().describe("Teams the user belongs to (multi-tenant apps)"),
  custom: customData,
});

const upsertUsers = defineTool({
  name: "chat_upsert_users",
  title: "Create or update users",
  toolset: "users",
  description:
    "Create or update users. This is a full upsert — fields you omit are cleared. For targeted edits use users_update_partial. Users must exist before they can be added to channels or calls.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  aliases: ["users_upsert"],
  inputSchema: {
    users: z.array(userSchema).min(1).max(100).describe("Users to create or update (max 100)"),
  },
  handler: async (args, client) => {
    const ids = args.users.map((user) => user.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      // upsertUsers keys a map by id, so duplicates would silently collapse.
      throw new ToolInputError(
        `Duplicate user id(s): ${[...new Set(duplicates)].join(", ")}. Each id may appear once.`
      );
    }
    return client.upsertUsers(args.users.map((user) => defined(user)));
  },
});

const queryUsers = defineTool({
  name: "chat_query_users",
  title: "Query users",
  toolset: "users",
  description:
    "Search and filter users. Common filters: {id: {$in: ['alice','bob']}}, {role: {$eq: 'admin'}}, {name: {$autocomplete: 'ali'}}, {banned: true}, {last_active: {$gt: '2026-08-01T00:00:00Z'}}.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  aliases: ["users_query"],
  inputSchema: {
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 10),
    offset,
    presence: z.boolean().optional().describe("Include online/presence state"),
    include_deactivated_users: z.boolean().optional().describe("Include deactivated users"),
  },
  compact: bounded,
  handler: async (args, client) =>
    client.queryUsers({
      payload: defined({
        filter_conditions: args.filter_conditions ?? {},
        sort: args.sort,
        limit: args.limit ?? 10,
        offset: args.offset,
        presence: args.presence,
        include_deactivated_users: args.include_deactivated_users,
      }),
    }),
});

export const userTools: AnyToolDef[] = [upsertUsers, queryUsers];
