import { z } from "zod";
import { defined } from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { defineTool, type ToolDef } from "../define.js";

const callTypeSettings = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Call settings, e.g. {audio: {mic_default_on: true}, video: {camera_default_on: true}, recording: {mode: 'available'}, backstage: {enabled: false}, transcription: {mode: 'available'}}"
  );

const grants = z
  .record(z.string(), z.array(z.string()))
  .optional()
  .describe(
    "Permission grants keyed by role, e.g. {host: ['join-call','send-audio','send-video'], user: ['join-call']}"
  );

const listCallTypes = defineTool({
  name: "video_list_call_types",
  title: "List call types",
  toolset: "video-admin",
  description:
    "List the app's call types with their headline settings. Returns a summary — use video_get_call_type for one type's full settings and permission grants.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {},
  // The full listing is ~55KB of settings blobs; summarise it instead.
  compact: (raw: { call_types?: Record<string, any> }) => ({
    call_types: Object.values(raw.call_types ?? {}).map((type) => ({
      name: type.name,
      created_at: type.created_at,
      updated_at: type.updated_at,
      roles: Object.keys(type.grants ?? {}),
      recording_mode: type.settings?.recording?.mode,
      transcription_mode: type.settings?.transcription?.mode,
      backstage_enabled: type.settings?.backstage?.enabled,
      broadcasting_enabled: type.settings?.broadcasting?.enabled,
      screensharing_enabled: type.settings?.screensharing?.enabled,
      external_storage: type.external_storage,
    })),
    _hint: "Use video_get_call_type for one type's full settings and grants.",
  }),
  handler: async (_args, client) => client.video.listCallTypes(),
});

const getCallType = defineTool({
  name: "video_get_call_type",
  title: "Get call type",
  toolset: "video-admin",
  description: "Get one call type's full configuration, including its permission grants.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { name: z.string().min(1).describe("Call type name, e.g. 'default'") },
  compact: false,
  handler: async (args, client) => client.video.getCallType({ name: args.name }),
});

const createCallType = defineTool({
  name: "video_create_call_type",
  title: "Create call type",
  toolset: "video-admin",
  description:
    "Create a custom call type. A call type's name is immutable once created, and existing calls keep the type they were created with.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Unique call type name"),
    settings: callTypeSettings,
    grants,
    external_storage: z.string().optional().describe("Default external storage name"),
  },
  compact: false,
  handler: async (args, client) =>
    client.video.createCallType(
      defined({
        name: args.name,
        settings: args.settings,
        grants: args.grants,
        external_storage: args.external_storage,
      })
    ),
});

const updateCallType = defineTool({
  name: "video_update_call_type",
  title: "Update call type",
  toolset: "video-admin",
  description:
    "Update a call type's default settings or permission grants. Applies app-wide to every call of that type.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Call type name"),
    settings: callTypeSettings,
    grants,
    external_storage: z.string().optional().describe("Default external storage name"),
  },
  compact: false,
  handler: async (args, client) => {
    if (
      args.settings === undefined &&
      args.grants === undefined &&
      args.external_storage === undefined
    ) {
      throw new ToolInputError(
        "Nothing to update — pass at least one of settings, grants or external_storage."
      );
    }
    return client.video.updateCallType({
      name: args.name,
      ...defined({
        settings: args.settings,
        grants: args.grants,
        external_storage: args.external_storage,
      }),
    });
  },
});

const deleteCallType = defineTool({
  name: "video_delete_call_type",
  title: "Delete call type",
  toolset: "video-admin",
  description:
    "Delete a custom call type. Fails if calls of that type still exist. Built-in types cannot be deleted.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { name: z.string().min(1).describe("Call type name to delete") },
  handler: async (args, client) => client.video.deleteCallType({ name: args.name }),
});

export const videoAdminTools: ToolDef<any>[] = [
  listCallTypes,
  getCallType,
  createCallType,
  updateCallType,
  deleteCallType,
];
