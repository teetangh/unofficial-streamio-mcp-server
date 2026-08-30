import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./define.js";
import { ALL_TOOLS } from "./registry.js";

export { ALL_TOOLS, getTool } from "./registry.js";
export { defineTool, registerTool, registerTools, type ToolDef } from "./define.js";

/** Registers every enabled tool and returns how many were registered. */
export function registerAllTools(server: McpServer): number {
  return registerTools(server, ALL_TOOLS);
}
