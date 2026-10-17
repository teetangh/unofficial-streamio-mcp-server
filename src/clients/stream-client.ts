import { StreamClient } from "@stream-io/node-sdk";
import { getBasePath, getTimeoutMs } from "../config.js";
import { ToolInputError } from "../utils/errors.js";

let client: StreamClient | null = null;

/**
 * The SDK splices path parameters into the URL unencoded, and fetch resolves
 * dot segments, so an id of "../../app" turns GET /channeltypes/{name} into
 * GET /app — the raw settings, push credentials included, that app_get_settings
 * redacts. It works in read-only mode too, since it is still a GET. No Stream
 * identifier legitimately contains these characters ("%" is in the set because
 * the URL parser treats "%2e%2e" as ".."), so reject them before any request
 * leaves the process. This sits below every tool and resource, including ones
 * not yet written.
 */
const UNSAFE_PATH_PARAM = /[/\\?#%]|^\.{1,2}$/;

type SendRequest = (
  method: string,
  url: string,
  pathParams?: Record<string, unknown>,
  ...rest: unknown[]
) => Promise<unknown>;

export function assertSafePathParams(pathParams: Record<string, unknown> | undefined): void {
  for (const [name, value] of Object.entries(pathParams ?? {})) {
    const text = String(value);
    if (text === "" || UNSAFE_PATH_PARAM.test(text)) {
      throw new ToolInputError(
        `Invalid \`${name}\`: ${JSON.stringify(text)}. Stream identifiers cannot be empty, contain / \\ ? # or %, or be "." or "..".`
      );
    }
  }
}

function guardPathParams(streamClient: StreamClient): void {
  const internals = streamClient as unknown as Record<string, { apiClient?: unknown }> & {
    apiClient?: unknown;
  };
  const apiClients = new Set(
    [
      internals.apiClient,
      internals.video?.apiClient,
      internals.moderation?.apiClient,
      internals.feeds?.apiClient,
    ].filter(Boolean)
  ) as Set<{ sendRequest: SendRequest }>;
  for (const apiClient of apiClients) {
    const send = apiClient.sendRequest;
    apiClient.sendRequest = (method, url, pathParams, ...rest) => {
      assertSafePathParams(pathParams);
      return send(method, url, pathParams, ...rest);
    };
  }
}

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
    guardPathParams(client);
  }
  return client;
}

/** Reset client — used for testing, and after an env change. */
export function resetClient(): void {
  client = null;
}
