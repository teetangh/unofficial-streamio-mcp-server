import type {
  CallSettingsResponse,
  LayoutSettingsResponse,
  ListCallTypeResponse,
  NotificationSettingsResponse,
} from "@stream-io/node-sdk";
import { z } from "zod";
import { defined } from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { pick, summarizeRecord } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

/**
 * The shape get/create/update call type all return. Projecting against this
 * structural subset lets the three share one view: each SDK response type is
 * assignable to it, which is the direction `compact`'s parameter requires.
 */
interface CallTypePayload {
  name: string;
  created_at: Date;
  updated_at: Date;
  grants: Record<string, Array<string>>;
  settings: CallSettingsResponse;
  notification_settings: NotificationSettingsResponse;
  external_storage?: string;
}

/**
 * Three copies of the same 55-key `options` map — HLS, RTMP and recording —
 * are 5.7KB of the 13.8KB a call type returns. The keys are presentational
 * (`participant_label.border_radius`, `logo.margin_inline`, …), so only their
 * number survives compaction.
 */
const layoutView = (layout: LayoutSettingsResponse) => ({
  ...pick(layout, ["name", "detect_orientation"]),
  external_app_url: layout.external_app_url || undefined,
  external_css_url: layout.external_css_url || undefined,
  options: summarizeRecord(layout.options),
});

/**
 * Keeps `grants` — the reason to read a call type — and collapses the two
 * blobs that dwarf it. `compact: false` used to be the only way to keep
 * `grants`, since it is one of the shrinker's NOISE_KEYS; naming it explicitly
 * keeps it *and* every behaviour-gating setting at roughly a third of the
 * bytes.
 */
const callTypeView = (raw: CallTypePayload) => {
  const { broadcasting, recording, ingress, ...settings } = raw.settings;
  return {
    ...pick(raw, ["name", "created_at", "updated_at", "external_storage"]),
    grants: raw.grants,
    settings: {
      ...settings,
      broadcasting: {
        enabled: broadcasting.enabled,
        hls: {
          ...pick(broadcasting.hls, ["enabled", "auto_on", "quality_tracks"]),
          layout: layoutView(broadcasting.hls.layout),
        },
        rtmp: {
          ...pick(broadcasting.rtmp, ["enabled", "quality"]),
          layout: layoutView(broadcasting.rtmp.layout),
        },
      },
      recording: {
        ...pick(recording, ["mode", "quality", "audio_only"]),
        layout: layoutView(recording.layout),
      },
      ingress: ingress && {
        enabled: ingress.enabled,
        audio_encoding_options: ingress.audio_encoding_options,
        video_encoding_options: summarizeRecord(ingress.video_encoding_options),
      },
    },
    notification_settings: raw.notification_settings,
    _hint:
      "Permission grants and every behaviour-gating setting are complete. Composite-layout `options` and the ingress encoder ladder are reduced to their size and keys — pass verbose:true for their values.",
  };
};

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
  compact: (raw: ListCallTypeResponse) => ({
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
  description:
    "Get one call type's configuration and its permission grants. Composite-layout styling options and the ingress encoder ladder are summarised rather than listed — pass verbose:true for those values.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { name: z.string().min(1).describe("Call type name, e.g. 'default'") },
  compact: callTypeView,
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
  compact: callTypeView,
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
  compact: callTypeView,
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

export const videoAdminTools: AnyToolDef[] = [
  listCallTypes,
  getCallType,
  createCallType,
  updateCallType,
  deleteCallType,
];
