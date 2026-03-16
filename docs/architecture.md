# Architecture

## Directory Structure

```
src/
  index.ts                       # Entry point — MCP server + stdio transport
  clients/
    stream-client.ts             # Lazy singleton StreamClient facade
    index.ts                     # Re-exports
  tools/
    index.ts                     # registerAllTools() aggregator
    chat/
      index.ts                   # registerChatTools() — 13 tools
      create-token.ts
      upsert-users.ts
      create-channel.ts
      send-message.ts
      query-channels.ts
      query-users.ts
      add-members.ts
      update-channel.ts
      remove-members.ts
      ban-user.ts
      unban-user.ts
      delete-message.ts
      flag-message.ts
    video/
      index.ts                   # registerVideoTools() — 16 tools
      create-call.ts
      get-call.ts
      update-call.ts
      end-call.ts
      query-calls.ts
      start-recording.ts
      stop-recording.ts
      list-recordings.ts
      start-transcription.ts
      stop-transcription.ts
      list-transcriptions.ts
      update-call-members.ts
      query-call-members.ts
      block-user.ts
      unblock-user.ts
      mute-users.ts
  utils/
    errors.ts                    # Stream API error formatting
    format.ts                    # toolResult() / toolError() helpers
```

## Client Facade

`src/clients/stream-client.ts` provides a lazy singleton `StreamClient` from `@stream-io/node-sdk`:

- `getClient()` — initializes on first call, reads `STREAM_API_KEY` and `STREAM_API_SECRET` from env
- `resetClient()` — for testing, clears the singleton
- Single SDK for both chat and video: `client.chat.*`, `client.video.*`, `client.moderation.*`

## Tool Registration

Each tool is a standalone file that calls `server.registerTool()` directly:

```
server.registerTool("tool_name", {
  description: "...",
  inputSchema: { field: z.string().describe("...") },
}, async ({ field }) => {
  try {
    const client = getClient();
    const response = await client.chat.someMethod({ ... });
    return toolResult(response);
  } catch (error) {
    return toolError(error);
  }
});
```

- Zod schemas validate inputs and provide LLM-friendly descriptions
- No wrapper abstraction — direct SDK calls for type safety
- Every handler catches errors and returns `isError: true` with formatted messages

## Error Handling

Three layers:

1. **Zod validation** — MCP SDK validates inputs against schemas before the handler runs
2. **Tool-level try/catch** — each handler catches SDK errors, formats them via `formatErrorMessage()`
3. **Process-level** — top-level catch in `src/index.ts`, logs to stderr

Stream API errors include HTTP status codes and are formatted as `Stream API Error (404): Not Found`.

## Testing

- **Unit tests** (`npm test`) — mock `getClient()` with `vi.hoisted()` + `vi.mock()`, never hit real API
- **Integration tests** (`npm run test:live`) — hit real Stream API, need `STREAM_API_KEY` and `STREAM_API_SECRET`
- Tests access tool handlers via `server["_registeredTools"]["tool_name"]`
