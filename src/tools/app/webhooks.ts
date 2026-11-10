import type { QueryTeamUsageStatsResponse, StreamClient } from "@stream-io/node-sdk";
import { z } from "zod";
import { defined } from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const CHECK_ANNOTATIONS = {
  // Each check publishes a real test message to the target.
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const CHECK_RESULT =
  'Returns status "ok" or "error"; on error, `error` carries the provider\'s message (e.g. InvalidClientTokenId, topic not found). Credentials are never echoed back.';

/**
 * Seen live: with no target, Stream checks the app's saved settings — and on
 * an app with none saved it answers status "ok", a false green. Refuse instead.
 */
async function assertSavedTarget(client: StreamClient, kind: "SQS" | "SNS"): Promise<void> {
  const { app } = await client.getApp();
  const hooks = app.event_hooks ?? [];
  // The legacy app fields and event hooks name the SQS URL differently.
  const saved =
    kind === "SQS"
      ? Boolean(app.sqs_url) || hooks.some((hook) => Boolean(hook.sqs_queue_url))
      : Boolean(app.sns_topic_arn) || hooks.some((hook) => Boolean(hook.sns_topic_arn));
  if (!saved) {
    const field = kind === "SQS" ? "sqs_url" : "sns_topic_arn";
    throw new ToolInputError(
      `No ${kind} target is saved on this app, so there is nothing to check (Stream would report "ok" regardless). Pass \`${field}\` and credentials to test a target.`
    );
  }
}

const checkSqs = defineTool({
  name: "app_check_sqs",
  title: "Check SQS webhook target",
  toolset: "app",
  description: `Test that Stream can publish to an AWS SQS queue by sending it a test message. Pass sqs_url with sqs_key/sqs_secret to test a queue before saving it, or nothing to test the queue saved on the app. ${CHECK_RESULT}`,
  annotations: CHECK_ANNOTATIONS,
  inputSchema: {
    sqs_url: z
      .string()
      .optional()
      .describe("Queue URL, e.g. https://sqs.us-east-1.amazonaws.com/123/queue"),
    sqs_key: z.string().optional().describe("AWS access key ID"),
    sqs_secret: z.string().optional().describe("AWS secret access key"),
  },
  handler: async (args, client) => {
    if (!args.sqs_url) {
      if (args.sqs_key || args.sqs_secret) {
        throw new ToolInputError("Pass `sqs_url` with `sqs_key`/`sqs_secret`.");
      }
      await assertSavedTarget(client, "SQS");
    }
    return client.checkSQS(
      defined({ sqs_url: args.sqs_url, sqs_key: args.sqs_key, sqs_secret: args.sqs_secret })
    );
  },
});

const checkSns = defineTool({
  name: "app_check_sns",
  title: "Check SNS webhook target",
  toolset: "app",
  description: `Test that Stream can publish to an AWS SNS topic by sending it a test message. Pass sns_topic_arn with sns_key/sns_secret to test a topic before saving it, or nothing to test the topic saved on the app. ${CHECK_RESULT}`,
  annotations: CHECK_ANNOTATIONS,
  inputSchema: {
    sns_topic_arn: z
      .string()
      .optional()
      .describe("Topic ARN, e.g. arn:aws:sns:us-east-1:123:topic"),
    sns_key: z.string().optional().describe("AWS access key ID"),
    sns_secret: z.string().optional().describe("AWS secret access key"),
  },
  handler: async (args, client) => {
    if (!args.sns_topic_arn) {
      if (args.sns_key || args.sns_secret) {
        throw new ToolInputError("Pass `sns_topic_arn` with `sns_key`/`sns_secret`.");
      }
      await assertSavedTarget(client, "SNS");
    }
    return client.checkSNS(
      defined({
        sns_topic_arn: args.sns_topic_arn,
        sns_key: args.sns_key,
        sns_secret: args.sns_secret,
      })
    );
  },
});

const checkGcpPubSub = defineTool({
  name: "app_check_gcp_pubsub",
  title: "Check Google Pub/Sub webhook target",
  toolset: "app",
  description: `Test that Stream can publish to a Google Cloud Pub/Sub topic by sending it a test message. ${CHECK_RESULT}`,
  annotations: CHECK_ANNOTATIONS,
  inputSchema: {
    gcp_pubsub_topic: z
      .string()
      .min(1)
      .describe("Fully qualified topic: projects/{project}/topics/{topic}"),
    gcp_pubsub_event_based_ordering_key_enabled: z
      .boolean()
      .optional()
      .describe(
        "Publish with an ordering key through the regional endpoint, as an ordered hook would"
      ),
    gcp_pubsub_region: z
      .string()
      .optional()
      .describe("GCP region for the regional endpoint; required when ordering is enabled"),
  },
  handler: async (args, client) =>
    client.checkGCPPubSub(
      defined({
        gcp_pubsub_topic: args.gcp_pubsub_topic,
        gcp_pubsub_event_based_ordering_key_enabled:
          args.gcp_pubsub_event_based_ordering_key_enabled,
        gcp_pubsub_region: args.gcp_pubsub_region,
      })
    ),
});

const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const queryTeamUsageStats = defineTool({
  name: "app_query_team_usage_stats",
  title: "Query team usage stats",
  toolset: "app",
  description:
    'Chat usage per team (multi-tenant apps): messages, users, engaged users, concurrent connections, translations and image moderations. Pass month for monthly totals, or start_date + end_date for a daily breakdown — not both. Team "" means users with no team.',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: QueryTeamUsageStatsResponse) => bounded({ teams: raw.teams, next: raw.next }),
  inputSchema: {
    month: yearMonth.optional().describe("Month as YYYY-MM, for aggregated monthly values"),
    start_date: isoDate.optional().describe("Range start as YYYY-MM-DD (with end_date)"),
    end_date: isoDate.optional().describe("Range end as YYYY-MM-DD (with start_date)"),
    team: z
      .string()
      .optional()
      .describe('One team ID; "" selects users without a team. Cannot be combined with next.'),
    limit: z.int().min(1).max(30).optional().describe("Teams per page (default 30, max 30)"),
    next: z.string().optional().describe("Cursor from a previous page"),
  },
  handler: async (args, client) => {
    if (args.month && (args.start_date || args.end_date)) {
      throw new ToolInputError("Pass `month` or `start_date`/`end_date`, not both.");
    }
    if (Boolean(args.start_date) !== Boolean(args.end_date)) {
      throw new ToolInputError("Pass `start_date` and `end_date` together.");
    }
    if (args.team !== undefined && args.next) {
      throw new ToolInputError("`team` cannot be combined with `next`.");
    }
    return client.chat.queryTeamUsageStats(
      defined({
        month: args.month,
        start_date: args.start_date,
        end_date: args.end_date,
        team: args.team,
        limit: args.limit,
        next: args.next,
      })
    );
  },
});

export const webhookAndUsageTools: AnyToolDef[] = [
  checkSqs,
  checkSns,
  checkGcpPubSub,
  queryTeamUsageStats,
];
