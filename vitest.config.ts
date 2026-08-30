import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    // Live tests create and delete real Stream objects; running files in
    // parallel makes teardown and rate limits unpredictable.
    fileParallelism: false,
  },
});
