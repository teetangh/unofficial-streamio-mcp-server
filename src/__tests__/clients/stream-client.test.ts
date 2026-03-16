import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClient, resetClient } from "../../clients/stream-client.js";

describe("getClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetClient();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetClient();
  });

  it("throws when STREAM_API_KEY is missing", () => {
    delete process.env.STREAM_API_KEY;
    delete process.env.STREAM_API_SECRET;
    expect(() => getClient()).toThrow(
      "Missing STREAM_API_KEY or STREAM_API_SECRET"
    );
  });

  it("throws when STREAM_API_SECRET is missing", () => {
    process.env.STREAM_API_KEY = "test-key";
    delete process.env.STREAM_API_SECRET;
    expect(() => getClient()).toThrow(
      "Missing STREAM_API_KEY or STREAM_API_SECRET"
    );
  });

  it("returns a StreamClient when env vars are set", () => {
    process.env.STREAM_API_KEY = "test-key";
    process.env.STREAM_API_SECRET = "test-secret";
    const client = getClient();
    expect(client).toBeDefined();
    expect(client.apiKey).toBe("test-key");
  });

  it("returns the same singleton instance", () => {
    process.env.STREAM_API_KEY = "test-key";
    process.env.STREAM_API_SECRET = "test-secret";
    const client1 = getClient();
    const client2 = getClient();
    expect(client1).toBe(client2);
  });

  it("creates a new instance after resetClient", () => {
    process.env.STREAM_API_KEY = "test-key";
    process.env.STREAM_API_SECRET = "test-secret";
    const client1 = getClient();
    resetClient();
    const client2 = getClient();
    expect(client1).not.toBe(client2);
  });
});
