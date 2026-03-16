import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerChatTools } from "./chat/index.js";
import { registerVideoTools } from "./video/index.js";

export function registerAllTools(server: McpServer): void {
  registerChatTools(server);
  registerVideoTools(server);
}
