import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateCall } from "./create-call.js";
import { registerGetCall } from "./get-call.js";
import { registerUpdateCall } from "./update-call.js";
import { registerEndCall } from "./end-call.js";
import { registerQueryCalls } from "./query-calls.js";

export function registerVideoTools(server: McpServer): void {
  registerCreateCall(server);
  registerGetCall(server);
  registerUpdateCall(server);
  registerEndCall(server);
  registerQueryCalls(server);
}
