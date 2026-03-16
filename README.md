# Unofficial Stream.io MCP Server

An MCP (Model Context Protocol) server that exposes [Stream.io](https://getstream.io) Chat and Video APIs as tools for LLMs like Claude.

## Available Tools

### Chat Tools (7)

| Tool | Description |
|------|-------------|
| `chat_create_token` | Generate a user authentication token (JWT) |
| `chat_upsert_users` | Create or update users (batch, up to 100) |
| `chat_create_channel` | Create or get a chat channel |
| `chat_send_message` | Send a message to a channel |
| `chat_query_channels` | Query channels with filters and sorting |
| `chat_query_users` | Query users with filters and sorting |
| `chat_add_members` | Add members to a channel |

### Video Tools (5)

| Tool | Description |
|------|-------------|
| `video_create_call` | Create a video/audio call |
| `video_get_call` | Get call details and state |
| `video_update_call` | Update call settings or custom data |
| `video_end_call` | End an active call |
| `video_query_calls` | Query calls with filters and sorting |

## Setup

### Prerequisites

- Node.js 18+
- A [Stream.io](https://getstream.io) account with API key and secret

### Install & Build

```bash
npm install
npm run build
```

### Configure in Claude Desktop

Add to your Claude Desktop config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "stream-io": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
      "env": {
        "STREAM_API_KEY": "your-api-key",
        "STREAM_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### Configure in Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "stream-io": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
      "env": {
        "STREAM_API_KEY": "your-api-key",
        "STREAM_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

## Development

```bash
npm run dev          # Watch mode (recompile on changes)
npm test             # Run unit tests
npm run test:watch   # Watch mode for tests
```

## Architecture

```
src/
  index.ts              # Entry point — MCP server + stdio transport
  clients/
    stream-client.ts    # Lazy singleton StreamClient facade
  tools/
    chat/               # Chat domain tools (7)
    video/              # Video domain tools (5)
  utils/
    errors.ts           # Stream API error formatting
    format.ts           # Tool response helpers
```

- Single SDK: `@stream-io/node-sdk` for both Chat and Video APIs
- Each tool is a standalone file using `server.registerTool()` directly
- Zod schemas provide input validation and LLM-friendly descriptions
- Error handling: every tool catches errors and returns `isError: true` with formatted messages

## License

MIT
