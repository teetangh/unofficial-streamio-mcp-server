import { z } from "zod";
import { callRef, defined } from "../../schemas/common.js";
import { transcriptionLanguage } from "../../schemas/languages.js";
import { ToolInputError } from "../../utils/errors.js";
import { defineTool, type AnyToolDef } from "../define.js";

/**
 * `recording_type` is a path segment, not a body field:
 *   POST /video/call/{type}/{id}/recordings/{recording_type}/start
 * Stream's OpenAPI restricts it to composite | individual | raw.
 */
const recordingType = z
  .enum(["composite", "individual", "raw"])
  .optional()
  .describe(
    "Recording layout: 'composite' (all participants in one file, the usual choice), 'individual' (one file per participant), 'raw' (unprocessed tracks). Default: composite."
  );

const startRecording = defineTool({
  name: "video_start_recording",
  title: "Start recording",
  toolset: "video",
  description:
    "Start recording a call. The call must have an active session with at least one participant, and its recording mode must not be 'disabled' (set it with video_update_call).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    recording_type: recordingType,
    recording_external_storage: z
      .string()
      .optional()
      .describe("Name of a configured external storage target"),
  },
  handler: async (args, client) =>
    client.video.startRecording({
      type: args.call_type,
      id: args.call_id,
      recording_type: args.recording_type ?? "composite",
      ...defined({ recording_external_storage: args.recording_external_storage }),
    }),
});

const stopRecording = defineTool({
  name: "video_stop_recording",
  title: "Stop recording",
  toolset: "video",
  description:
    "Stop an in-progress recording. `recording_type` must match the type that was started.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    recording_type: recordingType,
  },
  handler: async (args, client) =>
    client.video.stopRecording({
      type: args.call_type,
      id: args.call_id,
      recording_type: args.recording_type ?? "composite",
    }),
});

const listRecordings = defineTool({
  name: "video_list_recordings",
  title: "List recordings",
  toolset: "video",
  description: "List a call's recordings, with their session ids, filenames and download URLs.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef },
  handler: async (args, client) =>
    client.video.listRecordings({ type: args.call_type, id: args.call_id }),
});

const startTranscription = defineTool({
  name: "video_start_transcription",
  title: "Start transcription",
  toolset: "video",
  description:
    "Start transcribing a call. The call must have an active session, and transcription must be enabled on the call type.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    language: transcriptionLanguage,
    enable_closed_captions: z.boolean().optional().describe("Also emit live closed captions"),
    transcription_external_storage: z
      .string()
      .optional()
      .describe("Name of a configured external storage target"),
  },
  handler: async (args, client) =>
    client.video.startTranscription({
      type: args.call_type,
      id: args.call_id,
      language: args.language ?? "auto",
      ...defined({
        enable_closed_captions: args.enable_closed_captions,
        transcription_external_storage: args.transcription_external_storage,
      }),
    }),
});

const stopTranscription = defineTool({
  name: "video_stop_transcription",
  title: "Stop transcription",
  toolset: "video",
  description: "Stop an in-progress transcription.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    stop_closed_captions: z.boolean().optional().describe("Also stop closed captions"),
  },
  handler: async (args, client) =>
    client.video.stopTranscription({
      type: args.call_type,
      id: args.call_id,
      ...defined({ stop_closed_captions: args.stop_closed_captions }),
    }),
});

const listTranscriptions = defineTool({
  name: "video_list_transcriptions",
  title: "List transcriptions",
  toolset: "video",
  description: "List a call's transcriptions, with their session ids, filenames and download URLs.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef },
  handler: async (args, client) =>
    client.video.listTranscriptions({ type: args.call_type, id: args.call_id }),
});

const deleteRecording = defineTool({
  name: "video_delete_recording",
  title: "Delete recording",
  toolset: "video",
  description:
    "Permanently delete one recording. Get `session` and `filename` from video_list_recordings.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    session: z.string().min(1).describe("Call session ID the recording belongs to"),
    filename: z.string().min(1).describe("Recording filename"),
  },
  handler: async (args, client) =>
    client.video.deleteRecording({
      type: args.call_type,
      id: args.call_id,
      session: args.session,
      filename: args.filename,
    }),
});

const deleteTranscription = defineTool({
  name: "video_delete_transcription",
  title: "Delete transcription",
  toolset: "video",
  description:
    "Permanently delete one transcription. Get `session` and `filename` from video_list_transcriptions.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    session: z.string().min(1).describe("Call session ID the transcription belongs to"),
    filename: z.string().min(1).describe("Transcription filename"),
  },
  handler: async (args, client) =>
    client.video.deleteTranscription({
      type: args.call_type,
      id: args.call_id,
      session: args.session,
      filename: args.filename,
    }),
});

const startClosedCaptions = defineTool({
  name: "video_start_closed_captions",
  title: "Start closed captions",
  toolset: "video",
  description: "Start live closed captions on an active call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    language: transcriptionLanguage,
    enable_transcription: z.boolean().optional().describe("Also store a transcription"),
    external_storage: z.string().optional().describe("External storage name"),
  },
  handler: async (args, client) =>
    client.video.startClosedCaptions({
      type: args.call_type,
      id: args.call_id,
      ...defined({
        language: args.language,
        enable_transcription: args.enable_transcription,
        external_storage: args.external_storage,
      }),
    }),
});

const stopClosedCaptions = defineTool({
  name: "video_stop_closed_captions",
  title: "Stop closed captions",
  toolset: "video",
  description: "Stop live closed captions on a call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    stop_transcription: z.boolean().optional().describe("Also stop the transcription"),
  },
  handler: async (args, client) =>
    client.video.stopClosedCaptions({
      type: args.call_type,
      id: args.call_id,
      ...defined({ stop_transcription: args.stop_transcription }),
    }),
});

const startHls = defineTool({
  name: "video_start_hls_broadcasting",
  title: "Start HLS broadcast",
  toolset: "video",
  description:
    "Start HLS broadcasting for a livestream call. The playlist URL appears on the call's `egress.hls` field (see video_get_call).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef },
  handler: async (args, client) =>
    client.video.startHLSBroadcasting({ type: args.call_type, id: args.call_id }),
});

const stopHls = defineTool({
  name: "video_stop_hls_broadcasting",
  title: "Stop HLS broadcast",
  toolset: "video",
  description: "Stop HLS broadcasting for a call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef },
  handler: async (args, client) =>
    client.video.stopHLSBroadcasting({ type: args.call_type, id: args.call_id }),
});

const startRtmp = defineTool({
  name: "video_start_rtmp_broadcasts",
  title: "Start RTMP broadcasts",
  toolset: "video",
  description:
    "Restream a call to external RTMP endpoints such as YouTube Live or Twitch. Each broadcast needs a unique `name` and a `stream_url`.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    broadcasts: z
      .array(
        z.object({
          name: z.string().min(1).describe("Unique name for this broadcast"),
          stream_url: z.string().min(1).describe("RTMP ingest URL of the destination"),
          stream_key: z.string().optional().describe("Stream key for the destination"),
          quality: z
            .enum([
              "360p",
              "480p",
              "720p",
              "1080p",
              "1440p",
              "portrait-360x640",
              "portrait-480x854",
              "portrait-720x1280",
              "portrait-1080x1920",
              "portrait-1440x2560",
            ])
            .optional()
            .describe("Output quality"),
        })
      )
      .min(1)
      .describe("RTMP destinations"),
  },
  handler: async (args, client) => {
    // Each broadcast is addressed by name, so duplicates make
    // video_stop_rtmp_broadcast ambiguous.
    const names = args.broadcasts.map((broadcast) => broadcast.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    if (duplicates.length > 0) {
      throw new ToolInputError(
        `Duplicate broadcast name(s): ${[...new Set(duplicates)].join(", ")}. Each name must be unique — it is how video_stop_rtmp_broadcast identifies a broadcast.`
      );
    }
    return client.video.startRTMPBroadcasts({
      type: args.call_type,
      id: args.call_id,
      broadcasts: args.broadcasts.map((broadcast) => defined({ ...broadcast })),
    });
  },
});

const stopRtmp = defineTool({
  name: "video_stop_rtmp_broadcast",
  title: "Stop one RTMP broadcast",
  toolset: "video",
  description: "Stop a single named RTMP broadcast on a call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    ...callRef,
    name: z.string().min(1).describe("Name the broadcast was started with"),
  },
  handler: async (args, client) =>
    client.video.stopRTMPBroadcast({ type: args.call_type, id: args.call_id, name: args.name }),
});

const stopAllRtmp = defineTool({
  name: "video_stop_all_rtmp_broadcasts",
  title: "Stop all RTMP broadcasts",
  toolset: "video",
  description: "Stop every RTMP broadcast running on a call.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: { ...callRef },
  handler: async (args, client) =>
    client.video.stopAllRTMPBroadcasts({ type: args.call_type, id: args.call_id }),
});

export const mediaTools: AnyToolDef[] = [
  startRecording,
  stopRecording,
  listRecordings,
  startTranscription,
  stopTranscription,
  listTranscriptions,
  deleteRecording,
  deleteTranscription,
  startClosedCaptions,
  stopClosedCaptions,
  startHls,
  stopHls,
  startRtmp,
  stopRtmp,
  stopAllRtmp,
];
