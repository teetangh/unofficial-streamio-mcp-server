import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "../../tools/registry.js";
import { callTool } from "../helpers.js";
import { mockClient } from "../mock-client.js";
import { ALL_CASES } from "./cases.js";

describe("tool → SDK payloads", () => {
  it.each(ALL_CASES.map((testCase) => [testCase.tool, testCase] as const))(
    "%s builds the expected request",
    async (_name, testCase) => {
      const mock = mockClient(testCase.overrides);
      const result = await callTool(testCase.tool, testCase.args, mock.client);
      const call = mock.last();

      expect(call.path).toBe(testCase.path);
      expect(call.args).toEqual(testCase.payload);
      testCase.assert?.(call, result);
    }
  );

  it("requires an exact payload assertion on every case", () => {
    // `payload` is required by ToolCase, so this guards against a case object
    // being widened or spread in a way that drops it at runtime.
    const missing = ALL_CASES.filter(
      (testCase) => !Object.prototype.hasOwnProperty.call(testCase, "payload")
    ).map((testCase) => testCase.tool);
    expect(missing).toEqual([]);
  });

  it("covers every registered tool", () => {
    const covered = new Set(ALL_CASES.map((testCase) => testCase.tool));
    const uncovered = ALL_TOOLS.map((tool) => tool.name).filter((name) => !covered.has(name));
    expect(uncovered).toEqual([]);
  });

  it("chat_get_channel proves the channel exists before it can page", async () => {
    // The create-or-query endpoint creates a channel on an unknown id, which
    // is why paging has to be preceded by a read that 404s instead.
    const mock = mockClient();
    await callTool(
      "chat_get_channel",
      { channel_type: "messaging", channel_id: "general", before_message_id: "m1" },
      mock.client
    );

    expect(mock.calls).toEqual([
      {
        path: "apiClient.sendRequest",
        args: [
          "GET",
          "/api/v2/chat/channels/{type}/{id}",
          { type: "messaging", id: "general" },
          { payload: JSON.stringify({ state: true, messages_limit: 25, members_limit: 30 }) },
        ],
      },
      {
        path: "chat.getOrCreateChannel",
        args: {
          type: "messaging",
          id: "general",
          state: true,
          messages: { limit: 25, id_lt: "m1" },
          members: { limit: 30 },
        },
      },
    ]);
  });

  it("resolves video.call(type, id) before invoking the call API", async () => {
    const mock = mockClient();
    await callTool(
      "video_create_call",
      { call_type: "default", call_id: "standup", created_by_id: "alice" },
      mock.client
    );
    expect(mock.calls[0]).toEqual({
      path: "video.call",
      args: { type: "default", id: "standup" },
    });
  });
});
