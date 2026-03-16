# Configuration

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STREAM_API_KEY` | Yes | Stream application API key |
| `STREAM_API_SECRET` | Yes | Stream application API secret |

Both are available from your [Stream Dashboard](https://dashboard.getstream.io).

## Claude Desktop

Edit `~/.claude/claude_desktop_config.json`:

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

## Claude Code

Add to your MCP settings:

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

## Running Standalone

For testing or development:

```bash
# Set env vars
export STREAM_API_KEY=your-key
export STREAM_API_SECRET=your-secret

# Run the server
npm start
```

The server communicates over stdio using the MCP protocol.

## Development

```bash
npm run dev          # Watch mode — recompiles on changes
npm test             # Unit tests (mocked, fast)
npm run test:live    # Integration tests (real API, needs env vars)
```
