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

/**
 * When an array is trimmed, both ends are kept. Stream returns messages and
 * replies oldest-first, so keeping only the head would drop the *newest*
 * entries — the ones a caller reading chat history almost always wants.
 */
const HEAD_ITEMS = 12;
const TAIL_ITEMS = MAX_ARRAY_ITEMS - HEAD_ITEMS;

function omissionMarker(omitted: number): Record<string, unknown> {
  return {
    _omitted_items: omitted,
    _note: "Items omitted from the middle; the first and last entries are shown.",
    _hint: "Narrow the filter, page with limit/next, or pass verbose:true.",
  };
}

/**
 * Recursively trims a Stream API response to something a model can read
 * without burning its context window. Structure is preserved; only noisy
 * keys, long arrays and long strings are reduced.
 *
 * `maxArrayItems` raises the array cap for tools whose list length is already
 * bounded by a request-side limit the caller chose — truncating those again
 * would silently contradict the limit they asked for.
 */
export function shrink(value: unknown, maxArrayItems: number = MAX_ARRAY_ITEMS): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}… (+${value.length - MAX_STRING_CHARS} chars, verbose:true for all)`
      : value;
  }

  if (typeof value !== "object") return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (value.length <= maxArrayItems) {
      return value.map((entry) => shrink(entry, maxArrayItems));
    }
    const head = Math.min(HEAD_ITEMS, maxArrayItems - 1);
    const tail = Math.max(1, Math.min(TAIL_ITEMS, maxArrayItems - head));
    return [
      ...value.slice(0, head).map((entry) => shrink(entry, maxArrayItems)),
      omissionMarker(value.length - head - tail),
      ...value.slice(-tail).map((entry) => shrink(entry, maxArrayItems)),
    ];
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (NOISE_KEYS.has(key)) continue;
    if (entry === undefined) continue;
    out[key] = shrink(entry, maxArrayItems);
  }
  return out;
}

/** Serialises a tool payload, capping total bytes with an explicit notice. */
export function serialize(data: unknown): string {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const cap = getMaxResponseBytes();
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= cap) return text;

  // Trim by characters until the UTF-8 size fits, so multi-byte content is
  // measured honestly rather than by UTF-16 code-unit count.
  let end = Math.min(text.length, cap);
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > cap) {
    end = Math.floor(end * 0.9);
  }
  return (
    `${text.slice(0, end)}\n\n` +
    `[TRUNCATED: response was ${bytes} bytes, capped at ${cap}. ` +
    `Narrow the filter or lower the limit — the JSON above is incomplete and will not parse.]`
  );
}

/**
 * Compaction for tools whose list length is already bounded by a limit the
 * caller chose. Truncating those again would silently return fewer items than
 * the caller asked for. Noisy keys and long strings are still reduced; the
 * byte cap in `serialize` remains the backstop.
 */
export function bounded(raw: unknown): unknown {
  return shrink(raw, 300);
}

/** Shallow-drops keys from an object, then shrinks what remains. */
export function omit<T extends Record<string, unknown>>(
  value: T | undefined,
  keys: readonly string[],
  maxArrayItems?: number
): unknown {
  if (!value) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (keys.includes(key)) continue;
    out[key] = shrink(entry, maxArrayItems);
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
