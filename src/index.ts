#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_VERSION } from "./server.js";

async function main(): Promise<void> {
  const { server, toolCount } = createServer();
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`Received ${signal}, shutting down.`);
    try {
      await server.close();
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
    process.exit(0);
  };

  process.on("SIGINT", (signal) => void shutdown(signal));
  process.on("SIGTERM", (signal) => void shutdown(signal));

  // Every tool handler is async; without these an unexpected rejection would
  // kill the process with no diagnostic on stderr.
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
    process.exitCode = 1;
  });
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  await server.connect(transport);
  console.error(
    `Stream.io MCP server v${SERVER_VERSION} running on stdio — ${toolCount} tools registered.`
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
