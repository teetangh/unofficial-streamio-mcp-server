# Getting started

## Requirements

- Node **22.12** or newer
- A Stream app — [dashboard.getstream.io](https://dashboard.getstream.io)

## Fastest path

Add this to your MCP client config (see [configuration.md](configuration.md) for exact file paths):

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

## From source

```bash
git clone https://github.com/teetangh/unofficial-streamio-mcp-server.git
cd unofficial-streamio-mcp-server
npm install
npm run build
```

Point your client at `build/index.js`.

## Verify it works

```bash
npm run smoke
```

Boots the built server over stdio and checks that `tools/list` returns the full registry with valid schemas.

## A first conversation

Stream requires users to exist before they can be used anywhere else, so most flows start there.

> Create two users, `alice` and `bob`, then a messaging channel called "Launch Planning" with both of them, and post a welcome message from alice.

The assistant will call:

1. `chat_upsert_users` — create both users
2. `chat_create_channel` — `type: "messaging"`, `created_by_id: "alice"`, `name: "Launch Planning"`, `members: ["alice", "bob"]`
3. `chat_send_message` — `text`, `user_id: "alice"`

Then:

> What's been said in that channel?

calls `chat_get_channel`, which returns the channel state and its recent messages.

## Video

> Create a call for tomorrow's standup with alice as host, and give bob a token to join it.

1. `video_create_call` — `call_type: "default"`, `created_by_id: "alice"`, `members: [{user_id: "alice", role: "host"}, "bob"]`
2. `auth_create_call_token` — `user_id: "bob"`, `call_cids: ["default:<call-id>"]`

The token is what a client SDK presents to join. Adding someone as a member does not admit them on its own.

## Common errors

| Message                                       | Cause                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Missing STREAM_API_KEY or STREAM_API_SECRET` | Credentials are not reaching the process. Check the `env` block in your MCP client config. |
| `Stream code 16 … does not exist`             | Referencing a user, channel or call that has not been created yet.                         |
| `Stream code 17`                              | The acting user lacks permission, or the channel/call type forbids the action.             |
| `Stream code 4`                               | Input error — the message names the offending field.                                       |

## Next

- [configuration.md](configuration.md) — every environment variable, toolset gating, read-only mode
- [chat-tools.md](chat-tools.md) / [video-tools.md](video-tools.md) — per-tool parameter reference
- [architecture.md](architecture.md) — how the server is put together
