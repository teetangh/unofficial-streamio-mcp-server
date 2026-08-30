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
      if ("payload" in testCase) {
        expect(call.args).toEqual(testCase.payload);
      }
      testCase.assert?.(call, result);
    }
  );

  it("covers every registered tool", () => {
    const covered = new Set(ALL_CASES.map((testCase) => testCase.tool));
    const uncovered = ALL_TOOLS.map((tool) => tool.name).filter((name) => !covered.has(name));
    expect(uncovered).toEqual([]);
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
