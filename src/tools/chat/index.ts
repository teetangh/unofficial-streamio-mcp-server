import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateToken } from "./create-token.js";
import { registerUpsertUsers } from "./upsert-users.js";
import { registerCreateChannel } from "./create-channel.js";
import { registerSendMessage } from "./send-message.js";
import { registerQueryChannels } from "./query-channels.js";
import { registerQueryUsers } from "./query-users.js";
import { registerAddMembers } from "./add-members.js";
import { registerUpdateChannel } from "./update-channel.js";
import { registerRemoveMembers } from "./remove-members.js";
import { registerBanUser } from "./ban-user.js";
import { registerUnbanUser } from "./unban-user.js";
import { registerDeleteMessage } from "./delete-message.js";
import { registerFlagMessage } from "./flag-message.js";

export function registerChatTools(server: McpServer): void {
  registerCreateToken(server);
  registerUpsertUsers(server);
  registerCreateChannel(server);
  registerSendMessage(server);
  registerQueryChannels(server);
  registerQueryUsers(server);
  registerAddMembers(server);
  registerUpdateChannel(server);
  registerRemoveMembers(server);
  registerBanUser(server);
  registerUnbanUser(server);
  registerDeleteMessage(server);
  registerFlagMessage(server);
}
