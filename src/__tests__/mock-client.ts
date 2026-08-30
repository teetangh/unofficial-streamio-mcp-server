import type { StreamClient } from "@stream-io/node-sdk";

export interface RecordedCall {
  path: string;
  args: unknown;
}

export interface MockClient {
  client: StreamClient;
  calls: RecordedCall[];
  /** The last recorded call that is not a `video.call(type, id)` lookup. */
  last(): RecordedCall;
}

/**
 * A recording stand-in for `StreamClient`. Every method access resolves to a
 * spy that records `<namespace>.<method>` and the payload it was given, so a
 * test can assert the exact request a tool builds without any network.
 */
/**
 * Product namespaces on StreamClient that hold methods rather than being one.
 * `apiClient` is here because `chat_get_channel` calls Stream's GET channel
 * endpoint through it — the typed SDK method for that endpoint is broken.
 */
const NAMESPACES = new Set(["chat", "video", "moderation", "feeds", "apiClient"]);

export function mockClient(overrides: Record<string, unknown> = {}): MockClient {
  const calls: RecordedCall[] = [];
  const response = { duration: "1ms" };

  const record =
    (path: string) =>
    (...args: unknown[]) => {
      // Every SDK method takes a single request object; `apiClient.sendRequest`
      // is positional, so the whole list is recorded and a case asserts on it.
      calls.push({ path, args: args.length > 1 ? args : args[0] });
      if (path in overrides) return overrides[path];
      return Promise.resolve(response);
    };

  const namespace = (prefix: string): unknown =>
    new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key !== "string") return undefined;
          const path = prefix ? `${prefix}.${key}` : key;

          // Product namespaces are objects, not methods.
          if (prefix === "" && NAMESPACES.has(key)) return namespace(key);

          // `client.video.call(type, id)` returns a call-scoped API object.
          if (path === "video.call") {
            return (type: string, id: string) => {
              calls.push({ path: "video.call", args: { type, id } });
              return namespace("call");
            };
          }
          return record(path);
        },
      }
    );

  const client = namespace("") as StreamClient;

  return {
    client,
    calls,
    last() {
      const real = calls.filter((call) => call.path !== "video.call");
      if (real.length === 0) throw new Error("No SDK call was recorded");
      return real[real.length - 1];
    },
  };
}
