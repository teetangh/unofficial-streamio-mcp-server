/**
 * Error formatting.
 *
 * `@stream-io/node-sdk` throws `StreamError`, which carries a Stream error
 * `code` plus a `metadata` bag with the HTTP status, rate-limit headers and
 * the client request id. None of that is exposed as `error.status`, so it all
 * has to be read off `metadata`.
 */

interface StreamRateLimit {
  rateLimit?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

interface StreamErrorMetadata {
  clientRequestId?: string;
  responseCode?: number;
  rateLimit?: StreamRateLimit;
}

interface StreamErrorLike extends Error {
  code?: number;
  metadata?: StreamErrorMetadata;
}

/** Raised for input a tool rejects before it ever reaches Stream. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

function isStreamError(error: unknown): error is StreamErrorLike {
  if (!(error instanceof Error) || !("metadata" in error)) return false;
  const { metadata } = error as StreamErrorLike;
  // typeof null === "object", so a local error carrying `metadata: null`
  // would otherwise be reported as a Stream API failure.
  return metadata !== null && typeof metadata === "object";
}

/**
 * Remediation hints for the Stream error codes an MCP client actually hits.
 * Keeps the model from retrying an unretryable call.
 */
const CODE_HINTS: Record<number, string> = {
  4: "Input error — check required fields and enum values against the tool schema.",
  9: "Rate limited — back off and retry after the reset time below.",
  16: "The referenced object does not exist. Create it first, or check the id/type.",
  17: "Not allowed — the acting user lacks permission, or the app/channel/call type forbids this.",
  40: "Authentication failed — check STREAM_API_KEY and STREAM_API_SECRET.",
};

export function formatErrorMessage(error: unknown): string {
  if (error instanceof ToolInputError) {
    return `Invalid input: ${error.message}`;
  }

  if (isStreamError(error)) {
    const { code, metadata, message } = error;
    const parts: string[] = [];

    const status = metadata?.responseCode;
    const descriptor = [
      status !== undefined ? `HTTP ${status}` : undefined,
      code !== undefined ? `Stream code ${code}` : undefined,
    ]
      .filter(Boolean)
      .join(", ");

    parts.push(
      descriptor ? `Stream API error (${descriptor}): ${message}` : `Stream API error: ${message}`
    );

    if (code !== undefined && CODE_HINTS[code]) {
      parts.push(CODE_HINTS[code]);
    }

    const rateLimit = metadata?.rateLimit;
    if (rateLimit?.rateLimitRemaining !== undefined) {
      const reset = rateLimit.rateLimitReset
        ? ` (resets ${rateLimit.rateLimitReset.toISOString()})`
        : "";
      parts.push(
        `Rate limit: ${rateLimit.rateLimitRemaining}/${rateLimit.rateLimit ?? "?"} remaining${reset}.`
      );
    }

    if (metadata?.clientRequestId) {
      parts.push(`Request id: ${metadata.clientRequestId}`);
    }

    return parts.join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
