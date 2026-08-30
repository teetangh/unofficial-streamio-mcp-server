import type { Attachment } from "@stream-io/node-sdk";
import { z } from "zod";
import { translationLanguage } from "../../schemas/languages.js";
import {
  channelRef,
  customData,
  defined,
  filterConditions,
  limit,
  offset,
  sortParams,
} from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type ToolDef } from "../define.js";

const attachment = z.object({
  type: z.string().optional().describe("Attachment type, e.g. 'image', 'file', 'video'"),
  asset_url: z.string().optional().describe("URL of the asset"),
  image_url: z.string().optional().describe("URL of the image"),
  thumb_url: z.string().optional().describe("URL of a thumbnail image"),
  title: z.string().optional().describe("Attachment title"),
  title_link: z.string().optional().describe("URL the title links to"),
  text: z.string().optional().describe("Attachment description"),
  og_scrape_url: z.string().optional().describe("URL to scrape Open Graph metadata from"),
  custom: customData,
});

/** Stream's Attachment model requires `custom`, and puts extra fields there. */
function toAttachments(values: z.infer<typeof attachment>[] | undefined): Attachment[] | undefined {
  return values?.map(({ custom, ...rest }) => ({
    ...defined(rest),
    custom: custom ?? {},
  })) as Attachment[];
}

const sendMessage = defineTool({
  name: "chat_send_message",
  title: "Send message",
  toolset: "chat",
  description:
    "Send a message to a channel on behalf of a user. Set `parent_id` to reply in a thread. Supports attachments, mentions and markdown text.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    text: z.string().describe("Message text. Supports markdown and URL enrichment."),
    user_id: z.string().min(1).describe("User ID the message is sent as"),
    parent_id: z.string().optional().describe("Parent message ID — makes this a thread reply"),
    show_in_channel: z
      .boolean()
      .optional()
      .describe("For thread replies, also show the reply in the main channel"),
    quoted_message_id: z.string().optional().describe("Message ID this message quotes"),
    mentioned_users: z
      .array(z.string().min(1))
      .max(25)
      .optional()
      .describe("User IDs mentioned in the text (max 25)"),
    attachments: z.array(attachment).max(30).optional().describe("Attachments (max 30)"),
    silent: z.boolean().optional().describe("Send without bumping unread counts or notifications"),
    skip_push: z.boolean().optional().describe("Do not send a push notification"),
    pinned: z.boolean().optional().describe("Pin the message to the channel"),
    custom: customData,
  },
  handler: async (args, client) =>
    client.chat.sendMessage({
      type: args.channel_type,
      id: args.channel_id,
      message: defined({
        text: args.text,
        user_id: args.user_id,
        parent_id: args.parent_id,
        show_in_channel: args.show_in_channel,
        quoted_message_id: args.quoted_message_id,
        mentioned_users: args.mentioned_users,
        attachments: toAttachments(args.attachments),
        silent: args.silent,
        pinned: args.pinned,
        custom: args.custom,
      }),
      ...defined({ skip_push: args.skip_push }),
    }),
});

const getMessage = defineTool({
  name: "chat_get_message",
  title: "Get message",
  toolset: "chat",
  description:
    "Fetch a single message by ID, including its attachments, reactions and thread metadata.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID"),
    show_deleted_message: z
      .boolean()
      .optional()
      .describe("Include the message even if soft-deleted"),
  },
  handler: async (args, client) =>
    client.chat.getMessage(
      defined({ id: args.message_id, show_deleted_message: args.show_deleted_message })
    ),
});

const getManyMessages = defineTool({
  name: "chat_get_many_messages",
  title: "Get several messages",
  toolset: "chat",
  description: "Fetch several messages from one channel by ID in a single call.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    message_ids: z.array(z.string().min(1)).min(1).max(100).describe("Message IDs to fetch"),
  },
  compact: bounded,
  handler: async (args, client) =>
    client.chat.getManyMessages({
      type: args.channel_type,
      id: args.channel_id,
      ids: args.message_ids,
    }),
});

const searchMessages = defineTool({
  name: "chat_search_messages",
  title: "Search messages",
  toolset: "chat",
  description:
    "Full-text search across messages. `filter_conditions` scopes which channels to search (required — e.g. {members: {$in: ['user-id']}} or {type: 'messaging'}). Provide `query` for full-text search, or `message_filter_conditions` for structured matching such as {text: {$autocomplete: 'refund'}}.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    filter_conditions: z
      .record(z.string(), z.unknown())
      .describe("Channel filter that scopes the search, e.g. {members: {$in: ['alice']}}"),
    query: z.string().optional().describe("Full-text search term"),
    message_filter_conditions: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Structured message filter, e.g. {text: {$autocomplete: 'refund'}}"),
    sort: sortParams,
    limit: limit(100, 20),
    offset,
    next: z.string().optional().describe("Cursor from a previous response's `next` field"),
  },
  compact: bounded,
  handler: async (args, client) => {
    if (args.query === undefined && args.message_filter_conditions === undefined) {
      throw new ToolInputError("Pass either `query` or `message_filter_conditions`.");
    }
    if (args.offset !== undefined && args.next !== undefined) {
      throw new ToolInputError("Use either `offset` or `next` for pagination, not both.");
    }
    return client.chat.search({
      payload: defined({
        filter_conditions: args.filter_conditions,
        query: args.query,
        message_filter_conditions: args.message_filter_conditions,
        sort: args.sort,
        limit: args.limit ?? 20,
        offset: args.offset,
        next: args.next,
      }),
    });
  },
});

const updateMessage = defineTool({
  name: "chat_update_message",
  title: "Update message",
  toolset: "chat",
  description:
    "Replace a message's contents. This is a full update — fields you omit are cleared. For targeted edits use chat_update_message_partial.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID to update"),
    text: z.string().describe("New message text"),
    user_id: z.string().min(1).describe("User the message belongs to"),
    attachments: z.array(attachment).max(30).optional().describe("Replacement attachments"),
    mentioned_users: z.array(z.string().min(1)).max(25).optional(),
    custom: customData,
  },
  handler: async (args, client) =>
    client.chat.updateMessage({
      id: args.message_id,
      message: defined({
        text: args.text,
        user_id: args.user_id,
        attachments: toAttachments(args.attachments),
        mentioned_users: args.mentioned_users,
        custom: args.custom,
      }),
    }),
});

const updateMessagePartial = defineTool({
  name: "chat_update_message_partial",
  title: "Partially update message",
  toolset: "chat",
  description:
    "Change specific fields on a message without touching the rest. `set` overwrites fields (e.g. {text: '…', pinned: true}), `unset` removes them.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID to update"),
    set: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Fields to set, e.g. {text: 'edited'}"),
    unset: z.array(z.string().min(1)).optional().describe("Field names to remove"),
    user_id: z.string().optional().describe("Acting user ID"),
  },
  handler: async (args, client) => {
    if (args.set === undefined && args.unset === undefined) {
      throw new ToolInputError("Pass at least one of `set` or `unset`.");
    }
    return client.chat.updateMessagePartial({
      id: args.message_id,
      ...defined({ set: args.set, unset: args.unset, user_id: args.user_id }),
    });
  },
});

const deleteMessage = defineTool({
  name: "chat_delete_message",
  title: "Delete message",
  toolset: "chat",
  description:
    "Delete a message. Soft delete by default — the message is marked deleted but retained. `hard: true` removes it permanently and cannot be undone.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID to delete"),
    hard: z.boolean().optional().describe("Permanently remove. Irreversible. Default: false."),
    deleted_by: z.string().optional().describe("User ID credited with the deletion"),
  },
  handler: async (args, client) =>
    client.chat.deleteMessage(
      defined({ id: args.message_id, hard: args.hard, deleted_by: args.deleted_by })
    ),
});

const undeleteMessage = defineTool({
  name: "chat_undelete_message",
  title: "Undelete message",
  toolset: "chat",
  description: "Restore a soft-deleted message. Hard-deleted messages cannot be restored.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID to restore"),
    undeleted_by: z.string().min(1).describe("User ID performing the restore"),
  },
  handler: async (args, client) =>
    client.chat.undeleteMessage({ id: args.message_id, undeleted_by: args.undeleted_by }),
});

const getReplies = defineTool({
  name: "chat_get_replies",
  title: "Get thread replies",
  toolset: "chat",
  description:
    "Fetch the replies in a message thread. Page backwards with `before_message_id` (the oldest reply id you already have).",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    parent_message_id: z.string().min(1).describe("The thread's parent message ID"),
    limit: limit(300, 25),
    before_message_id: z.string().optional().describe("Return replies older than this message ID"),
    sort: sortParams,
  },
  compact: bounded,
  handler: async (args, client) =>
    client.chat.getReplies(
      defined({
        parent_id: args.parent_message_id,
        limit: args.limit ?? 25,
        id_lt: args.before_message_id,
        sort: args.sort,
      })
    ),
});

const getPinnedMessages = defineTool({
  name: "chat_get_pinned_messages",
  title: "Get pinned messages",
  toolset: "chat",
  description: "List the pinned messages in a channel, newest pin first.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    limit: limit(100, 25),
    user_id: z.string().optional().describe("Query as this user"),
  },
  compact: bounded,
  handler: async (args, client) =>
    client.chat.getPinnedMessages(
      defined({
        type: args.channel_type,
        id: args.channel_id,
        limit: args.limit ?? 25,
        user_id: args.user_id,
      })
    ),
});

const translateMessage = defineTool({
  name: "chat_translate_message",
  title: "Translate message",
  toolset: "chat",
  description:
    "Translate a message into another language. The translation is stored on the message under `i18n`.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID to translate"),
    language: translationLanguage,
  },
  handler: async (args, client) =>
    client.chat.translateMessage({
      id: args.message_id,
      language: args.language,
    }),
});

const sendReaction = defineTool({
  name: "chat_send_reaction",
  title: "Add reaction",
  toolset: "chat",
  description: "Add a reaction to a message on behalf of a user.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID to react to"),
    type: z.string().min(1).describe("Reaction type, e.g. 'like', 'love', 'haha'"),
    user_id: z.string().min(1).describe("User adding the reaction"),
    score: z.int().min(1).optional().describe("Reaction weight, for cumulative reactions"),
    enforce_unique: z
      .boolean()
      .optional()
      .describe("Replace this user's existing reaction on the message"),
    skip_push: z.boolean().optional().describe("Do not send a push notification"),
  },
  handler: async (args, client) =>
    client.chat.sendReaction({
      id: args.message_id,
      reaction: defined({ type: args.type, user_id: args.user_id, score: args.score }),
      ...defined({ enforce_unique: args.enforce_unique, skip_push: args.skip_push }),
    }),
});

const deleteReaction = defineTool({
  name: "chat_delete_reaction",
  title: "Remove reaction",
  toolset: "chat",
  description: "Remove a user's reaction from a message.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID"),
    type: z.string().min(1).describe("Reaction type to remove"),
    user_id: z.string().min(1).describe("User whose reaction is removed"),
  },
  handler: async (args, client) =>
    client.chat.deleteReaction({
      id: args.message_id,
      type: args.type,
      user_id: args.user_id,
    }),
});

const getReactions = defineTool({
  name: "chat_get_reactions",
  title: "Get message reactions",
  toolset: "chat",
  description: "List the reactions on a message.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID"),
    limit: limit(300, 50),
    offset,
  },
  compact: bounded,
  handler: async (args, client) =>
    client.chat.getReactions(
      defined({ id: args.message_id, limit: args.limit ?? 50, offset: args.offset })
    ),
});

const markRead = defineTool({
  name: "chat_mark_read",
  title: "Mark channel read",
  toolset: "chat",
  description:
    "Mark a channel as read for a user, up to a specific message if `message_id` is given.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().min(1).describe("User to mark the channel read for"),
    message_id: z.string().optional().describe("Mark read up to this message"),
    thread_id: z.string().optional().describe("Mark a specific thread read"),
  },
  handler: async (args, client) =>
    client.chat.markRead({
      type: args.channel_type,
      id: args.channel_id,
      user_id: args.user_id,
      ...defined({ message_id: args.message_id, thread_id: args.thread_id }),
    }),
});

const markUnread = defineTool({
  name: "chat_mark_unread",
  title: "Mark channel unread",
  toolset: "chat",
  description: "Mark a channel unread for a user from a given message onwards.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().min(1).describe("User to mark the channel unread for"),
    message_id: z.string().optional().describe("Mark unread from this message onwards"),
    thread_id: z.string().optional().describe("Mark a specific thread unread"),
  },
  handler: async (args, client) =>
    client.chat.markUnread({
      type: args.channel_type,
      id: args.channel_id,
      user_id: args.user_id,
      ...defined({ message_id: args.message_id, thread_id: args.thread_id }),
    }),
});

const unreadCounts = defineTool({
  name: "chat_unread_counts",
  title: "Get unread counts",
  toolset: "chat",
  description: "Get a user's unread message and channel counts across the app.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User to get unread counts for"),
  },
  handler: async (args, client) => client.chat.unreadCounts({ user_id: args.user_id }),
});

const queryThreads = defineTool({
  name: "chat_query_threads",
  title: "Query threads",
  toolset: "chat",
  description: "List message threads a user participates in, most recently active first.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z.string().min(1).describe("User whose threads to list"),
    filter: filterConditions,
    sort: sortParams,
    limit: limit(25, 10),
    reply_limit: limit(10, 2),
    next: z.string().optional().describe("Cursor from a previous response's `next` field"),
  },
  compact: bounded,
  handler: async (args, client) =>
    client.chat.queryThreads(
      defined({
        user_id: args.user_id,
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 10,
        reply_limit: args.reply_limit ?? 2,
        next: args.next,
      })
    ),
});

const getThread = defineTool({
  name: "chat_get_thread",
  title: "Get thread",
  toolset: "chat",
  description: "Fetch one thread by its parent message ID, with its replies and participants.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    parent_message_id: z.string().min(1).describe("The thread's parent message ID"),
    reply_limit: limit(25, 10),
    participant_limit: limit(100, 10),
  },
  handler: async (args, client) =>
    client.chat.getThread(
      defined({
        message_id: args.parent_message_id,
        reply_limit: args.reply_limit ?? 10,
        participant_limit: args.participant_limit ?? 10,
      })
    ),
});

export const messageTools: ToolDef<any>[] = [
  sendMessage,
  getMessage,
  getManyMessages,
  searchMessages,
  updateMessage,
  updateMessagePartial,
  deleteMessage,
  undeleteMessage,
  getReplies,
  getPinnedMessages,
  translateMessage,
  sendReaction,
  deleteReaction,
  getReactions,
  markRead,
  markUnread,
  unreadCounts,
  queryThreads,
  getThread,
];
