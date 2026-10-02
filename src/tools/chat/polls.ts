import { z } from "zod";
import {
  channelRef,
  customData,
  defined,
  filterConditions,
  limit,
  nextCursor,
  prevCursor,
  sortParams,
} from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const isoDateTime = z.iso.datetime({ offset: true }).optional();

const pollOptionInput = z.object({
  text: z.string().min(1).describe("Option text"),
  custom: customData,
});

const createPoll = defineTool({
  name: "chat_create_poll",
  title: "Create poll",
  toolset: "chat",
  description:
    "Create a poll that can be attached to a chat message, with voting options, visibility rules, and vote limits.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Poll question or title"),
    user_id: z.string().min(1).describe("User ID creating the poll"),
    description: z
      .string()
      .optional()
      .describe("Additional description or instructions for the poll"),
    options: z.array(pollOptionInput).optional().describe("Initial voting options for the poll"),
    enforce_unique_vote: z
      .boolean()
      .optional()
      .describe("Whether each user is restricted to a single vote"),
    max_votes_allowed: z
      .int()
      .min(1)
      .optional()
      .describe("Maximum number of votes a single user can cast"),
    voting_visibility: z
      .enum(["anonymous", "public"])
      .optional()
      .describe("Whether votes are anonymous or publicly attributed"),
    allow_user_suggested_options: z
      .boolean()
      .optional()
      .describe("Whether users can suggest new options on the poll"),
    allow_answers: z.boolean().optional().describe("Whether users can submit free-text answers"),
    is_closed: z.boolean().optional().describe("Whether the poll is closed to new votes"),
    custom: customData,
  },
  handler: async (args, client) =>
    client.createPoll(
      defined({
        name: args.name,
        user_id: args.user_id,
        description: args.description,
        options: args.options?.map((option) => defined(option)),
        enforce_unique_vote: args.enforce_unique_vote,
        max_votes_allowed: args.max_votes_allowed,
        voting_visibility: args.voting_visibility,
        allow_user_suggested_options: args.allow_user_suggested_options,
        allow_answers: args.allow_answers,
        is_closed: args.is_closed,
        custom: args.custom,
      })
    ),
});

const getPoll = defineTool({
  name: "chat_get_poll",
  title: "Get poll",
  toolset: "chat",
  description:
    "Retrieve a poll by ID, including its voting options, vote counts, and configuration settings.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    poll_id: z.string().min(1).describe("Poll ID to retrieve"),
    user_id: z.string().optional().describe("User ID to scope the poll view"),
  },
  handler: async (args, client) =>
    client.getPoll(
      defined({
        poll_id: args.poll_id,
        user_id: args.user_id,
      })
    ),
});

const updatePollPartial = defineTool({
  name: "chat_update_poll_partial",
  title: "Partially update poll",
  toolset: "chat",
  description:
    "Partially update a poll's fields using set and unset operations without replacing the entire poll.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    poll_id: z.string().min(1).describe("Poll ID to update"),
    user_id: z.string().optional().describe("User ID performing the update"),
    set: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Fields to set on the poll, e.g. {is_closed: true}"),
    unset: z.array(z.string().min(1)).optional().describe("Field names to remove from the poll"),
  },
  handler: async (args, client) => {
    if (args.set === undefined && args.unset === undefined) {
      throw new ToolInputError("Pass at least one of `set` or `unset`.");
    }
    return client.updatePollPartial(
      defined({
        poll_id: args.poll_id,
        user_id: args.user_id,
        set: args.set,
        unset: args.unset,
      })
    );
  },
});

const deletePoll = defineTool({
  name: "chat_delete_poll",
  title: "Delete poll",
  toolset: "chat",
  description: "Delete a poll by ID, removing the poll and its associated options and votes.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    poll_id: z.string().min(1).describe("Poll ID to delete"),
    user_id: z.string().optional().describe("User ID performing the deletion"),
  },
  handler: async (args, client) =>
    client.deletePoll(
      defined({
        poll_id: args.poll_id,
        user_id: args.user_id,
      })
    ),
});

const queryPolls = defineTool({
  name: "chat_query_polls",
  title: "Query polls",
  toolset: "chat",
  description: "Search and filter polls across the application with sorting and cursor pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
    user_id: z.string().optional().describe("User ID executing the query"),
  },
  handler: async (args, client) =>
    client.queryPolls(
      defined({
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
        user_id: args.user_id,
      })
    ),
});

const createPollOption = defineTool({
  name: "chat_create_poll_option",
  title: "Create poll option",
  toolset: "chat",
  description: "Add a new voting option to an existing poll, with optional custom metadata.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    poll_id: z.string().min(1).describe("Poll ID to add the option to"),
    text: z.string().min(1).describe("Option text displayed to voters"),
    user_id: z.string().optional().describe("User ID creating the option"),
    custom: customData,
  },
  handler: async (args, client) =>
    client.createPollOption(
      defined({
        poll_id: args.poll_id,
        text: args.text,
        user_id: args.user_id,
        custom: args.custom,
      })
    ),
});

const deletePollOption = defineTool({
  name: "chat_delete_poll_option",
  title: "Delete poll option",
  toolset: "chat",
  description: "Remove a voting option from a poll by the poll ID and option ID.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    poll_id: z.string().min(1).describe("Poll ID that owns the option"),
    option_id: z.string().min(1).describe("Option ID to delete"),
    user_id: z.string().optional().describe("User ID performing the deletion"),
  },
  handler: async (args, client) =>
    client.deletePollOption(
      defined({
        poll_id: args.poll_id,
        option_id: args.option_id,
        user_id: args.user_id,
      })
    ),
});

const castPollVote = defineTool({
  name: "chat_cast_poll_vote",
  title: "Cast poll vote",
  toolset: "chat",
  description:
    "Cast a vote for an option or submit an answer text on a poll attached to a chat message.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID that the poll is attached to"),
    poll_id: z.string().min(1).describe("Poll ID to vote on"),
    user_id: z.string().min(1).describe("User ID casting the vote"),
    option_id: z.string().optional().describe("Option ID to vote for"),
    answer_text: z.string().optional().describe("Free-text answer when the poll allows answers"),
  },
  handler: async (args, client) => {
    if (args.option_id === undefined && args.answer_text === undefined) {
      throw new ToolInputError("Pass `option_id` or `answer_text` to cast a vote.");
    }
    return client.chat.castPollVote({
      message_id: args.message_id,
      poll_id: args.poll_id,
      user_id: args.user_id,
      vote: defined({
        option_id: args.option_id,
        answer_text: args.answer_text,
      }),
    });
  },
});

const deletePollVote = defineTool({
  name: "chat_delete_poll_vote",
  title: "Delete poll vote",
  toolset: "chat",
  description: "Remove a previously cast vote from a poll on a chat message by vote ID.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID that the poll is attached to"),
    poll_id: z.string().min(1).describe("Poll ID the vote belongs to"),
    vote_id: z.string().min(1).describe("Vote ID to remove"),
    user_id: z.string().optional().describe("User ID who owns the vote"),
  },
  handler: async (args, client) =>
    client.chat.deletePollVote(
      defined({
        message_id: args.message_id,
        poll_id: args.poll_id,
        vote_id: args.vote_id,
        user_id: args.user_id,
      })
    ),
});

const queryPollVotes = defineTool({
  name: "chat_query_poll_votes",
  title: "Query poll votes",
  toolset: "chat",
  description: "Search and filter votes cast on a poll with sorting and cursor pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    poll_id: z.string().min(1).describe("Poll ID whose votes to query"),
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
    user_id: z.string().optional().describe("User ID executing the query"),
  },
  handler: async (args, client) =>
    client.queryPollVotes(
      defined({
        poll_id: args.poll_id,
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
        user_id: args.user_id,
      })
    ),
});

const createReminder = defineTool({
  name: "chat_create_reminder",
  title: "Create message reminder",
  toolset: "chat",
  description:
    "Create a reminder for a user on a specific chat message, optionally scheduled for a future timestamp.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID to set a reminder for"),
    user_id: z.string().min(1).describe("User ID who will receive the reminder"),
    remind_at: isoDateTime.describe("When to trigger the reminder (ISO 8601)"),
  },
  handler: async (args, client) =>
    client.chat.createReminder(
      defined({
        message_id: args.message_id,
        user_id: args.user_id,
        remind_at: args.remind_at === undefined ? undefined : new Date(args.remind_at),
      })
    ),
});

const updateReminder = defineTool({
  name: "chat_update_reminder",
  title: "Update message reminder",
  toolset: "chat",
  description:
    "Update the scheduled trigger timestamp of an existing user reminder on a chat message.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID of the reminder to update"),
    user_id: z.string().min(1).describe("User ID who owns the reminder"),
    remind_at: isoDateTime.describe("Updated reminder timestamp (ISO 8601)"),
  },
  handler: async (args, client) =>
    client.chat.updateReminder(
      defined({
        message_id: args.message_id,
        user_id: args.user_id,
        remind_at: args.remind_at === undefined ? undefined : new Date(args.remind_at),
      })
    ),
});

const deleteReminder = defineTool({
  name: "chat_delete_reminder",
  title: "Delete message reminder",
  toolset: "chat",
  description: "Delete a user's reminder on a specific chat message so it will no longer fire.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    message_id: z.string().min(1).describe("Message ID whose reminder to delete"),
    user_id: z.string().min(1).describe("User ID who owns the reminder"),
  },
  handler: async (args, client) =>
    client.chat.deleteReminder({
      message_id: args.message_id,
      user_id: args.user_id,
    }),
});

const queryReminders = defineTool({
  name: "chat_query_reminders",
  title: "Query message reminders",
  toolset: "chat",
  description:
    "Search and filter message reminders across the application with sorting and cursor pagination.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    user_id: z.string().optional().describe("User ID whose reminders to query"),
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.chat.queryReminders(
      defined({
        user_id: args.user_id,
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const getDraft = defineTool({
  name: "chat_get_draft",
  title: "Get message draft",
  toolset: "chat",
  description: "Retrieve a user's saved draft message in a channel or message thread.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().min(1).describe("User ID who owns the draft"),
    parent_id: z
      .string()
      .optional()
      .describe("Parent message ID when fetching a thread reply draft"),
  },
  handler: async (args, client) =>
    client.chat.getDraft(
      defined({
        type: args.channel_type,
        id: args.channel_id,
        user_id: args.user_id,
        parent_id: args.parent_id,
      })
    ),
});

const deleteDraft = defineTool({
  name: "chat_delete_draft",
  title: "Delete message draft",
  toolset: "chat",
  description: "Delete a user's saved draft message in a channel or message thread.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...channelRef,
    user_id: z.string().min(1).describe("User ID who owns the draft"),
    parent_id: z
      .string()
      .optional()
      .describe("Parent message ID when deleting a thread reply draft"),
  },
  handler: async (args, client) =>
    client.chat.deleteDraft(
      defined({
        type: args.channel_type,
        id: args.channel_id,
        user_id: args.user_id,
        parent_id: args.parent_id,
      })
    ),
});

const queryDrafts = defineTool({
  name: "chat_query_drafts",
  title: "Query message drafts",
  toolset: "chat",
  description: "List and filter a user's saved draft messages across channels and threads.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    user_id: z.string().min(1).describe("User ID whose drafts to query"),
    filter: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.chat.queryDrafts(
      defined({
        user_id: args.user_id,
        filter: args.filter,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

export const pollTools: AnyToolDef[] = [
  createPoll,
  getPoll,
  updatePollPartial,
  deletePoll,
  queryPolls,
  createPollOption,
  deletePollOption,
  castPollVote,
  deletePollVote,
  queryPollVotes,
  createReminder,
  updateReminder,
  deleteReminder,
  queryReminders,
  getDraft,
  deleteDraft,
  queryDrafts,
];
