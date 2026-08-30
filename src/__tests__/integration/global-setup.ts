/**
 * Sweeps live-test fixture users once per run.
 *
 * DeleteUsers is capped at 6 calls per minute. Deleting per suite was three
 * calls per run, so two runs in the same minute tripped the limit and Stream
 * emailed a rate-limit alert. A single sweep here keeps a full run to one
 * call, leaving headroom for repeated runs.
 *
 * Channels and calls are still torn down per suite — those endpoints are not
 * rate limited, and removing them promptly keeps the app tidy mid-run.
 */
import { StreamClient } from "@stream-io/node-sdk";
import { config } from "dotenv";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_TOOLS } from "../../tools/registry.js";
import { FIXTURE_PREFIX } from "./harness.js";

// `setupFiles` runs inside the test workers, so the .env it loads never
// reaches this file — globalSetup runs in the main process. Without this the
// sweep read no credentials and returned silently on every local run, which is
// how fixture users accumulated in the app while the suite reported success.
// CI injects the variables directly, where this is a no-op.
config({ quiet: true });

let coverageDir: string | undefined;

/**
 * Fails the run if any registered tool was never invoked live.
 *
 * A unit test can only prove a tool builds the request we expect; it cannot
 * prove Stream accepts it. Several tools shipped broken precisely because
 * their unit tests mocked the SDK — so every tool has to be exercised for
 * real, and this gate is what keeps that true as tools are added.
 */
function assertFullCoverage(): void {
  const path = process.env.STREAM_MCP_COVERAGE_FILE;
  if (!path) return;

  let recorded: string[];
  try {
    recorded = readFileSync(path, "utf8").split("\n").filter(Boolean);
  } catch {
    recorded = [];
  }
  const exercised = new Set(recorded);
  const missing = ALL_TOOLS.map((tool) => tool.name).filter((name) => !exercised.has(name));

  console.log(
    `Live tool coverage: ${ALL_TOOLS.length - missing.length}/${ALL_TOOLS.length} exercised.`
  );
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} tool(s) were never called against the live API:\n  ${missing.join("\n  ")}`
    );
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries a rate-limited call with exponential backoff. */
async function withRetry<T>(operation: () => Promise<T>, attempts = 7): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if ((error as { code?: number }).code !== 9 || attempt === attempts - 1) throw error;
      await sleep(2 ** attempt * 1000);
    }
  }
  throw lastError;
}

async function sweep(): Promise<void> {
  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) return;

  const client = new StreamClient(apiKey, apiSecret, { timeout: 30_000 });
  const { users } = await client.queryUsers({
    // Deactivated users are excluded by default, so a suite that deactivates a
    // fixture and dies before reactivating it would strand that user where no
    // later sweep could ever see it.
    payload: {
      filter_conditions: { id: { $autocomplete: FIXTURE_PREFIX } },
      limit: 100,
      include_deactivated_users: true,
    },
  });
  // Guests are the reason for the second clause: `users_create_guest` asks for
  // `mcptest-guestuser-x` and Stream returns `guest-<uuid>-mcptest-guestuser-x`,
  // so a prefix-only match queried them and then dropped them from the delete
  // list on every run. They accumulated in the app for as long as this existed.
  const ids = users
    .map((user) => user.id)
    .filter((id) => id.startsWith(`${FIXTURE_PREFIX}-`) || id.includes(`-${FIXTURE_PREFIX}-`));
  if (ids.length === 0) return;

  const { task_id } = await withRetry(() =>
    client.deleteUsers({ user_ids: ids, user: "hard", messages: "hard" })
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const task = await client.getTask({ id: task_id });
    if (task.status !== "pending" && task.status !== "running") break;
    await sleep(500);
  }
  console.log(`Live-test sweep: deleted ${ids.length} fixture user(s).`);
}

export async function setup(): Promise<void> {
  coverageDir = mkdtempSync(join(tmpdir(), "stream-mcp-coverage-"));
  const file = join(coverageDir, "tools.log");
  writeFileSync(file, "");
  process.env.STREAM_MCP_COVERAGE_FILE = file;

  // Clear anything a previously interrupted run left behind.
  await sweep();
}

export async function teardown(): Promise<void> {
  await sweep();
  try {
    assertFullCoverage();
  } finally {
    if (coverageDir) rmSync(coverageDir, { recursive: true, force: true });
  }
}
