# Getting Started

## Prerequisites

- **Node.js 18+**
- A [Stream.io](https://getstream.io) account with API key and secret (from your Stream Dashboard)

## Installation

```bash
git clone https://github.com/teetangh/unofficial-streamio-mcp-server.git
cd unofficial-streamio-mcp-server
npm install
npm run build
```

## Configuration

You need two environment variables:

| Variable | Description |
|----------|-------------|
| `STREAM_API_KEY` | Your Stream application API key |
| `STREAM_API_SECRET` | Your Stream application API secret |

### Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

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

### Claude Code

Add to your project's MCP settings or `~/.claude/settings.json`:

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

## Quick Example

Once configured, you can ask Claude to interact with Stream.io:

> "Create a user named Alice and a messaging channel called general, then send a welcome message."

Claude will use the MCP tools:

1. `chat_upsert_users` — creates the user
2. `chat_create_channel` — creates the channel
3. `chat_send_message` — sends the message

## Next Steps

- [Chat Tools Reference](./chat-tools.md) — all 13 chat tools
- [Video Tools Reference](./video-tools.md) — all 16 video tools
- [Configuration Guide](./configuration.md) — advanced setup
- [Architecture](./architecture.md) — how the server works
