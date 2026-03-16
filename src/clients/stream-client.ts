import { StreamClient } from "@stream-io/node-sdk";

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
    client = new StreamClient(apiKey, apiSecret);
  }
  return client;
}

/** Reset client — used for testing */
export function resetClient(): void {
  client = null;
}
