import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";
import { getClient } from "./clients/index.js";
import { registerPrompts } from "./mcp/prompts.js";
import { registerResources } from "./mcp/resources.js";
import { registerAllTools } from "./tools/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const SERVER_NAME = "stream-io-mcp";
export const SERVER_VERSION = pkg.version;

/** Builds a fully-registered server. Shared by the entrypoint and the tests. */
export function createServer(): { server: McpServer; toolCount: number } {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  const toolCount = registerAllTools(server);
  registerResources(server, getClient);
  registerPrompts(server);
  return { server, toolCount };
}
