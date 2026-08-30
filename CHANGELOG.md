# Changelog

## 0.2.0

Full rewrite of the tool layer, plus coverage of the rest of Stream's server-side API. **29 → 118 tools.**

### Fixed

- **`video_start_recording` / `video_stop_recording` could never succeed with their defaults.** `recording_type` is a path segment restricted to `composite | individual | raw`; both tools defaulted to `audio_and_video` and accepted any string. Now an enum defaulting to `composite`.
- **`chat_create_channel` silently discarded `name`.** Stream's `ChannelInput` has no `name` field — display names live under `data.custom`. Added a `custom` parameter as well.
- **`chat_create_channel` sent `members: []` for distinct channels.** A distinct channel is keyed by its members; the tool now requires at least two when `id` is omitted.
- **Every Stream error rendered as `Stream API Error (unknown)`.** The SDK's `StreamError` exposes `code` and `metadata.{responseCode,rateLimit,clientRequestId}`, never `status`. Errors now carry the HTTP status, the Stream code, a remediation hint, rate-limit headroom and the request id.
- **`video_mute_users` muted nothing** when called with only `user_ids` — the API needs an explicit track flag. `audio` now defaults to `true`, and the tool rejects a call with neither `user_ids` nor `mute_all_users`.
- **Documented limits and defaults were not implemented.** All caps (`limit`, `offset`, batch sizes) are enforced in the schema, and every documented default is applied.
- **`direction` accepted any number.** Now `1 | -1`.
- **3s request timeout.** The SDK default was used unchanged; now 15s, configurable via `STREAM_TIMEOUT_MS`.
- **No signal handling.** `SIGINT`/`SIGTERM` close the server; unhandled rejections and uncaught exceptions are logged to stderr with a non-zero exit.
- Server version is read from `package.json` instead of being hardcoded.
- Claude Desktop config paths in the README and docs were wrong on every platform.

### Added

- 89 new tools, including the previously impossible: reading messages (`chat_get_channel`, `chat_get_message`, `chat_get_replies`), searching chat (`chat_search_messages`), minting call-scoped tokens (`auth_create_call_token`), and taking a livestream live (`video_go_live`).
- Reactions, threads, read state, channel/call types, participants, closed captions, HLS and RTMP broadcasting, review queue, blocklists, app settings and rate limits.
- Cursor pagination (`next` / `prev`) on every paginated tool.
- `STREAM_MCP_TOOLSETS` and `STREAM_MCP_READ_ONLY` to control the registered surface.
- Tool `title` and `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can distinguish a query from a hard delete.
- Response compaction with a `verbose` escape and a byte cap.
- eslint, prettier, a generated tool reference, and an stdio smoke test in CI.

### Changed (breaking)

- `chat_ban_user` → `moderation_ban_user`
- `chat_unban_user` → `moderation_unban_user`
- `chat_flag_message` → `moderation_flag_message`
- `chat_update_channel_partial` → `chat_update_channel_data`
- `chat_update_channel` now manages members and roles only; channel data moved to `chat_update_channel_data`.

The old names keep working as deprecated aliases and will be removed in 0.3.0. `chat_upsert_users`, `chat_query_users` and `chat_create_token` keep their names and gain `users_*` / `auth_*` aliases.

- Minimum Node is now **22.12** (`@stream-io/node-sdk` 0.8). Dependencies moved to `@stream-io/node-sdk` ^0.8, `@modelcontextprotocol/sdk` ^1.30, `zod` ^4.

## 0.1.0

Initial release — 29 tools for Stream Chat and Video.
