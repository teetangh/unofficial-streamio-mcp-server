import { z } from "zod";
import { callRef, defined } from "../../schemas/common.js";
import { transcriptionLanguage } from "../../schemas/languages.js";
import { defineTool, type ToolDef } from "../define.js";

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

export const mediaTools: ToolDef<any>[] = [
  startRecording,
  stopRecording,
  listRecordings,
  startTranscription,
  stopTranscription,
  listTranscriptions,
];
