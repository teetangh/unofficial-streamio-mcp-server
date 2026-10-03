import { z } from "zod";
import { defined, limit } from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const pushProviderEnum = z
  .enum(["apn", "firebase", "huawei", "xiaomi"])
  .describe("Push notification provider type");

const listDevices = defineTool({
  name: "users_list_devices",
  title: "List user devices",
  toolset: "users",
  description:
    "List all push notification devices registered for a user, including device tokens and push providers.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    user_id: z.string().min(1).describe("User ID whose registered devices to list"),
  },
  handler: async (args, client) => client.listDevices({ user_id: args.user_id }),
});

const createDevice = defineTool({
  name: "users_create_device",
  title: "Register user device",
  toolset: "users",
  description:
    "Register a push notification device token for a user with an APN, Firebase, Huawei, or Xiaomi push provider.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("Device push token or unique device identifier"),
    push_provider: pushProviderEnum,
    user_id: z.string().min(1).describe("User ID to register the device for"),
    push_provider_name: z
      .string()
      .optional()
      .describe("Named push provider configuration on the app"),
    voip_token: z
      .boolean()
      .optional()
      .describe("Whether the token is for Apple VoIP push notifications"),
  },
  handler: async (args, client) =>
    client.createDevice(
      defined({
        id: args.id,
        push_provider: args.push_provider,
        user_id: args.user_id,
        push_provider_name: args.push_provider_name,
        voip_token: args.voip_token,
      })
    ),
});

const deleteDevice = defineTool({
  name: "users_delete_device",
  title: "Delete user device",
  toolset: "users",
  description:
    "Remove a registered push notification device token from a user so it no longer receives pushes.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("Device push token or device ID to remove"),
    user_id: z.string().min(1).describe("User ID who owns the device"),
  },
  handler: async (args, client) => client.deleteDevice({ id: args.id, user_id: args.user_id }),
});

const listUserGroups = defineTool({
  name: "users_list_groups",
  title: "List user groups",
  toolset: "users",
  description:
    "List user groups in the application with cursor pagination and optional team scoping.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {
    limit: limit(100, 25),
    id_gt: z.string().optional().describe("Cursor: return groups with ID greater than this value"),
    team_id: z.string().optional().describe("Team ID to scope the user groups query"),
  },
  handler: async (args, client) =>
    client.listUserGroups(
      defined({
        limit: args.limit ?? 25,
        id_gt: args.id_gt,
        team_id: args.team_id,
      })
    ),
});

const getUserGroup = defineTool({
  name: "users_get_group",
  title: "Get user group",
  toolset: "users",
  description: "Retrieve a user group by ID, including its name, description, and current members.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("User group ID"),
    team_id: z.string().optional().describe("Team ID when the group is scoped to a team"),
  },
  handler: async (args, client) =>
    client.getUserGroup(
      defined({
        id: args.id,
        team_id: args.team_id,
      })
    ),
});

const createUserGroup = defineTool({
  name: "users_create_group",
  title: "Create user group",
  toolset: "users",
  description:
    "Create a new user group with an optional custom ID, description, team scope, and initial member IDs.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Human-readable name of the user group"),
    id: z.string().optional().describe("Custom group ID (a UUID is generated if omitted)"),
    description: z.string().optional().describe("Description of the user group"),
    member_ids: z
      .array(z.string().min(1))
      .optional()
      .describe("Initial user IDs to add as group members"),
    team_id: z.string().optional().describe("Team ID to scope the group to a team"),
  },
  handler: async (args, client) =>
    client.createUserGroup(
      defined({
        name: args.name,
        id: args.id,
        description: args.description,
        member_ids: args.member_ids,
        team_id: args.team_id,
      })
    ),
});

const updateUserGroup = defineTool({
  name: "users_update_group",
  title: "Update user group",
  toolset: "users",
  description:
    "Update a user group's name or description. At least one of name or description must be provided.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("User group ID to update"),
    name: z.string().optional().describe("New name for the user group"),
    description: z.string().optional().describe("New description for the user group"),
    team_id: z.string().optional().describe("Team ID when the group is scoped to a team"),
  },
  handler: async (args, client) => {
    if (args.name === undefined && args.description === undefined) {
      throw new ToolInputError("Pass `name` or `description` to update the user group.");
    }
    return client.updateUserGroup(
      defined({
        id: args.id,
        name: args.name,
        description: args.description,
        team_id: args.team_id,
      })
    );
  },
});

const deleteUserGroup = defineTool({
  name: "users_delete_group",
  title: "Delete user group",
  toolset: "users",
  description: "Permanently delete a user group by ID, optionally scoped to a specific team.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("User group ID to delete"),
    team_id: z.string().optional().describe("Team ID when the group is scoped to a team"),
  },
  handler: async (args, client) =>
    client.deleteUserGroup(
      defined({
        id: args.id,
        team_id: args.team_id,
      })
    ),
});

const addUserGroupMembers = defineTool({
  name: "users_add_group_members",
  title: "Add user group members",
  toolset: "users",
  description:
    "Add one or more users to a user group, optionally granting them group admin privileges.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("User group ID"),
    member_ids: z.array(z.string().min(1)).min(1).describe("User IDs to add to the group"),
    as_admin: z.boolean().optional().describe("Whether to add the members as group admins"),
    team_id: z.string().optional().describe("Team ID when the group is scoped to a team"),
  },
  handler: async (args, client) =>
    client.addUserGroupMembers(
      defined({
        id: args.id,
        member_ids: args.member_ids,
        as_admin: args.as_admin,
        team_id: args.team_id,
      })
    ),
});

const removeUserGroupMembers = defineTool({
  name: "users_remove_group_members",
  title: "Remove user group members",
  toolset: "users",
  description: "Remove one or more users from a user group by their user IDs.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("User group ID"),
    member_ids: z.array(z.string().min(1)).min(1).describe("User IDs to remove from the group"),
    team_id: z.string().optional().describe("Team ID when the group is scoped to a team"),
  },
  handler: async (args, client) =>
    client.removeUserGroupMembers(
      defined({
        id: args.id,
        member_ids: args.member_ids,
        team_id: args.team_id,
      })
    ),
});

const deactivateUsersBatch = defineTool({
  name: "users_deactivate_batch",
  title: "Deactivate users in batch",
  toolset: "users",
  description:
    "Deactivate multiple users asynchronously in a single batch operation, optionally marking their messages or channels deleted. Returns a task_id to poll with app_get_task.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("User IDs to deactivate (max 100)"),
    mark_messages_deleted: z
      .boolean()
      .optional()
      .describe("Mark messages sent by these users as deleted"),
    mark_channels_deleted: z
      .boolean()
      .optional()
      .describe("Mark channels created by these users as deleted"),
    created_by_id: z.string().optional().describe("ID of the user performing the deactivation"),
  },
  handler: async (args, client) =>
    client.deactivateUsers(
      defined({
        user_ids: args.user_ids,
        mark_messages_deleted: args.mark_messages_deleted,
        mark_channels_deleted: args.mark_channels_deleted,
        created_by_id: args.created_by_id,
      })
    ),
});

const reactivateUsersBatch = defineTool({
  name: "users_reactivate_batch",
  title: "Reactivate users in batch",
  toolset: "users",
  description:
    "Reactivate multiple previously deactivated users asynchronously in a single batch operation, optionally restoring their messages or channels. Returns a task_id to poll with app_get_task.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    user_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("User IDs to reactivate (max 100)"),
    restore_messages: z
      .boolean()
      .optional()
      .describe("Restore messages that were marked deleted on deactivation"),
    restore_channels: z
      .boolean()
      .optional()
      .describe("Restore channels that were marked deleted on deactivation"),
    created_by_id: z.string().optional().describe("ID of the user performing the reactivation"),
  },
  handler: async (args, client) =>
    client.reactivateUsers(
      defined({
        user_ids: args.user_ids,
        restore_messages: args.restore_messages,
        restore_channels: args.restore_channels,
        created_by_id: args.created_by_id,
      })
    ),
});

export const deviceAndGroupTools: AnyToolDef[] = [
  listDevices,
  createDevice,
  deleteDevice,
  listUserGroups,
  getUserGroup,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  addUserGroupMembers,
  removeUserGroupMembers,
  deactivateUsersBatch,
  reactivateUsersBatch,
];
