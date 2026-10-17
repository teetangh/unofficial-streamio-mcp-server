import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    // Only registered for the live suites; `npm test` never loads it.
    globalSetup: process.env.STREAM_MCP_LIVE ? ["./src/__tests__/integration/global-setup.ts"] : [],
    // Live tests create and delete real Stream objects; running files in
    // parallel makes teardown and rate limits unpredictable.
    fileParallelism: false,
    // Real network round trips: from a CI runner single Stream calls (GetApp,
    // GetOrCreateChannel) have exceeded vitest's 5 s default. Unit tests keep
    // the default so a hung mock still fails fast.
    ...(process.env.STREAM_MCP_LIVE ? { testTimeout: 30_000, hookTimeout: 60_000 } : {}),
  },
});
