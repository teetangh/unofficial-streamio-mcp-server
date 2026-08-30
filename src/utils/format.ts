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
 *
 * The split scales with the cap, so raising the cap actually returns more.
 */
const HEAD_SHARE = 0.6;

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
    const head = Math.max(1, Math.floor(maxArrayItems * HEAD_SHARE));
    const tail = Math.max(1, maxArrayItems - head);
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

const render = (value: unknown): string => {
  if (typeof value === "string") return value;
  // JSON.stringify returns undefined for `undefined` and for a bare function,
  // which would make Buffer.byteLength throw and turn a success into an error.
  return JSON.stringify(value, null, 2) ?? "null";
};

const utf8 = (text: string): number => Buffer.byteLength(text, "utf8");

/** The longest array property on an object, which is what to shed first. */
function largestArrayKey(value: Record<string, unknown>): string | undefined {
  let best: string | undefined;
  let bestLength = 1;
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry) && entry.length > bestLength) {
      best = key;
      bestLength = entry.length;
    }
  }
  return best;
}

/**
 * Serialises a tool payload within the byte cap.
 *
 * An oversized payload sheds whole list entries first, so what comes back is
 * still valid JSON that a model can parse — a mid-string slice is worse than
 * useless. The hard slice remains only for payloads with no list to shed.
 */
export function serialize(data: unknown): string {
  const cap = getMaxResponseBytes();
  let text = render(data);
  if (utf8(text) <= cap) return text;

  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const clone = { ...(data as Record<string, unknown>) } as Record<string, unknown>;
    const key = largestArrayKey(clone);
    if (key) {
      const items = clone[key] as unknown[];
      let keep = items.length;
      while (keep > 0) {
        keep = Math.floor(keep / 2);
        clone[key] = items.slice(0, keep);
        clone._omitted_items = items.length - keep;
        clone._hint = `Response exceeded ${cap} bytes; ${items.length - keep} of ${items.length} \`${key}\` entries were dropped. Lower the limit or narrow the filter.`;
        text = render(clone);
        if (utf8(text) <= cap) return text;
      }
    }
  }

  // Nothing sheddable — fall back to a slice and say so plainly. The notice is
  // budgeted for up front, so the returned text stays inside the cap rather
  // than exceeding it by the length of its own warning.
  text = render(data);
  const bytes = utf8(text);
  const notice =
    `\n\n[TRUNCATED: response was ${bytes} bytes, capped at ${cap}. ` +
    `Narrow the filter or lower the limit — the JSON above is incomplete and will not parse.]`;
  const shortNotice = `\n\n[TRUNCATED: ${bytes}B exceeds the ${cap}B cap]`;

  // Under a very small cap not even the notice fits. Prefer the notice: a
  // caller learns more from "truncated" than from a few bytes of JSON.
  const chosen = utf8(notice) <= cap ? notice : shortNotice;
  const budget = Math.max(0, cap - utf8(chosen));

  let end = Math.min(text.length, budget);
  while (end > 0 && utf8(text.slice(0, end)) > budget) {
    end = Math.floor(end * 0.9);
  }
  return `${text.slice(0, end)}${chosen}`;
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
export function omit<T extends object>(
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
