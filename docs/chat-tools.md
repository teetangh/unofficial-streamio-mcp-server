# Chat Tools Reference

13 tools for managing Stream.io Chat — users, channels, messages, and moderation.

## Authentication

### chat_create_token

Generate a user authentication token (JWT).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | Yes | User ID to generate token for |
| `validity_in_seconds` | number | No | Token validity (default: 3600) |

## Users

### chat_upsert_users

Create or update users in batch (up to 100).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `users` | array | Yes | Array of user objects |
| `users[].id` | string | Yes | Unique user ID |
| `users[].name` | string | No | Display name |
| `users[].role` | string | No | Role (e.g. `admin`, `user`) |
| `users[].image` | string | No | Avatar URL |
| `users[].custom` | object | No | Custom fields |

### chat_query_users

Query users with filters and sorting.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter_conditions` | object | No | Stream filter syntax |
| `sort` | array | No | Sort params `[{field, direction}]` |
| `limit` | number | No | Max results (default: 10, max: 100) |

**Filter examples:**
- `{id: {$in: ["user1", "user2"]}}` — specific users
- `{role: "admin"}` — by role
- `{name: {$autocomplete: "john"}}` — autocomplete search

## Channels

### chat_create_channel

Create or get a chat channel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Channel type (`messaging`, `livestream`, `team`, `commerce`, `gaming`) |
| `id` | string | No | Channel ID (auto-generated if omitted) |
| `name` | string | No | Display name |
| `created_by_id` | string | Yes | Creator user ID |
| `members` | string[] | No | Initial member user IDs |

### chat_update_channel

Partially update a channel's metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel_type` | string | Yes | Channel type |
| `channel_id` | string | Yes | Channel ID |
| `set` | object | No | Fields to set (e.g. `{name: "New Name"}`) |
| `unset` | string[] | No | Fields to remove (e.g. `["description"]`) |

### chat_query_channels

Query channels with filters and sorting.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter_conditions` | object | No | Stream filter syntax |
| `sort` | array | No | Sort params `[{field, direction}]` |
| `limit` | number | No | Max results (default: 10, max: 30) |

### chat_add_members

Add members to a channel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel_type` | string | Yes | Channel type |
| `channel_id` | string | Yes | Channel ID |
| `member_ids` | string[] | Yes | User IDs to add |

### chat_remove_members

Remove members from a channel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel_type` | string | Yes | Channel type |
| `channel_id` | string | Yes | Channel ID |
| `member_ids` | string[] | Yes | User IDs to remove |

## Messages

### chat_send_message

Send a message to a channel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel_type` | string | Yes | Channel type |
| `channel_id` | string | Yes | Channel ID |
| `text` | string | Yes | Message text |
| `user_id` | string | Yes | Sender user ID |

### chat_delete_message

Delete a message.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | Yes | Message ID |
| `hard` | boolean | No | Permanently remove (default: soft delete) |

## Moderation

### chat_ban_user

Ban a user globally or from a channel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_user_id` | string | Yes | User to ban |
| `banned_by_id` | string | No | Moderator user ID |
| `channel_cid` | string | No | Channel CID for channel ban (e.g. `messaging:general`) |
| `reason` | string | No | Ban reason |
| `timeout` | number | No | Duration in minutes (omit for permanent) |
| `ip_ban` | boolean | No | Also ban user's IP |
| `shadow` | boolean | No | Shadow ban (user can post but invisible to others) |

### chat_unban_user

Unban a user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_user_id` | string | Yes | User to unban |
| `channel_cid` | string | No | Channel CID (omit for global unban) |
| `unbanned_by_id` | string | No | Moderator user ID |

### chat_flag_message

Flag a message for moderation review.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | Yes | Message ID to flag |
| `reason` | string | No | Reason for flagging |
| `user_id` | string | No | User performing the flag |
