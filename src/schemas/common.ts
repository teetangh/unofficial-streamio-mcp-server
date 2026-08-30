import { z } from "zod";

/** Stream's filter DSL is open-ended; validate shape, not contents. */
export const filterConditions = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Filter object using Stream query syntax. Operators: $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $exists, $and, $or, $autocomplete, $contains."
  );

export const sortDirection = z
  .union([z.literal(1), z.literal(-1)])
  .describe("1 for ascending, -1 for descending");

export const sortParam = z.object({
  field: z.string().describe("Field to sort by"),
  direction: sortDirection.optional(),
});

export const sortParams = z
  .array(sortParam)
  .optional()
  .describe("Sort parameters, applied in order");

/** Cursor pagination (video endpoints and chat search). */
export const nextCursor = z
  .string()
  .optional()
  .describe("Cursor from a previous response's `next` field");

export const prevCursor = z
  .string()
  .optional()
  .describe("Cursor from a previous response's `prev` field");

export function limit(max: number, fallback: number) {
  return z
    .int()
    .min(1)
    .max(max)
    .optional()
    .describe(`Max results to return (default: ${fallback}, max: ${max})`);
}

export const offset = z
  .int()
  .min(0)
  .max(1000)
  .optional()
  .describe("Number of results to skip (max: 1000)");

export const customData = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("Custom key/value data stored on the object");

export const userId = z.string().min(1).describe("Stream user ID");

export const userIds = z.array(z.string().min(1)).min(1).describe("Array of Stream user IDs");

/** Channel coordinates. Every chat tool that targets a channel uses these. */
export const channelRef = {
  channel_type: z.string().min(1).describe("Channel type (e.g. 'messaging', 'team', 'livestream')"),
  channel_id: z.string().min(1).max(64).describe("Channel ID"),
};

/** Call coordinates. Every video tool that targets a call uses these. */
export const callRef = {
  call_type: z
    .string()
    .min(1)
    .describe("Call type: 'default', 'livestream', 'audio_room', 'development', or a custom type"),
  call_id: z.string().min(1).max(64).describe("Call ID"),
};

export const channelMember = z.object({
  user_id: z.string().min(1).describe("User ID"),
  role: z.string().optional().describe("Channel role (e.g. 'channel_member', 'channel_moderator')"),
});

export const callMember = z.object({
  user_id: z.string().min(1).describe("User ID"),
  role: z.string().optional().describe("Call role (e.g. 'host', 'speaker', 'user', 'admin')"),
  custom: z.record(z.string(), z.unknown()).optional().describe("Custom member data"),
});

/**
 * Strips `undefined` entries so Stream never receives explicit nulls for
 * fields the caller left out. The mapped return type drops `undefined` from
 * each value so the result stays assignable to the SDK's request models.
 */
export type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

export function defined<T extends Record<string, unknown>>(obj: T): Defined<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Defined<T>;
}
