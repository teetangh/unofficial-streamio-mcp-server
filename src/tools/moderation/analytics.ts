import type {
  PolicyTestRun,
  PolicyTestRunResponse,
  PolicyTestSet,
  PolicyTestSetListResponse,
  PolicyTestSetResponse,
} from "@stream-io/node-sdk";
import { z } from "zod";
import { defined } from "../../schemas/common.js";
import { ToolInputError } from "../../utils/errors.js";
import { bounded, pick } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const RUN_KEYS = [
  "id",
  "set_id",
  "status",
  "config_key",
  "config_updated_at",
  "rows_total",
  "rows_completed",
  "metrics",
  "error_message",
  "created_at",
  "started_at",
  "completed_at",
] as const;

const SET_KEYS = [
  "id",
  "name",
  "mode",
  "config_key",
  "team",
  "row_count",
  "created_at",
  "updated_at",
] as const;

const runSummary = (run: PolicyTestRun | undefined) => (run ? pick(run, RUN_KEYS) : undefined);

const setSummary = (set: PolicyTestSet) => ({
  ...pick(set, SET_KEYS),
  last_run: runSummary(set.last_run),
});

const TERMINAL = "Terminal statuses are completed, error and cancelled";

const policyTestRow = z.object({
  text: z.string().min(1).max(20_000).describe("Content to run through the policy"),
  labels: z
    .array(z.string().min(1))
    .optional()
    .describe("Expected labels. Rows with neither labels nor recommended_action are unscored."),
  recommended_action: z.string().optional().describe("Expected action, e.g. keep, flag, remove"),
  policy: z
    .string()
    .optional()
    .describe("Config key the row originally ran under, used on replay when config_key is empty"),
  content_type: z
    .string()
    .optional()
    .describe("Set to 'username' to use the username classification path in labels mode"),
});

const getFlagCount = defineTool({
  name: "moderation_get_flag_count",
  title: "Get flag count for a user",
  toolset: "moderation",
  description:
    "Count how many flags a user's content has received, optionally for one entity type. A quick repeat-offender check before moderation_query_flags; returns 0 for users with no flags.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    entity_creator_id: z.string().min(1).describe("User ID whose content was flagged"),
    entity_type: z
      .string()
      .optional()
      .describe("Entity type filter, e.g. stream:chat:v1:message or stream:user"),
  },
  handler: async (args, client) =>
    client.moderation.getFlagCount(
      defined({ entity_creator_id: args.entity_creator_id, entity_type: args.entity_type })
    ),
});

const listPolicyTestSets = defineTool({
  name: "moderation_list_policy_test_sets",
  title: "List policy test sets",
  toolset: "moderation",
  description:
    'List the app\'s moderation policy test sets (Stream "Evaluations"): fixed batches of content re-run through a policy to see how a rule change would decide them. Each set shows its latest run.',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: PolicyTestSetListResponse) => ({
    sets: (raw.sets ?? []).map(setSummary),
    _hint: "Use moderation_get_policy_test_set for a set's rows and run history.",
  }),
  inputSchema: {},
  handler: async (_args, client) => client.moderation.listPolicyTestSets(),
});

const getPolicyTestSet = defineTool({
  name: "moderation_get_policy_test_set",
  title: "Get policy test set",
  toolset: "moderation",
  description:
    "Get a policy test set with its rows, its last 10 runs (newest first) and baseline_run_id — the first completed run, which later runs are scored against.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: PolicyTestSetResponse) =>
    bounded({
      set: raw.set,
      baseline_run_id: raw.baseline_run_id,
      recent_runs: (raw.recent_runs ?? []).map(runSummary),
    }),
  inputSchema: {
    id: z.string().min(1).describe("Policy test set ID"),
  },
  handler: async (args, client) => client.moderation.getPolicyTestSet({ id: args.id }),
});

const createPolicyTestSet = defineTool({
  name: "moderation_create_policy_test_set",
  title: "Create policy test set",
  toolset: "moderation",
  description:
    "Create a policy test set to dry-run a moderation policy before changing it with moderation_upsert_config or moderation_upsert_rule. Pass either rows (your own content with expected labels/actions) or seed (sample up to 1000 recent production items) — exactly one. Set text is frozen, so later runs stay comparable. Run it with moderation_start_policy_test_run.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  compact: (raw: PolicyTestSetResponse) => ({
    set: raw.set ? setSummary(raw.set) : undefined,
  }),
  inputSchema: {
    name: z.string().min(1).describe("Set name, unique within the app"),
    config_key: z
      .string()
      .optional()
      .describe(
        "Moderation config key every row runs against. Omit to replay each row under the policy it originally ran under (seeded sets)."
      ),
    mode: z
      .enum(["check", "labels"])
      .optional()
      .describe(
        "Execution target: check (the moderation check pipeline) or labels (the Labels API). Default: labels when the org has the Labels API enabled, else check. check-mode runs need an AI provider (LLM or Bodyguard) enabled on the policy."
      ),
    team: z.string().optional().describe("Team scope for the config (multi-tenant apps)"),
    rows: z
      .array(policyTestRow)
      .min(1)
      .max(1000)
      .optional()
      .describe("Content to test (max 1000). Mutually exclusive with seed."),
    seed: z
      .object({
        limit: z.int().min(1).max(1000).describe("How many recent items to sample, newest first"),
        labels: z
          .array(z.string().min(1))
          .max(20)
          .optional()
          .describe("Sample only items carrying any of these labels"),
      })
      .optional()
      .describe(
        "Sample production content instead of passing rows. Fails if nothing matches. Mutually exclusive with rows."
      ),
  },
  handler: async (args, client) => {
    if ((args.rows === undefined) === (args.seed === undefined)) {
      throw new ToolInputError("Pass exactly one of `rows` or `seed`.");
    }
    return client.moderation.createPolicyTestSet(
      defined({
        name: args.name,
        config_key: args.config_key,
        mode: args.mode,
        team: args.team,
        rows: args.rows?.map((row) => defined(row)),
        seed: args.seed ? defined(args.seed) : undefined,
      })
    );
  },
});

const deletePolicyTestSet = defineTool({
  name: "moderation_delete_policy_test_set",
  title: "Delete policy test set",
  toolset: "moderation",
  description:
    "Permanently delete a policy test set and all its runs and results. Stream refuses while a run is pending or running.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    id: z.string().min(1).describe("Policy test set ID"),
  },
  handler: async (args, client) => client.moderation.deletePolicyTestSet({ id: args.id }),
});

const startPolicyTestRun = defineTool({
  name: "moderation_start_policy_test_run",
  title: "Start policy test run",
  toolset: "moderation",
  description: `Run a policy test set through its policy's current configuration. Each row is a real moderation call, billed at production rates. Asynchronous: returns a pending run — poll moderation_get_policy_test_run until it finishes (${TERMINAL}). Only one run per set may be in progress, and the first completed run becomes the baseline later runs are scored against.`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  compact: (raw: PolicyTestRunResponse) => ({ run: runSummary(raw.run) }),
  inputSchema: {
    id: z.string().min(1).describe("Policy test set ID"),
  },
  handler: async (args, client) => client.moderation.startPolicyTestRun({ id: args.id }),
});

const getPolicyTestRun = defineTool({
  name: "moderation_get_policy_test_run",
  title: "Get policy test run",
  toolset: "moderation",
  description: `Get a policy test run's status, progress (rows_completed / rows_total) and, once finished, per-row results: expected vs actual labels and action, passed, and failure_reason (label_mismatch, action_mismatch, provider_error, policy_not_found). ${TERMINAL}; results are absent until then. metrics totals appear on runs after the baseline.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: PolicyTestRunResponse) =>
    bounded({ run: runSummary(raw.run), results: raw.results }),
  inputSchema: {
    id: z.string().min(1).describe("Policy test run ID"),
    only_failed: z
      .boolean()
      .optional()
      .describe("Return only rows that failed or could not be scored (passed is not true)"),
  },
  handler: async (args, client) => {
    const response = await client.moderation.getPolicyTestRun({ id: args.id });
    if (!args.only_failed || !response.results) return response;
    return { ...response, results: response.results.filter((row) => row.passed !== true) };
  },
});

export const moderationAnalyticsTools: AnyToolDef[] = [
  getFlagCount,
  listPolicyTestSets,
  getPolicyTestSet,
  createPolicyTestSet,
  deletePolicyTestSet,
  startPolicyTestRun,
  getPolicyTestRun,
];
