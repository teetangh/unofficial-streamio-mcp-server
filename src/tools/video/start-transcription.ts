import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StartTranscriptionRequest } from "@stream-io/node-sdk";
import { z } from "zod";
import { getClient } from "../../clients/index.js";
import { toolResult, toolError } from "../../utils/format.js";

const supportedLanguages = [
  "auto", "en", "fr", "es", "de", "it", "nl", "pt", "pl", "ca",
  "cs", "da", "el", "fi", "id", "ja", "ru", "sv", "ta", "th",
  "tr", "hu", "ro", "zh", "ar", "tl", "he", "hi", "hr", "ko",
  "ms", "no", "uk", "bg", "et", "sl", "sk",
] as const;

type TranscriptionLanguage = NonNullable<StartTranscriptionRequest["language"]>;

export function registerStartTranscription(server: McpServer): void {
  server.registerTool(
    "video_start_transcription",
    {
      description:
        "Start transcription on a video/audio call. Supports multiple languages.",
      inputSchema: {
        call_type: z.string().describe("Call type (e.g. 'default')"),
        call_id: z.string().describe("Call ID"),
        language: z
          .enum(supportedLanguages)
          .optional()
          .describe(
            "Transcription language (e.g. 'en', 'fr', 'es', 'auto'). Default: 'auto'"
          ) satisfies z.ZodType<TranscriptionLanguage | undefined>,
        transcription_external_storage: z
          .string()
          .optional()
          .describe("External storage name for the transcription"),
      },
    },
    async ({
      call_type,
      call_id,
      language,
      transcription_external_storage,
    }) => {
      try {
        const client = getClient();
        const response = await client.video.startTranscription({
          type: call_type,
          id: call_id,
          ...(language !== undefined && { language }),
          ...(transcription_external_storage !== undefined && {
            transcription_external_storage,
          }),
        });
        return toolResult(response);
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
