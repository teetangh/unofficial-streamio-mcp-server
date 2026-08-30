# Changelog

## 0.2.0

Correctness pass over every tool, plus a rewrite of the tool layer. Audited
against `@stream-io/node-sdk` source (0.7.44 / 0.7.64 / 0.8.3) and Stream's
published OpenAPI specs.

### Fixed

- **`video_start_recording` / `video_stop_recording` could never succeed with their defaults.** `recording_type` is a path segment restricted to `composite | individual | raw`; both tools defaulted to `audio_and_video` and accepted any string. Now an enum defaulting to `composite`.
- **`chat_create_channel` silently discarded `name`.** Stream's `ChannelInput` has no `name` field — display names live under `data.custom`. Added a `custom` parameter as well.
- **`chat_create_channel` sent `members: []` for distinct channels.** A distinct channel is keyed by its members; the tool now requires at least two when `id` is omitted.
- **Every Stream error rendered as `Stream API Error (unknown)`.** The SDK's `StreamError` exposes `code` and `metadata.{responseCode,rateLimit,clientRequestId}`, never `status`. Errors now carry the HTTP status, the Stream code, a remediation hint, rate-limit headroom and the request id.
- **`video_mute_users` muted nothing** when called with only `user_ids` — the API needs an explicit track flag. `audio` now defaults to `true`, and a call with neither `user_ids` nor `mute_all_users` is rejected.
- **Documented limits and defaults were not implemented.** All caps are enforced in the schema, and every documented default is applied by the handler.
- **`direction` accepted any number.** Now `1 | -1`.
- **3s request timeout.** The SDK default was used unchanged; now 15s, configurable via `STREAM_TIMEOUT_MS`, and rejected unless a positive integer.
- **No signal handling.** `SIGINT`/`SIGTERM` close the server; unhandled rejections and uncaught exceptions log to stderr and exit non-zero.
- Server version is read from `package.json` instead of being hardcoded.
- Claude Desktop config paths in the README and docs were wrong on every platform.
- `moderation_unban_user` sent the unbanning moderator as `created_by`, which Stream documents as the moderator who _created_ the ban — it selects which ban to lift, so the wrong one would be lifted when a user had been banned by several people.

### Added

- `STREAM_MCP_TOOLSETS` and `STREAM_MCP_READ_ONLY` to control which tools are registered.
- Tool `title` and `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can distinguish a query from a hard delete.
- Response compaction with a `verbose` escape and a byte cap. Arrays are trimmed from the middle so the newest entries always survive, and tools whose list length the caller already bounded with `limit` are exempt from trimming.
- eslint, prettier, a tool reference generated from the registry and checked in CI, an stdio smoke test, and `npm run probe` for a write-free check against a live app.

### Changed (breaking)

- `chat_ban_user` → `moderation_ban_user`
- `chat_unban_user` → `moderation_unban_user`
- `chat_flag_message` → `moderation_flag_message`
- `chat_update_channel` now manages members and roles only. Partial data updates (`set` / `unset`) moved to **`chat_update_channel_data`**.

`chat_update_channel` is the one rename with no compatibility shim: the name still exists but does something else, so a 0.1.0 call passing `set`/`unset` fails with an error naming `chat_update_channel_data` rather than silently doing nothing. The other three keep working as deprecated aliases until 0.3.0.

- Minimum Node is now **22.12** (`@stream-io/node-sdk` 0.8). Dependencies moved to `@stream-io/node-sdk` ^0.8, `@modelcontextprotocol/sdk` ^1.30, `zod` ^4.

## 0.1.0

Initial release — 29 tools for Stream Chat and Video.
