import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getMaxResponseBytes } from "../config.js";
import { formatErrorMessage } from "./errors.js";

/**
 * Response fields that are large, structural and almost never what the caller
 * asked for. Dropping them is the single biggest win for context size — a
 * `queryChannels` response is mostly `config` blobs, and a call response is
 * mostly `own_capabilities`.
 *
 * Tools whose payload *is* one of these (e.g. `chat_get_channel_type`) opt out
 * with `compact: false`.
 */
const NOISE_KEYS = new Set([
  "config",
  "own_capabilities",
  "grants",
  "push_notifications",
  "commands",
  "thumbnails",
]);

const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_CHARS = 2_000;

function omissionMarker(omitted: number): Record<string, unknown> {
  return {
    _omitted_items: omitted,
    _hint: "Narrow the filter, page with limit/next, or pass verbose:true.",
  };
}

/**
 * Recursively trims a Stream API response to something a model can read
 * without burning its context window. Structure is preserved; only noisy
 * keys, long arrays and long strings are reduced.
 */
export function shrink(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}… (+${value.length - MAX_STRING_CHARS} chars, verbose:true for all)`
      : value;
  }

  if (typeof value !== "object") return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (value.length <= MAX_ARRAY_ITEMS) return value.map(shrink);
    return [
      ...value.slice(0, MAX_ARRAY_ITEMS).map(shrink),
      omissionMarker(value.length - MAX_ARRAY_ITEMS),
    ];
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (NOISE_KEYS.has(key)) continue;
    if (entry === undefined) continue;
    out[key] = shrink(entry);
  }
  return out;
}

/** Serialises a tool payload, capping total bytes with an explicit notice. */
export function serialize(data: unknown): string {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const cap = getMaxResponseBytes();
  if (text.length <= cap) return text;
  return (
    `${text.slice(0, cap)}\n\n` +
    `[TRUNCATED: response was ${text.length} bytes, capped at ${cap}. ` +
    `Narrow the filter or lower the limit — the JSON above is incomplete and will not parse.]`
  );
}

/** Shallow-drops keys from an object, then shrinks what remains. */
export function omit<T extends Record<string, unknown>>(
  value: T | undefined,
  keys: readonly string[]
): unknown {
  if (!value) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (keys.includes(key)) continue;
    out[key] = shrink(entry);
  }
  return out;
}

export function toolResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: serialize(data) }] };
}

export function toolError(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: formatErrorMessage(error) }],
    isError: true,
  };
}
