# Unofficial Stream.io MCP Server

An [MCP](https://modelcontextprotocol.io) server that gives an AI assistant deterministic, typed access to the [Stream.io](https://getstream.io) Chat, Video, Users, Moderation and App APIs.

**200 tools**, 7 MCP resources/templates, and 4 operational MCP prompts — every one explicitly schema-checked against Stream's server-side API. No generic HTTP escape hatch.

> Unofficial and not affiliated with Stream.

## Install

```bash
npx unofficial-streamio-mcp-server
```

Requires **Node 22.12+** at runtime (`@stream-io/node-sdk` 0.8 dropped older versions). Development needs **22.13+**, because ESLint 10 does not support 22.12.

## Configure

Get an API key and secret from the [Stream dashboard](https://dashboard.getstream.io).

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows:

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

**Claude Code** — add the same block to `.mcp.json` in your project, or run:

```bash
claude mcp add stream-io -e STREAM_API_KEY=... -e STREAM_API_SECRET=... -- npx -y unofficial-streamio-mcp-server
```

### Environment variables

| Variable                        | Default | Purpose                                                                                                    |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `STREAM_API_KEY`                | —       | **Required.** Stream app key.                                                                              |
| `STREAM_API_SECRET`             | —       | **Required.** Stream app secret. Grants full admin access to the app.                                      |
| `STREAM_MCP_TOOLSETS`           | `all`   | Comma-separated subset of `chat`, `chat-admin`, `video`, `video-admin`, `moderation`, `users`, `app`.      |
| `STREAM_MCP_READ_ONLY`          | `false` | Register only tools annotated read-only.                                                                   |
| `STREAM_MCP_DYNAMIC_TOOLSETS`   | `false` | Start with 2 discovery meta-tools (`stream_list_toolsets`, `stream_enable_toolset`) for on-demand loading. |
| `STREAM_TIMEOUT_MS`             | `15000` | Request timeout.                                                                                           |
| `STREAM_MCP_MAX_RESPONSE_BYTES` | `30000` | Cap on a single tool result.                                                                               |
| `STREAM_BASE_URL`               | —       | Override the Stream API base URL.                                                                          |

The server starts and lists its tools without credentials, so tool discovery works before setup; individual calls then fail with a clear message.

### Keeping the tool surface small

Three knobs keep context token usage low when your session only needs part of the API:

```jsonc
// Only chat + users — 80 tools
"env": { "STREAM_MCP_TOOLSETS": "chat,users" }

// Read-only: 73 tools, nothing that writes. Recommended for production apps.
"env": { "STREAM_MCP_READ_ONLY": "true" }

// Dynamic toolsets: starts with 2 meta-tools and enables toolsets on demand
"env": { "STREAM_MCP_DYNAMIC_TOOLSETS": "true" }
```

## Safety

The API secret is an **admin credential** for the entire Stream app. This server exposes tools that permanently delete channels, hard-delete messages, ban users, end calls and rewrite app settings.

- Point it at a **development Stream app** unless you specifically need production.
- Use `STREAM_MCP_READ_ONLY=true` against production.
- Destructive tools are annotated `destructiveHint`, so MCP clients that gate on annotations will prompt before running them.

## Tools

| Toolset       | Tools | Covers                                                                                             |
| ------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `chat`        | 54    | Channels, messages, threads, reactions, search, read state, polls, reminders, drafts               |
| `chat-admin`  | 14    | Channel types, exports, slash commands, push templates, batch channel delete                       |
| `users`       | 26    | User CRUD, tokens, guests, blocks, deactivation, push devices, user groups                         |
| `moderation`  | 28    | Bans, mutes, flags, review queue, blocklists, policy checks, configs, rules, appeals               |
| `video`       | 44    | Calls, members, participants, recording, transcription, HLS/RTMP, quality stats, closed captions   |
| `video-admin` | 15    | Call types, SIP inbound trunks, SIP routing rules                                                  |
| `app`         | 19    | App settings, rate limits, async tasks, roles, permissions, push providers, webhooks, ext. storage |

Full per-tool parameter reference (generated from the registry, never hand-edited):

- [docs/chat-tools.md](docs/chat-tools.md) — chat, chat-admin, users, moderation
- [docs/video-tools.md](docs/video-tools.md) — video, video-admin, app

Every tool also accepts `verbose: true` to bypass response compaction and return the raw Stream payload.

## MCP Resources & Prompts

### Resources (`stream://...`)

- `stream://app/settings` — Application-wide settings, webhooks, push config, and defaults
- `stream://app/rate-limits` — Consumed server-side API rate-limit quotas
- `stream://chat/channel-types` and `stream://chat/channel-types/{name}` — Chat channel types and per-type grants/commands
- `stream://video/call-types` and `stream://video/call-types/{name}` — Video call types and per-type recording/permission settings
- `stream://moderation/blocklists` — Configured word blocklists

### Prompts

- `moderation-triage` — Inspect pending review queue items, flags, and logs before proposing moderation actions
- `call-quality-debug` — Diagnose a Stream Video call's quality score, session metrics, timeline events, and call-type config
- `channel-incident-debug` — Audit a Chat channel's state, membership, pinned messages, channel-type grants, and active bans
- `rate-limit-diagnosis` — Check consumed server-side and client-side API rate-limit buckets and suggest mitigations

### Response compaction

Stream responses are large — a `queryChannels` page is mostly channel-type config blobs. By default results are compacted: noisy structural keys (`config`, `own_capabilities`, `grants`, `commands`) are dropped, arrays over 20 items are truncated with a marker, and long strings are trimmed. List-shaped tools go further and project each row to its identity plus the fields you can filter and sort on, so a full page fits the budget instead of losing rows to boilerplate repeated on every row.

If a result still exceeds `STREAM_MCP_MAX_RESPONSE_BYTES`, indentation is dropped before any data is, and only then are list entries shed — the largest number that still fits, disclosed as `_omitted_items`. Pass `verbose: true` when you genuinely need the full payload.

## Not covered

Feeds v3 (`client.feeds`). This package covers Stream's Chat, Video, Users, Moderation and App APIs.

## Development

```bash
npm install
npm run build
npm test           # unit + MCP round-trip tests, no network
npm run smoke      # boots the built server over stdio and validates tools/list
npm run lint
npm run typecheck
npm run docs:tools # regenerate docs/*-tools.md from the registry
```

### Verifying credentials safely

```bash
STREAM_API_KEY=… STREAM_API_SECRET=… npm run probe
```

Calls every read-only tool against your app and reports what works. It writes
nothing and creates nothing, so it is safe against a production app.

### Live tests

`npm run test:live` drives every tool against a real Stream app through a real MCP client. It creates only `mcptest-*` fixtures and tears them down in `afterAll`.

```bash
cp .env.example .env   # fill in a *scratch* app's key and secret
npm run build && npm run test:live
```

Without `STREAM_API_KEY` the live suites skip rather than fail.

### Architecture

See [docs/architecture.md](docs/architecture.md). In short: every tool is a declarative `ToolDef` in `src/tools/registry.ts`; `src/tools/define.ts` wires client lookup, error mapping, compaction and toolset gating once, so tool modules contain nothing but schema and request-building.

## Releasing

Versioning, tagging and publishing are automated with
[release-please](https://github.com/googleapis/release-please) driven by
Conventional Commits, and published to npm with OIDC trusted publishing (no
stored token, automatic provenance).

See [docs/release-engineering.md](docs/release-engineering.md) for the full
framework, including the one-time npmjs.com setup.

## License

MIT
