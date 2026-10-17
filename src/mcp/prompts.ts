import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getEnabledToolsets, isDynamicToolsets, type Toolset } from "../config.js";
import { isRegistrable } from "../tools/define.js";
import { getTool } from "../tools/registry.js";

/**
 * What one server configuration exposes, as seen by a prompt. Prompts are
 * registered unconditionally by MCP, so without this a prompt would tell the
 * model to call tools that read-only mode, STREAM_MCP_TOOLSETS or dynamic
 * toolsets keep out of tools/list.
 */
interface Exposure {
  /** The tool is (or, in dynamic mode, can be made) callable. */
  has(tool: string): boolean;
  /** The resource backed by this tool is registered. */
  hasResource(tool: string): boolean;
  /**
   * Leading lines: which toolsets to enable first (dynamic mode), and which
   * toolsets are switched off, so a shortened workflow says why.
   */
  preamble(tools: readonly string[]): string[];
}

function exposure(): Exposure {
  const enabled = getEnabledToolsets();
  const dynamic = isDynamicToolsets();
  const def = (tool: string) => {
    const found = getTool(tool);
    if (!found) throw new Error(`Prompt references unknown tool "${tool}".`);
    return found;
  };
  const has = (tool: string) => isRegistrable(def(tool), enabled);

  return {
    has,
    // Resources follow the toolset only: they are read-only and are not
    // disabled by dynamic toolsets (see registerResources).
    hasResource: (tool) => enabled.has(def(tool).toolset),
    preamble(tools) {
      const toolsetsOf = (subset: readonly string[]) => [
        ...new Set(subset.map((tool) => def(tool).toolset)),
      ];
      const lines: string[] = [];
      const off = toolsetsOf(tools.filter((tool) => !enabled.has(def(tool).toolset)));
      if (off.length > 0) {
        lines.push(
          `Note: the ${off.map((t) => `\`${t}\``).join(", ")} toolset${off.length > 1 ? "s are" : " is"} not enabled on this server (STREAM_MCP_TOOLSETS), so the steps that need ${off.length > 1 ? "them" : "it"} are left out.`
        );
      }
      const toEnable: Toolset[] = dynamic ? toolsetsOf(tools.filter(has)) : [];
      if (toEnable.length > 0) {
        lines.push(
          `This server loads toolsets on demand. First call \`stream_enable_toolset\` with \`${JSON.stringify({ toolsets: toEnable })}\`.`
        );
      }
      return lines;
    },
  };
}

/** Numbers the steps that survived the availability filter. */
function steps(...entries: (string | false)[]): string[] {
  return entries
    .filter((entry): entry is string => entry !== false)
    .map((entry, index) => `${index + 1}. ${entry}`);
}

function code(value: unknown): string {
  return `\`${JSON.stringify(value)}\``;
}

const MODERATION_TRIAGE_TOOLS = [
  "moderation_query_review_queue",
  "moderation_query_flags",
  "moderation_query_logs",
  "moderation_submit_action",
  "moderation_ban_user",
] as const;

const CALL_QUALITY_TOOLS = [
  "video_get_call",
  "video_get_call_report",
  "video_query_call_stats",
  "video_get_call_type",
  "video_get_edges",
] as const;

const CHANNEL_INCIDENT_TOOLS = [
  "chat_get_channel",
  "chat_query_members",
  "chat_get_pinned_messages",
  "chat_get_channel_type",
  "moderation_query_banned_users",
  "moderation_query_flags",
] as const;

const RATE_LIMIT_TOOLS = ["app_get_rate_limits"] as const;

/**
 * Registers guided multi-step operational prompts for common Stream debugging
 * and moderation workflows. Each prompt's steps are filtered to the tools this
 * server exposes; a prompt none of whose tools are exposed is not registered.
 */
export function registerPrompts(server: McpServer): void {
  const x = exposure();

  if (MODERATION_TRIAGE_TOOLS.some(x.has)) {
    server.registerPrompt(
      "moderation-triage",
      {
        title: "Moderation Queue & Flag Triage",
        description:
          "Guided workflow to inspect pending review queue items, check recent flags/appeals, and submit moderation actions.",
        argsSchema: {
          entity_type: z
            .string()
            .optional()
            .describe("Optional entity type filter, e.g. stream:chat:v1:message"),
          limit: z.string().optional().describe("Max queue items to inspect (default: 20)"),
        },
      },
      ({ entity_type, limit }) => {
        const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;
        const effectiveLimit =
          Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
        const filterObj: Record<string, unknown> = {
          // Items Stream has flagged sit at "flagged", not "pending" — filtering
          // on "pending" alone returned an empty queue on an app with 8 open items.
          status: { $in: ["pending", "flagged"] },
          ...(entity_type ? { entity_type: { $eq: entity_type } } : {}),
        };
        const canAct = x.has("moderation_submit_action") && x.has("moderation_ban_user");
        const correlate = [
          x.has("moderation_query_flags") &&
            "`moderation_query_flags` (with `filter: { reviewed: false }`)",
          x.has("moderation_query_logs") && "`moderation_query_logs`",
        ].filter(Boolean);

        return {
          description: "Guided workflow for triaging Stream moderation queue items and flags.",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  ...x.preamble(MODERATION_TRIAGE_TOOLS),
                  "Run a moderation queue and flag triage workflow:",
                  ...steps(
                    x.has("moderation_query_review_queue") &&
                      `Call \`moderation_query_review_queue\` with \`filter: ${JSON.stringify(filterObj)}\` and \`limit: ${effectiveLimit}\` to retrieve pending items.`,
                    correlate.length > 0 &&
                      `Call ${correlate.join(" and ")} to correlate repeat offenders and recent actions${x.hasResource("moderation_list_blocklists") ? ", and check active blocklists (`stream://moderation/blocklists`)" : ""}.`,
                    "Group findings by severity, recommended action, entity creator, and flag reasons.",
                    canAct
                      ? "Propose concrete remediation steps (`moderation_submit_action` or `moderation_ban_user`) and ask for confirmation before executing any destructive action."
                      : "Propose concrete remediation steps for an operator to carry out. This server cannot take moderation actions (it is read-only or the write tools are not enabled), so do not attempt them."
                  ),
                ].join("\n"),
              },
            },
          ],
        };
      }
    );
  }

  if (CALL_QUALITY_TOOLS.some(x.has)) {
    server.registerPrompt(
      "call-quality-debug",
      {
        title: "Video Call Quality & Session Debugger",
        description:
          "Diagnose a Stream Video call's quality score, participant session metrics, timeline events, and user feedback.",
        argsSchema: {
          call_type: z.string().describe("Call type, e.g. default"),
          call_id: z.string().describe("Call ID to investigate"),
          session_id: z.string().optional().describe("Optional specific session ID"),
        },
      },
      ({ call_type, call_id, session_id }) => {
        const reportArgs = {
          call_type,
          call_id,
          ...(session_id ? { session_id } : {}),
        };
        const callCid = `${call_type}:${call_id}`;
        const statsFallback = x.has("video_query_call_stats")
          ? `\`video_query_call_stats\` with \`filter_conditions: ${JSON.stringify({ call_cid: { $eq: callCid } })}\``
          : undefined;
        const callTypeSources = [
          x.has("video_get_call_type") &&
            `\`video_get_call_type\` (\`{ "name": ${JSON.stringify(call_type)} }\`)`,
          x.hasResource("video_get_call_type") &&
            `resource \`stream://video/call-types/${encodeURIComponent(call_type)}\``,
        ].filter(Boolean);
        const configChecks = [
          callTypeSources.length > 0 &&
            `call-type configuration via ${callTypeSources.join(" or ")}`,
          x.has("video_get_edges") && "edge health via `video_get_edges`",
        ].filter(Boolean);

        return {
          description: `Diagnose quality, session metrics, and configuration for video call ${callCid}.`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  ...x.preamble(CALL_QUALITY_TOOLS),
                  `Investigate Stream Video call \`${callCid}\`${session_id ? ` (session \`${session_id}\`)` : ""}:`,
                  ...steps(
                    x.has("video_get_call") &&
                      `Call \`video_get_call\` with ${code({ call_type, call_id })} to check call lifecycle state, \`current_session_id\`, settings overrides, and recording/transcription/broadcasting flags.`,
                    x.has("video_get_call_report")
                      ? `Call \`video_get_call_report\` with ${code(reportArgs)} to inspect participant counts, publisher/subscriber breakdowns, and user ratings.${statsFallback ? ` If the report window has expired, fall back to ${statsFallback}.` : ""}`
                      : statsFallback !== undefined &&
                          `Call ${statsFallback} to inspect session quality statistics.`,
                    configChecks.length > 0 && `Check ${configChecks.join(" and ")}.`,
                    "Summarize root causes for any quality degradation, connection drops, or permission issues."
                  ),
                ].join("\n"),
              },
            },
          ],
        };
      }
    );
  }

  if (CHANNEL_INCIDENT_TOOLS.some(x.has)) {
    server.registerPrompt(
      "channel-incident-debug",
      {
        title: "Chat Channel Incident & Access Audit",
        description:
          "Inspect a Chat channel's state, membership, pinned messages, channel-type grants, and recent moderation flags.",
        argsSchema: {
          channel_type: z.string().describe("Channel type, e.g. messaging"),
          channel_id: z.string().describe("Channel ID to audit"),
        },
      },
      ({ channel_type, channel_id }) => {
        const channelArgs = { channel_type, channel_id };
        const channelCid = `${channel_type}:${channel_id}`;
        const membership = [
          x.has("chat_query_members") && "`chat_query_members`",
          x.has("chat_get_pinned_messages") && "`chat_get_pinned_messages`",
        ].filter(Boolean);
        const channelTypeSources = [
          x.has("chat_get_channel_type") &&
            `\`chat_get_channel_type\` (\`{ "name": ${JSON.stringify(channel_type)} }\`)`,
          x.hasResource("chat_get_channel_type") &&
            `resource \`stream://chat/channel-types/${encodeURIComponent(channel_type)}\``,
        ].filter(Boolean);
        const moderationChecks = [
          x.has("moderation_query_banned_users") &&
            `active bans on this channel via \`moderation_query_banned_users\` with \`filter_conditions: ${JSON.stringify({ channel_cid: { $eq: channelCid } })}\``,
          x.has("moderation_query_flags") && "recent flags via `moderation_query_flags`",
        ].filter(Boolean);

        return {
          description: `Audit state, access grants, and moderation activity for chat channel ${channelCid}.`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  ...x.preamble(CHANNEL_INCIDENT_TOOLS),
                  `Audit Stream Chat channel \`${channelCid}\`:`,
                  ...steps(
                    x.has("chat_get_channel") &&
                      `Call \`chat_get_channel\` with ${code(channelArgs)} to inspect channel metadata (\`frozen\`, \`disabled\`, \`member_count\`, \`custom\`) and recent messages.`,
                    membership.length > 0 &&
                      `Call ${membership.join(" and ")} with ${code(channelArgs)} to review member roles, channel-level bans, and pinned announcements.`,
                    channelTypeSources.length > 0 &&
                      `Inspect the channel type's permission grants and automod rules via ${channelTypeSources.join(" or ")}.`,
                    moderationChecks.length > 0 && `Check ${moderationChecks.join(" and ")}.`,
                    "Summarize findings before proposing any changes."
                  ),
                ].join("\n"),
              },
            },
          ],
        };
      }
    );
  }

  if (RATE_LIMIT_TOOLS.some(x.has)) {
    server.registerPrompt(
      "rate-limit-diagnosis",
      {
        title: "Stream API Rate Limit & Quota Diagnosis",
        description:
          "Check consumed server-side and client-side API rate limits and identify endpoints approaching exhaustion.",
        argsSchema: {
          endpoints: z
            .string()
            .optional()
            .describe("Optional comma-separated endpoint names to inspect"),
        },
      },
      ({ endpoints }) => {
        const rateLimitArgs = {
          server_side: true,
          ...(endpoints ? { endpoints } : {}),
        };

        return {
          description: "Inspect Stream API rate-limit quotas and identify bottlenecks.",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  ...x.preamble(RATE_LIMIT_TOOLS),
                  "Diagnose Stream API rate limits and quota consumption:",
                  ...steps(
                    `Call \`app_get_rate_limits\` with ${code(rateLimitArgs)} (or read resource \`stream://app/rate-limits\` for consumed server-side quotas).`,
                    "Inspect `server_side`, `android`, `ios`, `web`, and `unity` buckets, flagging any endpoints where `remaining` is low relative to `limit`, and note any `unmatched_endpoints`.",
                    "Keep in mind that most Video endpoints report rate limits per-response (`metadata.rateLimit`) rather than in `app_get_rate_limits` (which only tracks `DeleteCall` and `VideoConnect` for Video).",
                    "Recommend concrete mitigations (batching, cursor pagination, caching, or backoff until the reset window)."
                  ),
                ].join("\n"),
              },
            },
          ],
        };
      }
    );
  }
}
