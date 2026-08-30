import type { StartTranscriptionRequest, TranslateMessageRequest } from "@stream-io/node-sdk";
import { z } from "zod";

/**
 * Language codes are validated against explicit lists so a typo fails with a
 * clear schema error instead of an opaque API 400.
 *
 * `satisfies readonly …[]` asserts each list is a *subset* of the SDK's union.
 * That direction is deliberate: if Stream removes a language the build breaks
 * (correctly), but if Stream adds one we simply lag a release rather than
 * failing to compile on an unrelated SDK bump.
 */
type TranscriptionLanguage = NonNullable<StartTranscriptionRequest["language"]>;
type TranslationLanguage = TranslateMessageRequest["language"];

const TRANSCRIPTION_LANGUAGES = [
  "auto",
  "ar",
  "bg",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "fi",
  "fr",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "ms",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "ta",
  "th",
  "tl",
  "tr",
  "uk",
  "zh",
] as const satisfies readonly TranscriptionLanguage[];

const TRANSLATION_LANGUAGES = [
  "af",
  "am",
  "ar",
  "az",
  "bg",
  "bn",
  "bs",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "es-MX",
  "et",
  "fa",
  "fa-AF",
  "fi",
  "fr",
  "fr-CA",
  "ha",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "id",
  "it",
  "ja",
  "ka",
  "ko",
  "lt",
  "lv",
  "ms",
  "nl",
  "no",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "so",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "th",
  "tl",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
  "zh-TW",
] as const satisfies readonly TranslationLanguage[];

export const transcriptionLanguage = z
  .enum(TRANSCRIPTION_LANGUAGES)
  .optional()
  .describe(
    "Spoken language in the call, e.g. 'en', 'es', 'fr', 'hi', 'ja'. Use 'auto' to detect. Default: auto."
  );

export const translationLanguage = z
  .enum(TRANSLATION_LANGUAGES)
  .describe("Target language code, e.g. 'es', 'fr', 'hi', 'zh', 'pt'.");
