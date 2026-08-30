import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { StreamClient } from "@stream-io/node-sdk";
import { z } from "zod";
import { getClient } from "../clients/index.js";
import type { Toolset } from "../config.js";
import { getEnabledToolsets, isReadOnly } from "../config.js";
import { shrink, toolError, toolResult } from "../utils/format.js";

/**
 * `verbose` is injected into every tool's schema by `registerTool`, so
 * individual definitions never declare it.
 */
export const VERBOSE_KEY = "verbose" as const;

const verboseSchema = z
  .boolean()
  .optional()
  .describe(
    "Return the full raw Stream response instead of the compacted view. Only use when the compacted result is missing a field you need — raw responses are large."
  );

export type ToolArgs<S extends z.ZodRawShape> = z.infer<z.ZodObject<S>> & {
  verbose?: boolean;
};

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  /** Canonical tool name, e.g. `chat_send_message`. */
  name: string;
  /** Human-readable label surfaced to MCP clients. */
  title: string;
  description: string;
  toolset: Toolset;
  inputSchema: S;
  annotations: ToolAnnotations;
  handler: (args: ToolArgs<S>, client: StreamClient) => Promise<unknown>;
  /**
   * How to reduce the response before it reaches the model.
   * - omitted: the default shrinker (drops noisy keys, caps arrays/strings)
   * - function: a bespoke projection
   * - `false`: return the response untouched (for tools whose payload *is*
   *   the config blob the shrinker would otherwise drop)
   */
  compact?: ((raw: any) => unknown) | false;
  /** Deprecated names kept working for one minor release. */
  aliases?: string[];
}

/** Helper that preserves the shape's literal type for handler inference. */
export function defineTool<S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

function applyCompaction<S extends z.ZodRawShape>(
  def: ToolDef<S>,
  raw: unknown,
  verbose: boolean
): unknown {
  if (verbose) return raw;
  if (def.compact === false) return raw;
  if (typeof def.compact === "function") return def.compact(raw);
  return shrink(raw);
}

function isRegistrable(def: ToolDef<any>, enabled: ReadonlySet<Toolset>): boolean {
  if (!enabled.has(def.toolset)) return false;
  if (isReadOnly() && def.annotations.readOnlyHint !== true) return false;
  return true;
}

/**
 * Registers one definition (plus any deprecated aliases) on an MCP server.
 * All cross-cutting behaviour — client lookup, error mapping, compaction —
 * lives here so tool modules stay declarative.
 */
export function registerTool<S extends z.ZodRawShape>(
  server: McpServer,
  def: ToolDef<S>,
  enabled: ReadonlySet<Toolset>
): boolean {
  if (!isRegistrable(def, enabled)) return false;

  const inputSchema = {
    ...def.inputSchema,
    [VERBOSE_KEY]: verboseSchema,
  } as S & { verbose: typeof verboseSchema };

  const makeHandler =
    (deprecatedAs?: string) =>
    async (args: ToolArgs<S>): Promise<any> => {
      try {
        const { verbose = false } = args;
        const client = getClient();
        const raw = await def.handler(args, client);
        const payload = applyCompaction(def, raw, verbose);
        const result = toolResult(payload);
        if (deprecatedAs) {
          result.content.unshift({
            type: "text",
            text: `Note: "${deprecatedAs}" is deprecated and will be removed in 0.3.0. Use "${def.name}".`,
          });
        }
        return result;
      } catch (error) {
        return toolError(error);
      }
    };

  // The SDK types the callback against the concrete shape it infers from
  // `inputSchema`; ToolDef is generic over that shape, so the two cannot be
  // related without re-deriving the SDK's inference. Runtime behaviour is
  // covered by the round-trip tests in __tests__/server.test.ts.
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema,
      annotations: { title: def.title, ...def.annotations },
    },
    makeHandler() as never
  );

  for (const alias of def.aliases ?? []) {
    server.registerTool(
      alias,
      {
        title: `${def.title} (deprecated)`,
        description: `Deprecated alias for "${def.name}". ${def.description}`,
        inputSchema,
        annotations: { title: def.title, ...def.annotations },
      },
      makeHandler(alias) as never
    );
  }

  return true;
}

export function registerTools(server: McpServer, defs: readonly ToolDef<any>[]): number {
  const enabled = getEnabledToolsets();
  let count = 0;
  for (const def of defs) {
    if (registerTool(server, def, enabled)) count += 1;
  }
  return count;
}
