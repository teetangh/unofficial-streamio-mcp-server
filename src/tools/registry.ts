import { channelTools } from "./chat/channels.js";
import { messageTools } from "./chat/messages.js";
import type { ToolDef } from "./define.js";
import { moderationTools } from "./moderation/moderation.js";
import { tokenTools } from "./users/tokens.js";
import { userTools } from "./users/users.js";
import { callTools } from "./video/calls.js";
import { mediaTools } from "./video/media.js";
import { participantTools } from "./video/participants.js";

/**
 * Every tool the server can expose, in the order they are registered.
 * Tests and the docs generator read this array — nothing introspects the
 * MCP server's internals.
 */
export const ALL_TOOLS: readonly ToolDef<any>[] = [
  ...tokenTools,
  ...userTools,
  ...channelTools,
  ...messageTools,
  ...moderationTools,
  ...callTools,
  ...participantTools,
  ...mediaTools,
];

export function getTool(name: string): ToolDef<any> | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name || (tool.aliases ?? []).includes(name));
}
