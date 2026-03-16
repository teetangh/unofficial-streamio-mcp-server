# Video Tools Reference

16 tools for managing Stream.io Video and Audio — calls, members, recording, transcription, and moderation.

## Calls

### video_create_call

Create a video/audio call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | `default`, `livestream`, `audio_room`, or `development` |
| `call_id` | string | Yes | Unique call ID |
| `created_by_id` | string | Yes | Creator user ID |
| `members` | array | No | `[{user_id, role?}]` |
| `custom` | object | No | Custom data |

### video_get_call

Get call details and current state.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |

### video_update_call

Update call settings or custom data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `settings_override` | object | No | Settings to override |
| `custom` | object | No | Custom data |

### video_end_call

End an active call for all participants.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |

### video_query_calls

Query calls with filters and sorting.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter_conditions` | object | No | Stream filter syntax |
| `sort` | array | No | Sort params `[{field, direction}]` |
| `limit` | number | No | Max results (default: 10, max: 25) |

**Filter examples:**
- `{created_by_user_id: "user1"}` — calls by creator
- `{ended_at: {$exists: false}}` — active (not ended) calls

## Members

### video_update_call_members

Add, update, or remove call members.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `update_members` | array | No | `[{user_id, role?}]` to add/update |
| `remove_members` | string[] | No | User IDs to remove |

### video_query_call_members

Query and filter call members.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `filter_conditions` | object | No | Stream filter syntax |
| `sort` | array | No | Sort params |
| `limit` | number | No | Max results (default: 25) |

## Recording

### video_start_recording

Start recording a call. Requires active participants.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `recording_type` | string | No | Default: `audio_and_video` |
| `recording_external_storage` | string | No | External storage name |

### video_stop_recording

Stop an active recording.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `recording_type` | string | No | Default: `audio_and_video` |

### video_list_recordings

List all recordings for a call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |

## Transcription

### video_start_transcription

Start live transcription on a call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `language` | string | No | Language code. Supported: `auto`, `en`, `fr`, `es`, `de`, `it`, `nl`, `pt`, `pl`, `ca`, `cs`, `da`, `el`, `fi`, `id`, `ja`, `ru`, `sv`, `ta`, `th`, `tr`, `hu`, `ro`, `zh`, `ar`, `tl`, `he`, `hi`, `hr`, `ko`, `ms`, `no`, `uk`, `bg`, `et`, `sl`, `sk`. Default: `auto`. |
| `transcription_external_storage` | string | No | External storage name |

### video_stop_transcription

Stop an active transcription.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |

### video_list_transcriptions

List all transcriptions for a call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |

## Moderation

### video_block_user

Block a user from a call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `user_id` | string | Yes | User to block |

### video_unblock_user

Unblock a previously blocked user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `user_id` | string | Yes | User to unblock |

### video_mute_users

Mute users' audio, video, or screenshare.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `call_type` | string | Yes | Call type |
| `call_id` | string | Yes | Call ID |
| `user_ids` | string[] | No | Users to mute (omit if `mute_all_users`) |
| `mute_all_users` | boolean | No | Mute everyone |
| `audio` | boolean | No | Mute audio (default: true) |
| `video` | boolean | No | Mute video |
| `screenshare` | boolean | No | Mute screenshare |
| `muted_by_id` | string | No | Moderator user ID |
