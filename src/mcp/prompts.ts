import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Registers guided multi-step operational prompts for common Stream debugging
 * and moderation workflows.
 */
export function registerPrompts(server: McpServer): void {
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
        status: { $eq: "pending" },
        ...(entity_type ? { entity_type: { $eq: entity_type } } : {}),
      };

      return {
        description: "Guided workflow for triaging Stream moderation queue items and flags.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Run a moderation queue and flag triage workflow:",
                `1. Call \`moderation_query_review_queue\` with \`filter: ${JSON.stringify(filterObj)}\` and \`limit: ${effectiveLimit}\` to retrieve pending items.`,
                "2. Call `moderation_query_flags` (with `filter: { reviewed: false }`) and `moderation_query_logs` to correlate repeat offenders, recent actions, and active blocklists (`stream://moderation/blocklists`).",
                "3. Group findings by severity, recommended action, entity creator, and flag reasons.",
                "4. Propose concrete remediation steps (`moderation_submit_action` or `moderation_ban_user`) and ask for confirmation before executing any destructive action.",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );

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

      return {
        description: `Diagnose quality, session metrics, and configuration for video call ${callCid}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Investigate Stream Video call \`${callCid}\`${session_id ? ` (session \`${session_id}\`)` : ""}:`,
                `1. Call \`video_get_call\` with \`${JSON.stringify({ call_type, call_id })}\` to check call lifecycle state, \`current_session_id\`, settings overrides, and recording/transcription/broadcasting flags.`,
                `2. Call \`video_get_call_report\` with \`${JSON.stringify(reportArgs)}\` to inspect participant counts, publisher/subscriber breakdowns, and user ratings. If the report window has expired, fall back to \`video_query_call_stats\` with \`filter_conditions: ${JSON.stringify({ call_cid: { $eq: callCid } })}\`.`,
                `3. Check call-type configuration via \`video_get_call_type\` (\`{ "name": ${JSON.stringify(call_type)} }\` or resource \`stream://video/call-types/${encodeURIComponent(call_type)}\`) and edge health via \`video_get_edges\`.`,
                "4. Summarize root causes for any quality degradation, connection drops, or permission issues.",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );

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

      return {
        description: `Audit state, access grants, and moderation activity for chat channel ${channelCid}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Audit Stream Chat channel \`${channelCid}\`:`,
                `1. Call \`chat_get_channel\` with \`${JSON.stringify(channelArgs)}\` to inspect channel metadata (\`frozen\`, \`disabled\`, \`member_count\`, \`custom\`) and recent messages.`,
                `2. Call \`chat_query_members\` and \`chat_get_pinned_messages\` with \`${JSON.stringify(channelArgs)}\` to review member roles, channel-level bans, and pinned announcements.`,
                `3. Inspect the channel type's permission grants and automod rules via \`chat_get_channel_type\` (\`{ "name": ${JSON.stringify(channel_type)} }\` or resource \`stream://chat/channel-types/${encodeURIComponent(channel_type)}\`).`,
                `4. Check active bans on this channel via \`moderation_query_banned_users\` with \`filter_conditions: ${JSON.stringify({ channel_cid: { $eq: channelCid } })}\` and recent flags via \`moderation_query_flags\`, then summarize findings before proposing any changes.`,
              ].join("\n"),
            },
          },
        ],
      };
    }
  );

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
                "Diagnose Stream API rate limits and quota consumption:",
                `1. Call \`app_get_rate_limits\` with \`${JSON.stringify(rateLimitArgs)}\` (or read resource \`stream://app/rate-limits\` for consumed server-side quotas).`,
                "2. Inspect `server_side`, `android`, `ios`, `web`, and `unity` buckets, flagging any endpoints where `remaining` is low relative to `limit`, and note any `unmatched_endpoints`.",
                "3. Keep in mind that most Video endpoints report rate limits per-response (`metadata.rateLimit`) rather than in `app_get_rate_limits` (which only tracks `DeleteCall` and `VideoConnect` for Video).",
                "4. Recommend concrete mitigations (batching, cursor pagination, caching, or backoff until the reset window).",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}
