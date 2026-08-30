import type {
  ChannelResponse,
  ChannelStateResponse,
  QueryChannelsResponse,
} from "@stream-io/node-sdk";
import { z } from "zod";
import {
  channelMember,
  channelRef,
  customData,
  defined,
  filterConditions,
  limit,
  offset,
  sortParams,
} from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { bounded, pick, userRef } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

/**
 * What a channel *listing* is for: identity, the fields `filter_conditions`
 * and `sort` accept, and the counts. Everything else on a ChannelResponse is
 * either boilerplate repeated on every row — `own_capabilities` is 33
 * identical strings under a server-side key, `config` belongs to the channel
 * type — or has a tool of its own.
 */
const CHANNEL_LIST_KEYS = [
  "cid",
  "type",
  "id",
  "created_at",
  "updated_at",
  "last_message_at",
  "deleted_at",
  "truncated_at",
  "member_count",
  "message_count",
  "frozen",
  "disabled",
  "hidden",
  "team",
  "custom",
] as const satisfies readonly (keyof ChannelResponse)[];

const createChannel = defineTool({
  name: "chat_create_channel",
  title: "Create or get chat channel",
  toolset: "chat",
  description:
    "Create a chat channel, or return it if it already exists. Provide `id` for a named channel. Omit `id` to create a distinct channel keyed by its member list (requires at least 2 members). Built-in types: messaging, team, livestream, commerce, gaming.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: z.string().min(1).describe("Channel type (e.g. 'messaging', 'team')"),
    id: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("Channel ID. Omit to create a distinct channel keyed by members."),
    created_by_id: z.string().min(1).describe("User ID of the channel creator"),
    name: z
      .string()
      .optional()
      .describe("Channel display name. Stored as custom data (`custom.name`)."),
    members: z
      .array(z.union([z.string(), channelMember]))
      .max(100)
      .optional()
      .describe("Members to add. Accepts user IDs or {user_id, role} objects. Max 100."),
    custom: customData,
    team: z.string().optional().describe("Team the channel belongs to (multi-tenant apps)"),
  },
  handler: async (args, client) => {
    const members = args.members?.map((entry) =>
      typeof entry === "string"
        ? { user_id: entry }
        : defined({ user_id: entry.user_id, channel_role: entry.role })
    );

    // Stream's ChannelInput has no `name` field — display names live in `custom`.
    const custom = defined({
      ...(args.custom ?? {}),
      ...(args.name !== undefined && { name: args.name }),
    });

    const data = defined({
      created_by_id: args.created_by_id,
      team: args.team,
      ...(members !== undefined && { members }),
      ...(Object.keys(custom).length > 0 && { custom }),
    });

    if (args.id) {
      return client.chat.getOrCreateChannel({ type: args.type, id: args.id, data });
    }

    if (!members || members.length < 2) {
      throw new ToolInputError(
        "A distinct channel (no `id`) is keyed by its member list and needs at least 2 members. Either pass `id`, or pass 2+ `members`."
      );
    }

    return client.chat.getOrCreateDistinctChannel({ type: args.type, data });
  },
});

const queryChannels = defineTool({
  name: "chat_query_channels",
  title: "Query channels",
  toolset: "chat",
  description:
    "Search and filter chat channels. Common filters: {type: {$eq: 'messaging'}}, {members: {$in: ['user-id']}}, {last_message_at: {$gt: '2026-01-01T00:00:00Z'}}. Returns channel metadata only by default — raise `message_limit` to include messages, or use chat_get_channel for one channel's history.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(30, 10),
    offset,
    message_limit: limit(300, 0),
    member_limit: limit(100, 10),
    user_id: z
      .string()
      .optional()
      .describe("Query as this user — applies their permissions and populates read/unread state"),
  },
  // Stream caps this at 30 rows, so the whole page has to fit the byte budget.
  // Spending it on boilerplate is what dropped rows: `own_capabilities` is 33
  // identical strings on every row, and an expanded `created_by` is a whole
  // user object per channel.
  compact: (raw: QueryChannelsResponse) => ({
    channels: (raw.channels ?? []).map((entry) => ({
      ...pick(entry.channel, CHANNEL_LIST_KEYS),
      created_by: userRef(entry.channel?.created_by),
      // `member_count` is absent on some channel types; the returned page is
      // then the only other source.
      member_count: entry.channel?.member_count ?? entry.members?.length,
      // Ids only. Roles are what chat_query_members is for, and a
      // {user_id, channel_role} object per member costs ~90 bytes a row.
      member_ids: entry.members?.slice(0, 5).map((member) => member.user_id),
      // Only meaningful when the caller raised `message_limit` above its
      // default of 0. It used to be reported as `message_count`, which is a
      // different quantity: with the default limit it was always 0 even on a
      // channel with messages, contradicting `last_message_at` in the same row.
      messages_returned: entry.messages?.length || undefined,
      messages: entry.messages?.length
        ? entry.messages.slice(-3).map((message) => ({
            id: message.id,
            text: message.text,
            created_at: message.created_at,
            user: userRef(message.user),
          }))
        : undefined,
    })),
    _hint:
      "Channel metadata only: `message_count` is the channel's own total (absent when Stream does not track it for that channel type), `messages_returned` counts the rows in this page. Up to 5 member ids each, and the 3 newest messages when `message_limit` is set. Use chat_query_members for member roles, chat_get_channel for one channel's history and read state, or verbose:true for the raw page.",
  }),
  handler: async (args, client) =>
    client.chat.queryChannels(
      defined({
        filter_conditions: args.filter_conditions ?? {},
        sort: args.sort,
        limit: args.limit ?? 10,
        offset: args.offset,
        // Messages are excluded by default: a 30-channel page with the API
        // default of 25 messages each is tens of thousands of tokens.
        message_limit: args.message_limit ?? 0,
        member_limit: args.member_limit ?? 10,
        user_id: args.user_id,
      })
    ),
});

const updateChannel = defineTool({
  name: "chat_update_channel",
  title: "Update channel members and roles",
  toolset: "chat",
  description:
    "Add or remove channel members, promote or demote moderators, assign channel roles, and send invites. For changing channel data such as the name, use chat_update_channel_data.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    add_members: z
      .array(z.union([z.string(), channelMember]))
      .max(100)
      .optional()
      .describe("Members to add — user IDs or {user_id, role} objects"),
    remove_members: z.array(z.string().min(1)).max(100).optional().describe("User IDs to remove"),
    add_moderators: z
      .array(z.string().min(1))
      .optional()
      .describe("User IDs to promote to moderator"),
    demote_moderators: z
      .array(z.string().min(1))
      .optional()
      .describe("User IDs to demote from moderator"),
    assign_roles: z
      .array(channelMember)
      .optional()
      .describe("Set a channel role on existing members: [{user_id, role}]"),
    invites: z
      .array(z.union([z.string(), channelMember]))
      .optional()
      .describe("User IDs to invite (they must accept before joining)"),
    user_id: z
      .string()
      .optional()
      .describe("Acting user — attributed as the author of the resulting system message"),
    hide_history: z.boolean().optional().describe("Hide existing history from newly added members"),
    cooldown: z
      .int()
      .min(0)
      .max(120)
      .optional()
      .describe("Slow mode: seconds a user must wait between messages (0 disables)"),
  },
  handler: async (args, client) => {
    const toMembers = (entries?: (string | { user_id: string; role?: string })[]) =>
      entries?.map((entry) =>
        typeof entry === "string"
          ? { user_id: entry }
          : defined({ user_id: entry.user_id, channel_role: entry.role })
      );

    const mutations = defined({
      add_members: toMembers(args.add_members),
      remove_members: args.remove_members,
      add_moderators: args.add_moderators,
      demote_moderators: args.demote_moderators,
      assign_roles: toMembers(args.assign_roles),
      invites: toMembers(args.invites),
      hide_history: args.hide_history,
      cooldown: args.cooldown,
    });

    // `user_id` is attribution only, so it must not satisfy this guard.
    if (Object.keys(mutations).length === 0) {
      throw new ToolInputError(
        "Nothing to do — pass at least one of add_members, remove_members, add_moderators, demote_moderators, assign_roles, invites, hide_history or cooldown. " +
          "To change channel data such as the name or image, use chat_update_channel_data instead."
      );
    }

    const payload = { ...mutations, ...defined({ user_id: args.user_id }) };

    return client.chat.updateChannel({
      type: args.channel_type,
      id: args.channel_id,
      ...payload,
    });
  },
});

const addMembers = defineTool({
  name: "chat_add_members",
  title: "Add channel members",
  toolset: "chat",
  description:
    "Add members to a channel. The users must already exist (see chat_upsert_users). Convenience wrapper over chat_update_channel.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    member_ids: z.array(z.string().min(1)).min(1).max(100).describe("User IDs to add as members"),
    hide_history: z.boolean().optional().describe("Hide existing history from the new members"),
  },
  handler: async (args, client) =>
    client.chat.updateChannel({
      type: args.channel_type,
      id: args.channel_id,
      add_members: args.member_ids.map((user_id) => ({ user_id })),
      ...defined({ hide_history: args.hide_history }),
    }),
});

const removeMembers = defineTool({
  name: "chat_remove_members",
  title: "Remove channel members",
  toolset: "chat",
  description: "Remove members from a channel. Convenience wrapper over chat_update_channel.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    member_ids: z.array(z.string().min(1)).min(1).max(100).describe("User IDs to remove"),
  },
  handler: async (args, client) =>
    client.chat.updateChannel({
      type: args.channel_type,
      id: args.channel_id,
      remove_members: args.member_ids,
    }),
});

const updateChannelData = defineTool({
  name: "chat_update_channel_data",
  title: "Update channel data",
  toolset: "chat",
  description:
    "Partially update a channel's data. `set` adds or overwrites fields (e.g. {name: 'New Name', image: 'https://…'}), `unset` removes them. Only the listed fields change.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    set: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Fields to set, e.g. {name: 'Support', frozen: true}"),
    unset: z.array(z.string().min(1)).optional().describe("Field names to remove"),
    user_id: z.string().optional().describe("Acting user ID"),
  },
  handler: async (args, client) => {
    if (args.set === undefined && args.unset === undefined) {
      throw new ToolInputError("Pass at least one of `set` or `unset`.");
    }
    return client.chat.updateChannelPartial({
      type: args.channel_type,
      id: args.channel_id,
      ...defined({ set: args.set, unset: args.unset, user_id: args.user_id }),
    });
  },
});

const getChannel = defineTool({
  name: "chat_get_channel",
  title: "Get channel state and messages",
  toolset: "chat",
  description:
    "Fetch a channel's state: its data, members, and most recent messages. This is the primary way to READ chat history. Page backwards through history with `before_message_id` (pass the oldest message id you already have). Strictly a read: an unknown channel id returns a 404 rather than creating the channel — use chat_create_channel for that.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    message_limit: limit(300, 25),
    before_message_id: z
      .string()
      .optional()
      .describe("Return messages older than this message ID (pagination)"),
    around_message_id: z.string().optional().describe("Return messages centred on this message ID"),
    member_limit: limit(100, 30),
  },
  compact: bounded,
  /*
   * Two endpoints, each with one flaw, so this tool uses both.
   *
   * GET /channels/{type}/{id} is a true read: it 404s on an id that does not
   * exist. It takes its options as one JSON `payload` query param — the SDK's
   * typed `chat.getChannel()` sends them as discrete query params instead and
   * Stream answers 400 "Missing request payload", the same SDK bug as
   * `chat.getPinnedMessages`, which is why the endpoint is called directly
   * here. But it honours only `messages_limit`: `messages_id_lt` and
   * `messages_id_around` are accepted and ignored (verified against the API).
   *
   * The create-or-query endpoint behind `getOrCreateChannel()` does honour
   * message pagination — and CREATES the channel when the id does not exist,
   * which a tool annotated `readOnlyHint: true` must never do. This one was
   * being used to audit for exactly the phantom channels such a call mints.
   *
   * So: read through GET, which also proves the channel exists, and only when
   * the caller asked to page re-fetch through the create-or-query endpoint,
   * where creation is no longer possible. Do not collapse this into one call.
   */
  handler: async (args, client) => {
    const messages = defined({
      limit: args.message_limit ?? 25,
      id_lt: args.before_message_id,
      id_around: args.around_message_id,
    });
    const response = await client.apiClient.sendRequest<ChannelStateResponse>(
      "GET",
      "/api/v2/chat/channels/{type}/{id}",
      { type: args.channel_type, id: args.channel_id },
      {
        payload: JSON.stringify({
          state: true,
          messages_limit: messages.limit,
          members_limit: args.member_limit ?? 30,
        }),
      }
    );
    if (args.before_message_id === undefined && args.around_message_id === undefined) {
      return { ...response.body, metadata: response.metadata };
    }
    return client.chat.getOrCreateChannel({
      type: args.channel_type,
      id: args.channel_id,
      state: true,
      messages,
      members: { limit: args.member_limit ?? 30 },
    });
  },
});

const deleteChannel = defineTool({
  name: "chat_delete_channel",
  title: "Delete channel",
  toolset: "chat",
  description:
    "Delete a channel. Soft delete by default (recoverable, id stays taken). `hard_delete: true` permanently removes the channel and all its messages and frees the id.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    hard_delete: z
      .boolean()
      .optional()
      .describe("Permanently delete the channel and all messages. Irreversible. Default: false."),
  },
  handler: async (args, client) =>
    client.chat.deleteChannel({
      type: args.channel_type,
      id: args.channel_id,
      hard_delete: args.hard_delete ?? false,
    }),
});

const truncateChannel = defineTool({
  name: "chat_truncate_channel",
  title: "Truncate channel",
  toolset: "chat",
  description:
    "Remove all messages from a channel while keeping the channel and its members. Optionally post a system message explaining the truncation.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().optional().describe("Acting user ID"),
    hard_delete: z
      .boolean()
      .optional()
      .describe("Permanently remove messages rather than soft-deleting"),
    truncated_at: z.iso
      .datetime({ offset: true })
      .optional()
      .describe("ISO-8601 timestamp — only truncate messages older than this"),
    system_message: z.string().optional().describe("System message to post after truncating"),
  },
  handler: async (args, client) =>
    client.chat.truncateChannel({
      type: args.channel_type,
      id: args.channel_id,
      ...defined({
        user_id: args.user_id,
        hard_delete: args.hard_delete,
        truncated_at: args.truncated_at === undefined ? undefined : new Date(args.truncated_at),
        message:
          args.system_message !== undefined
            ? defined({ text: args.system_message, type: "system" as const, user_id: args.user_id })
            : undefined,
      }),
    }),
});

const queryMembers = defineTool({
  name: "chat_query_members",
  title: "Query channel members",
  toolset: "chat",
  description:
    "Search and filter the members of a channel. Common filters: {name: {$autocomplete: 'ali'}}, {channel_role: {$eq: 'channel_moderator'}}, {banned: true}.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    offset,
    user_id: z.string().optional().describe("Query as this user"),
  },
  compact: bounded,
  handler: async (args, client) =>
    client.chat.queryMembers({
      payload: defined({
        type: args.channel_type,
        id: args.channel_id,
        filter_conditions: args.filter_conditions ?? {},
        sort: args.sort,
        limit: args.limit ?? 25,
        offset: args.offset,
        user_id: args.user_id,
      }),
    }),
});

const updateMember = defineTool({
  name: "chat_update_member",
  title: "Update channel member",
  toolset: "chat",
  description:
    "Partially update one member's custom data on a channel. `set` adds or overwrites fields, `unset` removes them.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().min(1).describe("The member to update"),
    set: z.record(z.string(), z.unknown()).optional().describe("Member fields to set"),
    unset: z.array(z.string().min(1)).optional().describe("Member field names to remove"),
  },
  handler: async (args, client) => {
    if (args.set === undefined && args.unset === undefined) {
      throw new ToolInputError("Pass at least one of `set` or `unset`.");
    }
    return client.chat.updateMemberPartial({
      type: args.channel_type,
      id: args.channel_id,
      user_id: args.user_id,
      ...defined({ set: args.set, unset: args.unset }),
    });
  },
});

const muteChannel = defineTool({
  name: "chat_mute_channel",
  title: "Mute channels for a user",
  toolset: "chat",
  description: "Mute one or more channels for a user, suppressing their push notifications.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User to mute the channels for"),
    channel_cids: z
      .array(z.string().min(1))
      .min(1)
      .describe("Channel CIDs, e.g. ['messaging:general']"),
    expiration: z
      .int()
      .min(1)
      .optional()
      .describe("Mute duration in milliseconds. Omit for indefinite."),
  },
  handler: async (args, client) =>
    client.chat.muteChannel(
      defined({
        user_id: args.user_id,
        channel_cids: args.channel_cids,
        expiration: args.expiration,
      })
    ),
});

const unmuteChannel = defineTool({
  name: "chat_unmute_channel",
  title: "Unmute channels for a user",
  toolset: "chat",
  description: "Remove a user's mute on one or more channels.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User whose mute should be removed"),
    channel_cids: z.array(z.string().min(1)).min(1).describe("Channel CIDs to unmute"),
  },
  handler: async (args, client) =>
    client.chat.unmuteChannel({ user_id: args.user_id, channel_cids: args.channel_cids }),
});

const hideChannel = defineTool({
  name: "chat_hide_channel",
  title: "Hide channel for a user",
  toolset: "chat",
  description:
    "Hide a channel from one user's channel list. It reappears when a new message arrives unless the channel type is configured otherwise.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().min(1).describe("User to hide the channel for"),
    clear_history: z
      .boolean()
      .optional()
      .describe("Also clear this user's message history for the channel"),
  },
  handler: async (args, client) =>
    client.chat.hideChannel({
      type: args.channel_type,
      id: args.channel_id,
      user_id: args.user_id,
      ...defined({ clear_history: args.clear_history }),
    }),
});

const showChannel = defineTool({
  name: "chat_show_channel",
  title: "Show hidden channel",
  toolset: "chat",
  description: "Un-hide a previously hidden channel for a user.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().min(1).describe("User to show the channel for"),
  },
  handler: async (args, client) =>
    client.chat.showChannel({
      type: args.channel_type,
      id: args.channel_id,
      user_id: args.user_id,
    }),
});

const sendEvent = defineTool({
  name: "chat_send_event",
  title: "Send custom channel event",
  toolset: "chat",
  description:
    "Broadcast a custom real-time event to everyone watching a channel. Not persisted as a message — use for typing indicators, presence signals, or app-specific pings.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    event_type: z
      .string()
      .min(1)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Custom event types may only contain letters, numbers, underscores and dashes — Stream reserves the dot character."
      )
      .describe("Custom event type, e.g. 'order_shipped'. Letters, numbers, _ and - only."),
    // Stream rejects a server-side event without an acting user:
    // "either event.user or event.user_id must be provided".
    user_id: z.string().min(1).describe("User the event is attributed to"),
    custom: customData,
  },
  handler: async (args, client) =>
    client.chat.sendEvent({
      type: args.channel_type,
      id: args.channel_id,
      event: defined({ type: args.event_type, user_id: args.user_id, custom: args.custom }),
    }),
});

export const channelTools: AnyToolDef[] = [
  createChannel,
  queryChannels,
  updateChannel,
  addMembers,
  removeMembers,
  updateChannelData,
  getChannel,
  deleteChannel,
  truncateChannel,
  queryMembers,
  updateMember,
  muteChannel,
  unmuteChannel,
  hideChannel,
  showChannel,
  sendEvent,
];
