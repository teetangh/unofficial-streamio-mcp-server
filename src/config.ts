/**
 * Environment-derived configuration.
 *
 * Everything here is read lazily so that `tools/list` works without
 * credentials — an MCP client must be able to discover the tool surface
 * before the user has configured a Stream app.
 */

export const ALL_TOOLSETS = [
  "chat",
  "chat-admin",
  "video",
  "video-admin",
  "moderation",
  "users",
  "app",
] as const;

export type Toolset = (typeof ALL_TOOLSETS)[number];

const DEFAULT_TIMEOUT_MS = 15_000;

/** Max bytes of JSON a single tool result may put into the model's context. */
export const DEFAULT_MAX_RESPONSE_BYTES = 30_000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid numeric environment value ${JSON.stringify(raw)} — expected a positive number.`
    );
  }
  return Math.floor(parsed);
}

export function getTimeoutMs(): number {
  return parsePositiveInt(process.env.STREAM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

export function getMaxResponseBytes(): number {
  return parsePositiveInt(process.env.STREAM_MCP_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES);
}

export function getBasePath(): string | undefined {
  const raw = process.env.STREAM_BASE_URL?.trim();
  return raw ? raw : undefined;
}

/** `STREAM_MCP_READ_ONLY=true` registers only tools annotated `readOnlyHint`. */
export function isReadOnly(): boolean {
  const raw = process.env.STREAM_MCP_READ_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * `STREAM_MCP_TOOLSETS` selects which groups to register. Defaults to all.
 * Accepts a comma-separated list, or `all`.
 */
export function getEnabledToolsets(): ReadonlySet<Toolset> {
  const raw = process.env.STREAM_MCP_TOOLSETS?.trim();
  if (!raw || raw.toLowerCase() === "all") return new Set(ALL_TOOLSETS);

  const requested = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const unknown = requested.filter((entry) => !(ALL_TOOLSETS as readonly string[]).includes(entry));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown toolset(s) in STREAM_MCP_TOOLSETS: ${unknown.join(", ")}. ` +
        `Valid toolsets: ${ALL_TOOLSETS.join(", ")}, or "all".`
    );
  }

  return new Set(requested as Toolset[]);
}
