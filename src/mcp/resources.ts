import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { StreamClient } from "@stream-io/node-sdk";
import { getEnabledToolsets, type Toolset } from "../config.js";
import { applyCompaction } from "../tools/define.js";
import { getTool } from "../tools/registry.js";
import { formatErrorMessage, ToolInputError } from "../utils/errors.js";
import { serialize } from "../utils/format.js";

const JSON_MIME_TYPE = "application/json";

function extractTemplateVariable(variables: Variables, key: string): string {
  const raw = variables[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0) {
    throw new ToolInputError(`Missing required URI template variable: ${key}`);
  }
  return decodeURIComponent(value);
}

function isToolResourceEnabled(toolName: string, active: ReadonlySet<Toolset>): boolean {
  const def = getTool(toolName);
  if (!def) return false;
  return active.has(def.toolset);
}

async function readToolResource(
  uri: URL,
  toolName: string,
  getClient: () => StreamClient,
  args: Record<string, unknown> = {}
): Promise<ReadResourceResult> {
  const def = getTool(toolName);
  if (!def) {
    throw new Error(`Tool definition "${toolName}" is not registered.`);
  }
  try {
    const client = getClient();
    const raw = await def.handler(args, client);
    const payload = applyCompaction(def, raw, false, args);
    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: JSON_MIME_TYPE,
          text: serialize(payload),
        },
      ],
    };
  } catch (error) {
    throw new Error(formatErrorMessage(error, def.notFoundHint), { cause: error });
  }
}

/**
 * Registers read-only MCP resources and URI templates backed by the existing
 * tool handlers, compaction projections, and byte-capped serializer.
 */
export function registerResources(server: McpServer, getClient: () => StreamClient): void {
  const active = getEnabledToolsets();

  if (isToolResourceEnabled("app_get_settings", active)) {
    server.registerResource(
      "stream-app-settings",
      "stream://app/settings",
      {
        title: "Stream App Settings",
        description: "Application-wide configuration, webhook hooks, push settings, and defaults",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri) => readToolResource(uri, "app_get_settings", getClient)
    );
  }

  if (isToolResourceEnabled("app_get_rate_limits", active)) {
    server.registerResource(
      "stream-app-rate-limits",
      "stream://app/rate-limits",
      {
        title: "Stream Server-Side Rate Limits",
        description: "Current server-side rate-limit quotas and consumed capacity",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri) => readToolResource(uri, "app_get_rate_limits", getClient)
    );
  }

  if (isToolResourceEnabled("chat_list_channel_types", active)) {
    server.registerResource(
      "stream-chat-channel-types",
      "stream://chat/channel-types",
      {
        title: "Stream Chat Channel Types",
        description: "Summary of all configured Chat channel types and their capabilities",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri) => readToolResource(uri, "chat_list_channel_types", getClient)
    );
  }

  if (isToolResourceEnabled("chat_get_channel_type", active)) {
    server.registerResource(
      "stream-chat-channel-type",
      new ResourceTemplate("stream://chat/channel-types/{name}", { list: undefined }),
      {
        title: "Stream Chat Channel Type",
        description: "Configuration, grants, and commands for a specific Chat channel type",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri, variables) => {
        const name = extractTemplateVariable(variables, "name");
        return readToolResource(uri, "chat_get_channel_type", getClient, { name });
      }
    );
  }

  if (isToolResourceEnabled("video_list_call_types", active)) {
    server.registerResource(
      "stream-video-call-types",
      "stream://video/call-types",
      {
        title: "Stream Video Call Types",
        description: "Summary of all configured Video call types",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri) => readToolResource(uri, "video_list_call_types", getClient)
    );
  }

  if (isToolResourceEnabled("video_get_call_type", active)) {
    server.registerResource(
      "stream-video-call-type",
      new ResourceTemplate("stream://video/call-types/{name}", { list: undefined }),
      {
        title: "Stream Video Call Type",
        description:
          "Settings, recording/transcription modes, and permission grants for a Video call type",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri, variables) => {
        const name = extractTemplateVariable(variables, "name");
        return readToolResource(uri, "video_get_call_type", getClient, { name });
      }
    );
  }

  if (isToolResourceEnabled("moderation_list_blocklists", active)) {
    server.registerResource(
      "stream-moderation-blocklists",
      "stream://moderation/blocklists",
      {
        title: "Stream Moderation Blocklists",
        description: "All built-in and custom word blocklists configured in the app",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri) => readToolResource(uri, "moderation_list_blocklists", getClient)
    );
  }
}
