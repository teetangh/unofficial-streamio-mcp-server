# Unofficial Stream.io MCP Server

An MCP (Model Context Protocol) server that exposes [Stream.io](https://getstream.io) Chat and Video APIs as tools for LLMs like Claude.

## Available Tools (29)

### Chat Tools (13)

| Tool | Description |
|------|-------------|
| `chat_create_token` | Generate a user authentication token (JWT) |
| `chat_upsert_users` | Create or update users (batch, up to 100) |
| `chat_create_channel` | Create or get a chat channel |
| `chat_update_channel` | Partially update channel metadata |
| `chat_send_message` | Send a message to a channel |
| `chat_delete_message` | Delete a message (soft or hard) |
| `chat_query_channels` | Query channels with filters and sorting |
| `chat_query_users` | Query users with filters and sorting |
| `chat_add_members` | Add members to a channel |
| `chat_remove_members` | Remove members from a channel |
| `chat_ban_user` | Ban a user (global, channel, shadow, timed) |
| `chat_unban_user` | Unban a user |
| `chat_flag_message` | Flag a message for moderation |

### Video Tools (16)

| Tool | Description |
|------|-------------|
| `video_create_call` | Create a video/audio call |
| `video_get_call` | Get call details and state |
| `video_update_call` | Update call settings or custom data |
| `video_end_call` | End an active call |
| `video_query_calls` | Query calls with filters and sorting |
| `video_update_call_members` | Add, update, or remove call members |
| `video_query_call_members` | Query call members with filters |
| `video_start_recording` | Start call recording |
| `video_stop_recording` | Stop call recording |
| `video_list_recordings` | List call recordings |
| `video_start_transcription` | Start live transcription |
| `video_stop_transcription` | Stop transcription |
| `video_list_transcriptions` | List call transcriptions |
| `video_block_user` | Block a user from a call |
| `video_unblock_user` | Unblock a user from a call |
| `video_mute_users` | Mute users' audio/video/screenshare |

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

## Documentation

- [Getting Started](docs/getting-started.md)
- [Chat Tools Reference](docs/chat-tools.md)
- [Video Tools Reference](docs/video-tools.md)
- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)

## Development

```bash
npm run dev          # Watch mode (recompile on changes)
npm test             # Run unit tests
npm run test:live    # Integration tests (real API)
npm run test:watch   # Watch mode for tests
```

## License

MIT
