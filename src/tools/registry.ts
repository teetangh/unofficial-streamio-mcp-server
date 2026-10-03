import { appTools } from "./app/app.js";
import { platformTools } from "./app/platform.js";
import { chatAdminTools } from "./chat/admin.js";
import { channelTools } from "./chat/channels.js";
import { commandAndBatchTools } from "./chat/commands.js";
import { messageTools } from "./chat/messages.js";
import { pollTools } from "./chat/polls.js";
import type { AnyToolDef } from "./define.js";
import { blocklistTools } from "./moderation/blocklists.js";
import { moderationTools } from "./moderation/moderation.js";
import { moderationPolicyTools } from "./moderation/policies.js";
import { deviceAndGroupTools } from "./users/devices.js";
import { tokenTools } from "./users/tokens.js";
import { userTools } from "./users/users.js";
import { videoAdminTools } from "./video/admin.js";
import { videoAnalyticsAndSipTools } from "./video/analytics.js";
import { callTools } from "./video/calls.js";
import { mediaTools } from "./video/media.js";
import { participantTools } from "./video/participants.js";

/**
 * Every tool the server can expose, in the order they are registered.
 * Tests and the docs generator read this array — nothing introspects the
 * MCP server's internals.
 */
export const ALL_TOOLS: readonly AnyToolDef[] = [
  ...tokenTools,
  ...userTools,
  ...deviceAndGroupTools,
  ...channelTools,
  ...messageTools,
  ...pollTools,
  ...chatAdminTools,
  ...commandAndBatchTools,
  ...moderationTools,
  ...blocklistTools,
  ...moderationPolicyTools,
  ...callTools,
  ...participantTools,
  ...mediaTools,
  ...videoAdminTools,
  ...videoAnalyticsAndSipTools,
  ...appTools,
  ...platformTools,
];

export function getTool(name: string): AnyToolDef | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}
