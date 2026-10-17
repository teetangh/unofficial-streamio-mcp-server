import type {
  CreateImportResponse,
  GetImportResponse,
  GetRetentionPolicyResponse,
  GetRetentionPolicyRunsResponse,
  ImportTask,
  ListImportsResponse,
} from "@stream-io/node-sdk";
import { z } from "zod";
import {
  defined,
  filterConditions,
  limit,
  nextCursor,
  prevCursor,
  sortParams,
} from "../../schemas/common.js";
import { bounded, pick } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";

const retentionPolicyEnum = z
  .enum(["old-messages", "inactive-channels"])
  .describe(
    "old-messages deletes messages older than max_age_hours; inactive-channels deletes channels whose latest of created_at, updated_at and last_message_at is older than max_age_hours"
  );

const IMPORT_TASK_KEYS = [
  "id",
  "state",
  "mode",
  "path",
  "size",
  "created_at",
  "updated_at",
] as const;

/** The state history is the useful part of a stuck import; the rest is identity. */
const importTask = (task: ImportTask | undefined) =>
  task ? { ...pick(task, IMPORT_TASK_KEYS), history: task.history } : undefined;

const getRetentionPolicies = defineTool({
  name: "chat_get_retention_policies",
  title: "Get chat retention policies",
  toolset: "chat-admin",
  description:
    "List the app's chat data-retention policies (old-messages, inactive-channels) with their max_age_hours and when each was enabled. An empty list means nothing is auto-deleted.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: GetRetentionPolicyResponse) => ({
    policies: (raw.policies ?? []).map((policy) =>
      pick(policy, ["policy", "enabled_at", "config"])
    ),
  }),
  inputSchema: {},
  handler: async (_args, client) => client.chat.getRetentionPolicy(),
});

const getRetentionPolicyRuns = defineTool({
  name: "chat_get_retention_policy_runs",
  title: "Get chat retention policy runs",
  toolset: "chat-admin",
  description:
    "History of retention cleanup runs: per day and policy, how many messages and channels were hard-deleted. Use it to confirm what a retention policy actually removed.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: GetRetentionPolicyRunsResponse) =>
    bounded({
      runs: (raw.runs ?? []).map((run) => pick(run, ["date", "policy", "stats"])),
      next: raw.next,
      prev: raw.prev,
    }),
  inputSchema: {
    filter_conditions: filterConditions,
    sort: sortParams,
    limit: limit(100, 25),
    next: nextCursor,
    prev: prevCursor,
  },
  handler: async (args, client) =>
    client.chat.getRetentionPolicyRuns(
      defined({
        filter_conditions: args.filter_conditions,
        sort: args.sort,
        limit: args.limit ?? 25,
        next: args.next,
        prev: args.prev,
      })
    ),
});

const setRetentionPolicy = defineTool({
  name: "chat_set_retention_policy",
  title: "Set chat retention policy",
  toolset: "chat-admin",
  description:
    "Enable or update a chat retention policy. Matching data is HARD-DELETED and cannot be recovered; cleanup starts after a 24-hour grace period and runs in the background. Stream emails every admin on the team when a policy is enabled or updated. Setting an existing policy again replaces its max_age_hours.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    policy: retentionPolicyEnum,
    // Range left to Stream, which enforces it (verified live: 24 to 87600 —
    // the docs say 43800) and answers with a precise message.
    max_age_hours: z
      .int()
      .describe("Delete data older than this many hours. Stream accepts 24 to 87600 (10 years)."),
  },
  handler: async (args, client) =>
    client.chat.setRetentionPolicy({ policy: args.policy, max_age_hours: args.max_age_hours }),
});

const deleteRetentionPolicy = defineTool({
  name: "chat_delete_retention_policy",
  title: "Delete chat retention policy",
  toolset: "chat-admin",
  description:
    "Turn off a chat retention policy so Stream stops auto-deleting that kind of data. Data already deleted is not restored. Succeeds even when the policy is not set.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    policy: retentionPolicyEnum,
  },
  handler: async (args, client) => client.chat.deleteRetentionPolicy({ policy: args.policy }),
});

const createImportUrl = defineTool({
  name: "chat_create_import_url",
  title: "Create import upload URL",
  toolset: "chat-admin",
  description:
    "Step 1 of a chat data import: get a short-lived presigned upload_url to PUT the import JSON file to, and the path to pass to chat_create_import once it is uploaded. Creates nothing in the app by itself.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    filename: z.string().min(1).optional().describe("Name for the uploaded file, e.g. import.json"),
  },
  handler: async (args, client) => client.createImportURL(defined({ filename: args.filename })),
});

const createImport = defineTool({
  name: "chat_create_import",
  title: "Start chat data import",
  toolset: "chat-admin",
  description:
    "Step 2 of a chat data import: start importing an uploaded file (path from chat_create_import_url, max 300 MB). insert skips items that already exist. upsert is NOT a partial update: for existing items, fields missing from the file are reset to their defaults and custom data is replaced (blocked users are merged). Imports never delete data. Runs asynchronously — follow it with chat_get_import; Stream advises allowing up to 7 days for a full migration.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  compact: (raw: CreateImportResponse) => ({ import_task: importTask(raw.import_task) }),
  inputSchema: {
    path: z.string().min(1).describe("The path returned by chat_create_import_url"),
    mode: z
      .enum(["insert", "upsert"])
      .describe("insert: skip existing items. upsert: replace existing items (destructive)."),
  },
  handler: async (args, client) => client.createImport({ path: args.path, mode: args.mode }),
});

const listImports = defineTool({
  name: "chat_list_imports",
  title: "List chat data imports",
  toolset: "chat-admin",
  description: "List the app's chat data imports with their state and state history.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: ListImportsResponse) =>
    bounded({ import_tasks: (raw.import_tasks ?? []).map(importTask) }),
  inputSchema: {},
  handler: async (_args, client) => client.listImports(),
});

const getImport = defineTool({
  name: "chat_get_import",
  title: "Get chat data import",
  toolset: "chat-admin",
  description:
    "Get one chat data import's state and its state-transition history — use it to follow an import started with chat_create_import.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: GetImportResponse) => ({ import_task: importTask(raw.import_task) }),
  inputSchema: {
    id: z.string().min(1).describe("Import task ID"),
  },
  handler: async (args, client) => client.getImport({ id: args.id }),
});

export const chatDataTools: AnyToolDef[] = [
  getRetentionPolicies,
  getRetentionPolicyRuns,
  setRetentionPolicy,
  deleteRetentionPolicy,
  createImportUrl,
  createImport,
  listImports,
  getImport,
];
