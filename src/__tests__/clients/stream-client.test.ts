import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getClient, resetClient } from "../../clients/index.js";

const KEYS = [
  "STREAM_API_KEY",
  "STREAM_API_SECRET",
  "STREAM_TIMEOUT_MS",
  "STREAM_BASE_URL",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  resetClient();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetClient();
});

describe("getClient", () => {
  it("throws a actionable error when the key is missing", () => {
    delete process.env.STREAM_API_KEY;
    process.env.STREAM_API_SECRET = "s";
    expect(() => getClient()).toThrow(/STREAM_API_KEY/);
  });

  it("throws when the secret is missing", () => {
    process.env.STREAM_API_KEY = "k";
    delete process.env.STREAM_API_SECRET;
    expect(() => getClient()).toThrow(/STREAM_API_SECRET/);
  });

  it("builds a client with the configured key", () => {
    process.env.STREAM_API_KEY = "test-key";
    process.env.STREAM_API_SECRET = "test-secret";
    expect(getClient().apiKey).toBe("test-key");
  });

  it("uses a 15s timeout by default rather than the SDK's 3s", () => {
    process.env.STREAM_API_KEY = "k";
    process.env.STREAM_API_SECRET = "s";
    expect(getClient().config?.timeout).toBe(15_000);
  });

  it("honours STREAM_TIMEOUT_MS and STREAM_BASE_URL", () => {
    process.env.STREAM_API_KEY = "k";
    process.env.STREAM_API_SECRET = "s";
    process.env.STREAM_TIMEOUT_MS = "45000";
    process.env.STREAM_BASE_URL = "https://example.invalid";

    const client = getClient();
    expect(client.config?.timeout).toBe(45_000);
    expect(client.config?.basePath).toBe("https://example.invalid");
  });

  it("rejects a fractional timeout rather than flooring it to zero", () => {
    process.env.STREAM_API_KEY = "k";
    process.env.STREAM_API_SECRET = "s";
    process.env.STREAM_TIMEOUT_MS = "0.5";
    // Flooring would produce a 0ms timeout that aborts every request.
    expect(() => getClient()).toThrow(/positive integer/);
  });

  it("rejects a non-numeric timeout", () => {
    process.env.STREAM_API_KEY = "k";
    process.env.STREAM_API_SECRET = "s";
    process.env.STREAM_TIMEOUT_MS = "soon";
    expect(() => getClient()).toThrow(/Invalid numeric environment value/);
  });

  it("caches the client and rebuilds after reset", () => {
    process.env.STREAM_API_KEY = "k";
    process.env.STREAM_API_SECRET = "s";
    const first = getClient();
    expect(getClient()).toBe(first);
    resetClient();
    expect(getClient()).not.toBe(first);
  });
});

describe("path parameter guard", () => {
  // These go through the real SDK object, so an SDK upgrade that renames its
  // internal ApiClient fields fails here instead of silently dropping the guard.
  const client = () => {
    process.env.STREAM_API_KEY = "k";
    process.env.STREAM_API_SECRET = "s";
    process.env.STREAM_BASE_URL = "https://example.invalid";
    return getClient();
  };

  it.each([
    ["chat", () => client().chat.getChannelType({ name: "../../app" })],
    ["video", () => client().video.getCallType({ name: "../../app" })],
    ["moderation", () => client().moderation.getConfig({ key: "a/b" })],
    ["common", () => client().getPermission({ id: "%2e%2e" })],
  ])("rejects traversal through the %s API client before any request", async (_label, call) => {
    await expect(call()).rejects.toThrow(/Stream identifiers cannot/);
  });

  it.each(["..", ".", "", "a?b=1", "a#b", "a\\b"])("rejects %j", async (name) => {
    await expect(client().chat.getChannelType({ name })).rejects.toThrow(
      /Stream identifiers cannot/
    );
  });

  it("lets ordinary identifiers through to the network", async () => {
    // example.invalid never resolves, so reaching fetch shows the guard passed.
    await expect(client().chat.getChannelType({ name: "messaging" })).rejects.not.toThrow(
      /Stream identifiers cannot/
    );
  });
});
