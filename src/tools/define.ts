import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { StreamClient } from "@stream-io/node-sdk";
import { z } from "zod";
import { getClient } from "../clients/index.js";
import {
  ALL_TOOLSETS,
  getEnabledToolsets,
  isDynamicToolsets,
  isReadOnly,
  type Toolset,
} from "../config.js";
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

/**
 * @typeParam S - the tool's zod input shape
 * @typeParam R - the response type, inferred from `handler` and `compact`
 *                together, so a `compact` projection is checked against the
 *                real Stream response rather than taking `any`.
 */
export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape, R = unknown> {
  /** Canonical tool name, e.g. `chat_send_message`. */
  name: string;
  /** Human-readable label surfaced to MCP clients. */
  title: string;
  description: string;
  toolset: Toolset;
  inputSchema: S;
  annotations: ToolAnnotations;
  handler: (args: ToolArgs<S>, client: StreamClient) => Promise<R>;
  /**
   * How to reduce the response before it reaches the model.
   * - omitted: the default shrinker (drops noisy keys, caps arrays/strings)
   * - function: a bespoke projection
   * - `false`: return the response untouched (for tools whose payload *is*
   *   the config blob the shrinker would otherwise drop)
   *
   * A projection also receives the call's arguments, because what is worth
   * keeping can depend on what the caller asked for: `app_get_rate_limits`
   * filters to consumed quota by default, but must return every endpoint the
   * caller named.
   */
  compact?: ((raw: R, args: ToolArgs<S>) => unknown) | false;
  /**
   * Replaces the generic "Create it first" hint on a Stream 404. Set it on
   * tools that read a resource nobody can create — call reports and call
   * stats are derived from call activity.
   */
  notFoundHint?: string;
  /**
   * Deprecated names kept working for one more minor release. The removal
   * version is stated in the notice `registerTool` prepends — move both
   * together, and only in the release that actually removes them.
   */
  aliases?: string[];
}

/**
 * A tool definition with its input shape and response type erased.
 *
 * Tools are heterogeneous — each has a different schema and a different Stream
 * response — so any collection of them needs erasure. This mirrors Zod's own
 * `ZodTypeAny`. Precision is kept where it pays: `defineTool` infers handler
 * argument types from the schema and `compact`'s parameter from the handler's
 * return type, so authoring a tool is fully checked.
 */
/*
 * `handler` takes its args as a property, so it is contravariant: a
 * ToolDef<SpecificShape> is not assignable to ToolDef<ZodRawShape>. Erasing
 * both parameters is the only way to hold tools in one array, and is the same
 * approach Zod takes with `ZodTypeAny = ZodType<any, any, any>`.
 */
export type AnyToolDef = ToolDef<any, any>;

/**
 * Preserves the schema's literal type and infers the response type, so a
 * handler's `args` and a `compact`'s `raw` are both precisely typed.
 */
export function defineTool<S extends z.ZodRawShape, R>(def: ToolDef<S, R>): ToolDef<S, R> {
  return def;
}

/**
 * Exported for the compaction tests: a projection has to be exercised through
 * the same path the server uses, or the `verbose` and default-`shrink`
 * branches — the two that made `verbose:true` look like a no-op — go untested.
 */
export function applyCompaction<S extends z.ZodRawShape, R>(
  def: ToolDef<S, R>,
  raw: R,
  verbose: boolean,
  args: ToolArgs<S> = {} as ToolArgs<S>
): unknown {
  if (verbose) return raw;
  if (def.compact === false) return raw;
  if (typeof def.compact === "function") return def.compact(raw, args);
  return shrink(raw);
}

function isRegistrable(def: AnyToolDef, enabled: ReadonlySet<Toolset>): boolean {
  if (!enabled.has(def.toolset)) return false;
  if (isReadOnly() && def.annotations.readOnlyHint !== true) return false;
  return true;
}

/**
 * Registers one definition (plus any deprecated aliases) on an MCP server.
 * All cross-cutting behaviour — client lookup, error mapping, compaction —
 * lives here so tool modules stay declarative.
 */
export function registerTool<S extends z.ZodRawShape, R>(
  server: McpServer,
  def: ToolDef<S, R>,
  enabled: ReadonlySet<Toolset>
): RegisteredTool[] {
  if (!isRegistrable(def, enabled)) return [];

  const inputSchema = {
    ...def.inputSchema,
    [VERBOSE_KEY]: verboseSchema,
  } as S & { verbose: typeof verboseSchema };

  const makeHandler =
    (deprecatedAs?: string) =>
    async (args: ToolArgs<S>): Promise<CallToolResult> => {
      try {
        const { verbose = false } = args;
        const client = getClient();
        const raw = await def.handler(args, client);
        const payload = applyCompaction(def, raw, verbose, args);
        const result = toolResult(payload);
        if (deprecatedAs) {
          result.content.unshift({
            type: "text",
            text: `Note: "${deprecatedAs}" is deprecated and will be removed in 0.5.0. Use "${def.name}".`,
          });
        }
        return result;
      } catch (error) {
        return toolError(error, def.notFoundHint);
      }
    };

  // The SDK types the callback against the concrete shape it infers from
  // `inputSchema`; ToolDef is generic over that shape, so the two cannot be
  // related without re-deriving the SDK's inference. Runtime behaviour is
  // covered by the round-trip tests in __tests__/server.test.ts.
  const handles: RegisteredTool[] = [
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema,
        annotations: { title: def.title, ...def.annotations },
      },
      makeHandler() as never
    ),
  ];

  for (const alias of def.aliases ?? []) {
    handles.push(
      server.registerTool(
        alias,
        {
          title: `${def.title} (deprecated)`,
          description: `Deprecated alias for "${def.name}". ${def.description}`,
          inputSchema,
          annotations: { title: def.title, ...def.annotations },
        },
        makeHandler(alias) as never
      )
    );
  }

  return handles;
}

export function registerTools(server: McpServer, defs: readonly AnyToolDef[]): number {
  const enabled = getEnabledToolsets();
  const dynamic = isDynamicToolsets();
  const byToolset = new Map<Toolset, { name: string; handles: RegisteredTool[] }[]>();
  let count = 0;

  for (const def of defs) {
    const handles = registerTool(server, def, enabled);
    if (handles.length > 0) {
      count += 1;
      if (dynamic) {
        for (const handle of handles) handle.disable();
      }
      const list = byToolset.get(def.toolset) ?? [];
      list.push({ name: def.name, handles });
      byToolset.set(def.toolset, list);
    }
  }

  if (dynamic) {
    server.registerTool(
      "stream_list_toolsets",
      {
        title: "List Stream toolsets",
        description:
          "List available Stream MCP toolsets, the number of tools in each, and whether each toolset is currently enabled.",
        inputSchema: {},
        annotations: {
          title: "List Stream toolsets",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        const toolsets = [...byToolset.entries()].map(([toolset, entries]) => ({
          toolset,
          tool_count: entries.length,
          enabled: entries.every((entry) => entry.handles.every((h) => h.enabled)),
          tools: entries.map((entry) => entry.name),
        }));
        return toolResult({ toolsets });
      }
    );

    server.registerTool(
      "stream_enable_toolset",
      {
        title: "Enable Stream toolsets",
        description:
          "Enable one or more Stream MCP toolsets on demand so their tools appear in tools/list.",
        inputSchema: {
          toolsets: z
            .array(z.enum(ALL_TOOLSETS))
            .min(1)
            .describe("Toolset names to enable, e.g. ['chat', 'moderation']"),
        },
        annotations: {
          title: "Enable Stream toolsets",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: { toolsets: Toolset[] }) => {
        const enabledTools: string[] = [];
        const unavailable: Toolset[] = [];
        for (const toolset of args.toolsets) {
          const entries = byToolset.get(toolset);
          if (!entries) {
            unavailable.push(toolset);
            continue;
          }
          for (const entry of entries) {
            for (const handle of entry.handles) handle.enable();
            enabledTools.push(entry.name);
          }
        }
        if (server.isConnected()) {
          server.sendToolListChanged();
        }
        return toolResult({
          enabled_toolsets: args.toolsets.filter((t) => !unavailable.includes(t)),
          ...(unavailable.length > 0 ? { unavailable_toolsets: unavailable } : {}),
          enabled_tool_count: enabledTools.length,
          enabled_tools: enabledTools,
        });
      }
    );
  }

  return count;
}
