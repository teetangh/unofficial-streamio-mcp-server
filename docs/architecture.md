# Architecture

## Layout

```
src/
  index.ts               # stdio entrypoint: transport, signals, fatal handlers
  server.ts              # builds a registered McpServer (shared with tests)
  config.ts              # environment parsing: toolsets, timeouts, caps
  clients/
    stream-client.ts     # lazy StreamClient singleton
  schemas/
    common.ts            # shared zod fragments (channelRef, callRef, sort, limits)
  tools/
    define.ts            # ToolDef type + registerTool: the only place cross-cutting
                         #   behaviour lives (client lookup, errors, compaction, gating)
    registry.ts          # ALL_TOOLS — the flat, introspectable list
    chat/                # channels.ts, messages.ts, admin.ts
    video/               # calls.ts, participants.ts, media.ts, admin.ts
    users/               # users.ts, tokens.ts
    moderation/          # moderation.ts, blocklists.ts
    app/                 # app.ts
  utils/
    errors.ts            # StreamError → actionable text; ToolInputError
    format.ts            # response compaction, byte cap, MCP result wrappers
scripts/
  generate-tool-docs.mjs # docs/*-tools.md from the registry
  smoke.mjs              # boots the built server over stdio, validates tools/list
```

## Tools are data, not functions

A tool is a `ToolDef` object:

```ts
defineTool({
  name: "video_start_recording",
  title: "Start recording",
  toolset: "video",
  description: "…",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  inputSchema: { ...callRef, recording_type: z.enum(["composite", "individual", "raw"]).optional() },
  handler: async (args, client) => client.video.startRecording({ … }),
});
```

`registerTool` in `src/tools/define.ts` is the single place that:

- resolves the `StreamClient` (so handlers never import it),
- injects the `verbose` parameter into every schema,
- converts thrown errors into `isError` tool results via `formatErrorMessage`,
- applies response compaction unless `verbose` or `compact: false`,
- skips tools outside `STREAM_MCP_TOOLSETS`, or non-read-only tools under `STREAM_MCP_READ_ONLY`,
- registers deprecated aliases with a deprecation notice prepended to the result.

The payoff is that a tool module contains only its schema and the request it builds — which is exactly what the tests assert.

## Error handling

Three layers:

1. **Schema** — zod rejects malformed input before the handler runs. The MCP SDK returns the validation failure as a tool error.
2. **Handler** — cross-field rules a per-field schema cannot express (e.g. "a distinct channel needs 2+ members") throw `ToolInputError`.
3. **Transport** — `formatErrorMessage` unpacks the SDK's `StreamError`: HTTP status, Stream error code, a remediation hint for common codes, remaining rate limit and the client request id.

Nothing escapes to the process; `src/index.ts`'s handlers exist for genuinely unexpected failures.

## Response compaction

`shrink()` in `src/utils/format.ts` walks a response and drops keys that are large and rarely actionable (`config`, `own_capabilities`, `grants`, `commands`, `push_notifications`, `thumbnails`), caps arrays at 20 items with an `_omitted_items` marker, and trims strings over 2000 characters. Tools whose payload _is_ one of those blobs (`chat_get_channel_type`) set `compact: false`.

`shrink()` is the fallback, not the plan. Any tool that returns a list has an explicit projection instead — `pick()` keeps the identity and filterable fields of a row, `userRef()` reduces an embedded user to `{id, name}`, `summarizeRecord()` collapses a keyed blob to its size. The generic shrinker cannot express "keep the rows, drop what repeats on every one of them", and a per-row constant like `own_capabilities` is what a 30 KB budget gets spent on otherwise. A projection also receives the call's arguments, so it can keep what the caller explicitly asked for.

Note that `grants` and `commands` are dropped by `shrink()` and cannot be recovered downstream, so a tool whose subject is permission grants (`video_get_call_type`) must name them in its own projection.

`serialize()` then enforces the byte cap in three steps: pretty-printed, minified, and finally the largest prefix of the longest list that fits, found by bisection and disclosed as `_omitted_items`. Indentation is shed before data because it carries none.

Request-side defaults matter as much: `chat_query_channels` sends `message_limit: 0`, because 30 channels × 25 messages is tens of thousands of tokens.

## Testing

- `registry.test.ts` — table checks over `ALL_TOOLS`: unique names, valid prefixes and toolsets, annotations present and consistent, no tool declares `verbose` itself.
- `server.test.ts` — a real `Client` over `InMemoryTransport`. This is the only layer that exercises zod validation, so schema regressions surface here.
- `tools/payloads.test.ts` — every one of the 118 tools is invoked against a recording mock `StreamClient` and asserted against the **exact** payload it should send. A coverage test fails if a new tool has no case.
- `tools/rejections.test.ts` — the cross-field rules, asserting no SDK call is made.
- `tools/compaction.test.ts` — every bespoke `compact` projection, driven through `applyCompaction` so the `verbose` and default-`shrink` branches are covered too.
- `integration/*.live.test.ts` — real Stream API, namespaced `mcptest-*` fixtures, teardown in `afterAll`. Skipped without credentials.

Nothing reads `server["_registeredTools"]` or any other MCP SDK internal.
