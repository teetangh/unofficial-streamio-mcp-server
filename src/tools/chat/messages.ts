import type { Attachment } from "@stream-io/node-sdk";
import { z } from "zod";
import { channelRef, customData, defined } from "../../schemas/common.js";
import { defineTool, type AnyToolDef } from "../define.js";

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
      defined({
        id: args.message_id,
        hard: args.hard ?? false,
        deleted_by: args.deleted_by,
      })
    ),
});

export const messageTools: AnyToolDef[] = [sendMessage, deleteMessage];
