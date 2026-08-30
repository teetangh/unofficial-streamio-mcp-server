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
 *
 * NOTE: `grants` and `commands` are unrecoverable through any shrink-based
 * path. A tool whose whole point is permission grants — `video_get_call_type`,
 * `chat_get_channel_type` — must name them in an explicit projection or opt
 * out entirely; falling through to `shrink` deletes exactly what the caller
 * asked for.
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

const render = (value: unknown, indent: number): string => {
  if (typeof value === "string") return value;
  // JSON.stringify returns undefined for `undefined` and for a bare function,
  // which would make Buffer.byteLength throw and turn a success into an error.
  return JSON.stringify(value, null, indent) ?? "null";
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

function omissionHint(cap: number, key: string, total: number, keep: number): string {
  return (
    `Response exceeded ${cap} bytes even without indentation; ` +
    `${total - keep} of ${total} \`${key}\` entries were dropped. ` +
    `Lower the limit or narrow the filter.`
  );
}

/**
 * Serialises a tool payload within the byte cap, shedding the cheapest thing
 * first.
 *
 * Indentation goes before any data does: it is roughly a third of a nested
 * payload and carries no information. Only then are list entries dropped, and
 * the number kept is the largest prefix that fits — found by bisection rather
 * than the repeated halving this replaces, which turned a 30-row page into 7
 * and a 100-user page into 25. The hard slice remains only for payloads with
 * no list to shed.
 */
export function serialize(data: unknown): string {
  const cap = getMaxResponseBytes();

  const pretty = render(data, 2);
  if (utf8(pretty) <= cap) return pretty;

  const text = render(data, 0);
  if (utf8(text) <= cap) return text;

  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const clone = { ...(data as Record<string, unknown>) } as Record<string, unknown>;
    const key = largestArrayKey(clone);
    if (key) {
      const items = clone[key] as unknown[];
      // Every list projection sets its own `_hint`. Read it once, before the
      // search starts overwriting it, and keep it in front of the truncation
      // notice — a caller loses the projection's guidance otherwise, at the
      // moment they most need "pass verbose:true".
      const toolHint = typeof clone._hint === "string" ? `${clone._hint} ` : "";
      // Applies a candidate prefix and reports whether it fits. Output grows
      // with the number of entries kept, so the largest fitting prefix can be
      // bisected for; `keep = 0` is still a useful answer, because an envelope
      // that parses beats a mid-string slice that does not.
      const fits = (keep: number): boolean => {
        clone[key] = items.slice(0, keep);
        clone._omitted_items = items.length - keep;
        clone._hint = toolHint + omissionHint(cap, key, items.length, keep);
        return utf8(render(clone, 0)) <= cap;
      };

      let low = 0;
      let high = items.length - 1;
      let best = -1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (fits(middle)) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      // Re-applied rather than remembered: `fits` mutates `clone`, and the
      // width of `_omitted_items` makes size very slightly non-monotone, so
      // the winning slice is re-checked rather than trusted.
      if (best >= 0 && fits(best)) return render(clone, 0);
    }
  }

  // Nothing sheddable — fall back to a slice and say so plainly. The notice is
  // budgeted for up front, so the returned text stays inside the cap rather
  // than exceeding it by the length of its own warning.
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

/**
 * Keeps only the named keys.
 *
 * Unlike `omit`, this is an allow-list, which is what a row projection needs:
 * `omit` can only drop keys from an object's *children*, so a per-row
 * `own_capabilities` survives it. The result also stays typed — a key Stream
 * renames fails the build instead of quietly vanishing from the response, and
 * the caller can spread the result without a cast.
 *
 * Values are returned as they are. Anything nested and unbounded is projected
 * explicitly by the tool that owns it.
 */
export function pick<T extends object, K extends keyof T>(
  value: T | null | undefined,
  keys: readonly K[]
): Pick<T, K> | undefined {
  if (!value) return undefined;
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  return out as Pick<T, K>;
}

/**
 * A user reduced to what a listing needs. A full `UserResponse` is a few
 * hundred bytes of role, timestamps, teams and mute state repeated on every
 * row of a page.
 *
 * Typed structurally, so this module stays free of SDK imports and every
 * Stream user shape fits.
 */
export function userRef(
  user: { id: string; name?: string } | null | undefined
): { id: string; name?: string } | undefined {
  if (!user) return undefined;
  return user.name === undefined ? { id: user.id } : { id: user.id, name: user.name };
}

/**
 * Collapses a keyed map whose values are boilerplate. The keys are listed
 * while there are few enough to read — an ingress encoder ladder is keyed by
 * resolution, which is the useful part — and dropped past that, where the key
 * list is itself the bulk: a composite layout's `options` map has 55 entries.
 */
export function summarizeRecord(
  value: Record<string, unknown> | undefined,
  maxKeys = 8
): { count: number; keys?: string[] } | undefined {
  if (!value) return undefined;
  const keys = Object.keys(value);
  return keys.length > maxKeys ? { count: keys.length } : { count: keys.length, keys };
}

export function toolResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: serialize(data) }] };
}

export function toolError(error: unknown, notFoundHint?: string): CallToolResult {
  return {
    content: [{ type: "text", text: formatErrorMessage(error, notFoundHint) }],
    isError: true,
  };
}
