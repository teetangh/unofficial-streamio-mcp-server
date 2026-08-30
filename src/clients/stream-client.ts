import { StreamClient } from "@stream-io/node-sdk";
import { getBasePath, getTimeoutMs } from "../config.js";

let client: StreamClient | null = null;

function getConfig(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Missing STREAM_API_KEY or STREAM_API_SECRET environment variables. " +
        "Set them in your MCP client config or shell environment."
    );
  }
  return { apiKey, apiSecret };
}

export function getClient(): StreamClient {
  if (!client) {
    const { apiKey, apiSecret } = getConfig();
    const basePath = getBasePath();
    // The SDK defaults to a 3s timeout, which is too tight for query/export
    // endpoints and surfaces as an opaque "request was aborted" error.
    client = new StreamClient(apiKey, apiSecret, {
      timeout: getTimeoutMs(),
      ...(basePath !== undefined && { basePath }),
    });
  }
  return client;
}

/** Reset client — used for testing, and after an env change. */
export function resetClient(): void {
  client = null;
}
