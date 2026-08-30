# Configuration

## Credentials

Create a Stream app at [dashboard.getstream.io](https://dashboard.getstream.io) and copy its **API key** and **secret**.

The secret is an admin credential for the whole app. Prefer a development app; see [Safety](#safety).

## MCP client setup

### Claude Desktop

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "stream-io": {
      "command": "npx",
      "args": ["-y", "unofficial-streamio-mcp-server"],
      "env": {
        "STREAM_API_KEY": "your-api-key",
        "STREAM_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

Restart Claude Desktop after editing.

### Claude Code

```bash
claude mcp add stream-io \
  -e STREAM_API_KEY=your-api-key \
  -e STREAM_API_SECRET=your-api-secret \
  -- npx -y unofficial-streamio-mcp-server
```

Or commit a `.mcp.json` with the same `mcpServers` block. Use `${STREAM_API_KEY}` interpolation rather than literal secrets in a file you might commit.

### From a local checkout

```json
{
  "mcpServers": {
    "stream-io": {
      "command": "node",
      "args": ["/absolute/path/to/unofficial-streamio-mcp-server/build/index.js"],
      "env": { "STREAM_API_KEY": "…", "STREAM_API_SECRET": "…" }
    }
  }
}
```

## Environment variables

| Variable                        | Default | Purpose                           |
| ------------------------------- | ------- | --------------------------------- |
| `STREAM_API_KEY`                | —       | **Required.** Stream app key.     |
| `STREAM_API_SECRET`             | —       | **Required.** Stream app secret.  |
| `STREAM_MCP_TOOLSETS`           | `all`   | Which tool groups to register.    |
| `STREAM_MCP_READ_ONLY`          | `false` | Register only read-only tools.    |
| `STREAM_TIMEOUT_MS`             | `15000` | Request timeout in milliseconds.  |
| `STREAM_MCP_MAX_RESPONSE_BYTES` | `30000` | Cap on one tool result.           |
| `STREAM_BASE_URL`               | —       | Override the Stream API base URL. |

Invalid values fail fast with a message naming the variable.

## Toolsets

| Toolset       | Tools | Covers                                                               |
| ------------- | ----- | -------------------------------------------------------------------- |
| `chat`        | 35    | Channels, messages, threads, reactions, search, read state           |
| `chat-admin`  | 6     | Channel types, exports                                               |
| `users`       | 14    | User CRUD, tokens, guests, blocks, deactivation                      |
| `moderation`  | 16    | Bans, mutes, flags, review queue, blocklists                         |
| `video`       | 35    | Calls, members, participants, recording, transcription, broadcasting |
| `video-admin` | 8     | Call types, reports, stats, edges                                    |
| `app`         | 4     | App settings, rate limits, async tasks                               |

```json
"env": { "STREAM_MCP_TOOLSETS": "chat,users,moderation" }
```

An unknown name fails at startup rather than being ignored.

## Safety

`STREAM_MCP_READ_ONLY=true` registers only the 38 tools annotated `readOnlyHint` — nothing that writes, deletes, bans or mints a token. Use it whenever the credentials belong to a production app.

Destructive tools carry `destructiveHint: true`, so clients that gate on annotations can prompt before running them.

## Local development

```bash
cp .env.example .env
```

`.env` is read by the test suite (via `dotenv` in `src/__tests__/setup.ts`). The server itself reads only the process environment — MCP clients inject it from their config.
