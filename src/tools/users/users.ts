import type { FullUserResponse, QueryUsersResponse, StreamClient } from "@stream-io/node-sdk";
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
import { pick } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

/** Identity plus the fields `filter_conditions` and `sort` accept. */
const USER_LIST_KEYS = [
  "id",
  "name",
  "role",
  "created_at",
  "updated_at",
  "last_active",
  "deactivated_at",
  "deleted_at",
  "ban_expires",
  "language",
  "teams",
  "custom",
] as const satisfies readonly (keyof FullUserResponse)[];

/**
 * Four booleans cost four lines on every row and are false for nearly every
 * user. As one array they cost one, and `flags: []` still says "none set".
 */
const USER_FLAG_KEYS = [
  "banned",
  "shadow_banned",
  "invisible",
  "online",
] as const satisfies readonly (keyof FullUserResponse)[];

/** What a `deactivated_only` scan covered, so a caller can trust the count. */
interface DeactivatedScan {
  /** Users examined, not users returned. */
  scanned: number;
  pages: number;
  /** False when the page budget ran out before the end of the app's users. */
  complete: boolean;
  /** Pass back as `after_id` to continue an incomplete scan. */
  next_id?: string;
}

const SCAN_PAGE_SIZE = 100;
const SCAN_MAX_PAGES = 25;

/**
 * Finds deactivated users by scanning, because Stream cannot select them.
 * Every operator on `deactivated_at` is rejected ("operator $exists on custom
 * field \"deactivated_at\" is not supported for query users") and
 * `include_deactivated_users` only mixes them in with everyone else.
 *
 * Paging is keyset — ascending id, `{id: {$gt: cursor}}` — because Stream caps
 * `offset` at 1000, which an app of any size exceeds.
 */
async function scanDeactivated(
  client: StreamClient,
  args: {
    filter_conditions?: Record<string, unknown>;
    limit: number;
    after_id?: string;
    presence?: boolean;
  }
): Promise<QueryUsersResponse & { users: FullUserResponse[]; scan: DeactivatedScan }> {
  const matched: FullUserResponse[] = [];
  let cursor = args.after_id ?? "";
  let scanned = 0;
  let pages = 0;
  let complete = false;
  let last: QueryUsersResponse | undefined;

  while (pages < SCAN_MAX_PAGES && matched.length < args.limit) {
    const page = await client.queryUsers({
      payload: defined({
        filter_conditions: { ...(args.filter_conditions ?? {}), id: { $gt: cursor } },
        sort: [{ field: "id", direction: 1 }],
        limit: SCAN_PAGE_SIZE,
        presence: args.presence,
        include_deactivated_users: true,
      }),
    });
    last = page;
    pages += 1;
    scanned += page.users.length;
    for (const user of page.users) {
      if (user.deactivated_at !== undefined) matched.push(user);
    }
    if (page.users.length < SCAN_PAGE_SIZE) {
      complete = true;
      break;
    }
    cursor = page.users[page.users.length - 1].id;
  }

  return {
    ...(last ?? { duration: "0ms" }),
    users: matched.slice(0, args.limit),
    scan: defined({ scanned, pages, complete, next_id: complete ? undefined : cursor }),
  };
}

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
    "Search and filter users. Common filters: {id: {$in: ['alice','bob']}}, {role: {$eq: 'admin'}}, {name: {$autocomplete: 'ali'}}, {banned: true}, {last_active: {$gt: '2026-08-01T00:00:00Z'}}. Stream rejects any operator on `deactivated_at`, so pass `deactivated_only: true` to enumerate deactivated users.",
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
    include_deactivated_users: z
      .boolean()
      .optional()
      .describe(
        "Include deactivated users alongside active ones. It cannot isolate them — use `deactivated_only` for that."
      ),
    deactivated_only: z
      .boolean()
      .optional()
      .describe(
        "Return only deactivated users. Stream cannot filter on `deactivated_at`, so this SCANS: it pages the app by ascending user id (up to 25 pages of 100) and keeps the deactivated rows. The `scan` block in the response reports how many users were examined and, if the budget ran out, the `next_id` to resume from via `after_id`. Cannot be combined with `offset` or `sort`."
      ),
    after_id: z
      .string()
      .optional()
      .describe("Resume a `deactivated_only` scan from this user id (the previous `scan.next_id`)"),
  },
  // A raw user row is ~480 bytes of devices, mutes and unread counters, so a
  // page of 100 blew the byte budget and lost three quarters of its rows.
  compact: (raw: QueryUsersResponse | Awaited<ReturnType<typeof scanDeactivated>>) => ({
    users: raw.users.map((user) => ({
      ...pick(user, USER_LIST_KEYS),
      flags: USER_FLAG_KEYS.filter((key) => user[key] === true),
    })),
    ...("scan" in raw ? { scan: raw.scan } : {}),
    _hint:
      "Identity and filterable fields only; `flags` lists which of banned, shadow_banned, invisible and online are set. Devices, mutes, unread counts and privacy settings are omitted — pass verbose:true for the raw page.",
  }),
  handler: async (args, client) => {
    if (args.deactivated_only) {
      if (args.offset !== undefined || args.sort !== undefined) {
        throw new ToolInputError(
          "`deactivated_only` pages by ascending user id, so `offset` and `sort` do not apply. Resume a partial scan with `after_id`."
        );
      }
      return scanDeactivated(client, {
        filter_conditions: args.filter_conditions,
        limit: args.limit ?? 10,
        after_id: args.after_id,
        presence: args.presence,
      });
    }
    return client.queryUsers({
      payload: defined({
        filter_conditions: args.filter_conditions ?? {},
        sort: args.sort,
        limit: args.limit ?? 10,
        offset: args.offset,
        presence: args.presence,
        include_deactivated_users: args.include_deactivated_users,
      }),
    });
  },
});

const updateUsersPartial = defineTool({
  name: "users_update_partial",
  title: "Partially update users",
  toolset: "users",
  description:
    "Change specific fields on users without clearing the rest. `set` overwrites fields, `unset` removes them.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    users: z
      .array(
        z.object({
          id: z.string().min(1).describe("User ID"),
          set: z.record(z.string(), z.unknown()).optional().describe("Fields to set"),
          unset: z.array(z.string().min(1)).optional().describe("Field names to remove"),
        })
      )
      .min(1)
      .max(100)
      .describe("Partial updates, one per user"),
  },
  handler: async (args, client) =>
    client.updateUsersPartial({
      users: args.users.map((user) => defined(user)),
    }),
});

const deactivateUser = defineTool({
  name: "users_deactivate",
  title: "Deactivate user",
  toolset: "users",
  description:
    "Deactivate a user. They can no longer connect, but their data is retained and they can be reactivated.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User ID to deactivate"),
    mark_messages_deleted: z.boolean().optional().describe("Also mark their messages deleted"),
    created_by_id: z.string().optional().describe("Acting user ID"),
  },
  handler: async (args, client) =>
    client.deactivateUser({
      user_id: args.user_id,
      ...defined({
        mark_messages_deleted: args.mark_messages_deleted,
        created_by_id: args.created_by_id,
      }),
    }),
});

const reactivateUser = defineTool({
  name: "users_reactivate",
  title: "Reactivate user",
  toolset: "users",
  description: "Reactivate a previously deactivated user, optionally restoring their messages.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User ID to reactivate"),
    restore_messages: z.boolean().optional().describe("Restore messages deleted at deactivation"),
    name: z.string().optional().describe("Set a new display name on reactivation"),
    created_by_id: z.string().optional().describe("Acting user ID"),
  },
  handler: async (args, client) =>
    client.reactivateUser({
      user_id: args.user_id,
      ...defined({
        restore_messages: args.restore_messages,
        name: args.name,
        created_by_id: args.created_by_id,
      }),
    }),
});

const deleteUsers = defineTool({
  name: "users_delete",
  title: "Delete users",
  toolset: "users",
  description:
    "Delete users asynchronously. Returns a task id — poll it with app_get_task. Choose 'soft' (recoverable), 'pruning' (removes content, keeps the id) or 'hard' (irreversible) per data category.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    user_ids: z.array(z.string().min(1)).min(1).max(100).describe("User IDs to delete"),
    user: z
      .enum(["soft", "pruning", "hard"])
      .optional()
      .describe("How to delete the user record. Default: soft."),
    messages: z
      .enum(["soft", "pruning", "hard"])
      .optional()
      .describe("How to delete their messages"),
    conversations: z.enum(["soft", "hard"]).optional().describe("How to delete their channels"),
    calls: z.enum(["soft", "hard"]).optional().describe("How to delete their calls"),
    new_channel_owner_id: z
      .string()
      .optional()
      .describe("Reassign their channels to this user instead of deleting"),
  },
  handler: async (args, client) =>
    client.deleteUsers(
      defined({
        user_ids: args.user_ids,
        user: args.user ?? "soft",
        messages: args.messages,
        conversations: args.conversations,
        calls: args.calls,
        new_channel_owner_id: args.new_channel_owner_id,
      })
    ),
});

const restoreUsers = defineTool({
  name: "users_restore",
  title: "Restore deleted users",
  toolset: "users",
  description: "Restore soft-deleted users. Hard-deleted or pruned users cannot be restored.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_ids: z.array(z.string().min(1)).min(1).max(100).describe("User IDs to restore"),
  },
  handler: async (args, client) => client.restoreUsers({ user_ids: args.user_ids }),
});

const createGuest = defineTool({
  name: "users_create_guest",
  title: "Create guest user",
  toolset: "users",
  description:
    "Create a guest user and return a token for them. Guests get the 'guest' role and limited permissions. Guest creation must be enabled on the app.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("Guest user ID"),
    name: z.string().optional().describe("Display name"),
    image: z.string().optional().describe("Avatar URL"),
    custom: customData,
  },
  handler: async (args, client) =>
    client.createGuest({
      user: defined({
        id: args.id,
        name: args.name,
        image: args.image,
        custom: args.custom,
      }),
    }),
});

const blockUser = defineTool({
  name: "users_block",
  title: "Block user (user-to-user)",
  toolset: "users",
  description:
    "One user blocks another, hiding the blocked user's messages from them. This is a personal block, not a moderation ban — use moderation_ban_user for that.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User doing the blocking"),
    blocked_user_id: z.string().min(1).describe("User being blocked"),
  },
  handler: async (args, client) =>
    client.blockUsers({ user_id: args.user_id, blocked_user_id: args.blocked_user_id }),
});

const unblockUser = defineTool({
  name: "users_unblock",
  title: "Unblock user (user-to-user)",
  toolset: "users",
  description:
    "Remove a user-to-user block, so the blocked user's messages become visible to the blocker again.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User who did the blocking"),
    blocked_user_id: z.string().min(1).describe("User being unblocked"),
  },
  handler: async (args, client) =>
    client.unblockUsers({ user_id: args.user_id, blocked_user_id: args.blocked_user_id }),
});

const getBlockedUsers = defineTool({
  name: "users_get_blocked",
  title: "List blocked users",
  toolset: "users",
  description: "List the users a given user has blocked.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { user_id: z.string().min(1).describe("User whose block list to read") },
  handler: async (args, client) => client.getBlockedUsers({ user_id: args.user_id }),
});

const exportUser = defineTool({
  name: "users_export",
  title: "Export user data",
  toolset: "users",
  description: "Export one user's data — their profile, channels and messages.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { user_id: z.string().min(1).describe("User ID to export") },
  handler: async (args, client) => client.exportUser({ user_id: args.user_id }),
});

export const userTools: AnyToolDef[] = [
  upsertUsers,
  queryUsers,
  updateUsersPartial,
  deactivateUser,
  reactivateUser,
  deleteUsers,
  restoreUsers,
  createGuest,
  blockUser,
  unblockUser,
  getBlockedUsers,
  exportUser,
];
