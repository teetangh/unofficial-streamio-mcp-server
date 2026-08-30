import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { randomUUID } from "node:crypto";
import { getClient } from "../../clients/index.js";
import { createServer } from "../../server.js";

export const hasCredentials =
  Boolean(process.env.STREAM_API_KEY) && Boolean(process.env.STREAM_API_SECRET);

/** Prefix for every object this suite creates, so leftovers are identifiable. */
export const FIXTURE_PREFIX = "mcptest";

export function fixtureId(kind: string): string {
  return `${FIXTURE_PREFIX}-${kind}-${randomUUID().slice(0, 8)}`;
}

type Cleanup = () => Promise<unknown>;

export class LiveHarness {
  private client!: Client;
  private readonly cleanups: Cleanup[] = [];

  async connect(): Promise<void> {
    const { server } = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    this.client = new Client({ name: "live-test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), this.client.connect(clientTransport)]);
  }

  /** Registers teardown work, run in reverse order regardless of failures. */
  onCleanup(cleanup: Cleanup): void {
    this.cleanups.push(cleanup);
  }

  /**
   * Teardown goes through the SDK rather than the tools under test, so a
   * broken tool leaves no residue behind in the Stream app.
   */
  deleteChannelOnCleanup(type: string, id: string): void {
    this.onCleanup(() => getClient().chat.deleteChannel({ type, id, hard_delete: true }));
  }

  deleteCallOnCleanup(type: string, id: string): void {
    this.onCleanup(() => getClient().video.deleteCall({ type, id, hard: true }));
  }

  deleteUsersOnCleanup(userIds: string[]): void {
    this.onCleanup(() =>
      getClient().deleteUsers({ user_ids: userIds, user: "hard", messages: "hard" })
    );
  }

  /** Calls a tool and returns its parsed payload, throwing on tool errors. */
  async call<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await this.client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])
      .filter((entry) => entry.type === "text")
      .map((entry) => entry.text)
      .join("\n");

    if (result.isError) {
      throw new Error(`${name} failed: ${text}`);
    }
    return JSON.parse(text) as T;
  }

  /**
   * Calls a tool expecting it to fail, and returns the error text. Used for
   * operations that cannot succeed without a live participant — asserting the
   * *specific* Stream error still proves the request was well-formed.
   */
  async callExpectingError(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const result = await this.client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])
      .map((entry) => entry.text)
      .join("\n");
    if (!result.isError) {
      throw new Error(`${name} unexpectedly succeeded: ${text}`);
    }
    return text;
  }

  async teardown(): Promise<void> {
    const failures: string[] = [];
    for (const cleanup of this.cleanups.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    this.cleanups.length = 0;
    await this.client?.close();
    if (failures.length > 0) {
      console.warn(`Cleanup issues (non-fatal):\n  ${failures.join("\n  ")}`);
    }
  }
}
