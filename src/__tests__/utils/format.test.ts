import { afterEach, describe, expect, it } from "vitest";
import { serialize, shrink, toolError, toolResult } from "../../utils/format.js";

afterEach(() => {
  delete process.env.STREAM_MCP_MAX_RESPONSE_BYTES;
});

describe("shrink", () => {
  it("drops noisy structural keys", () => {
    const out = shrink({ id: "c1", config: { a: 1 }, own_capabilities: ["x"], grants: {} });
    expect(out).toEqual({ id: "c1" });
  });

  it("caps long arrays and reports the omission", () => {
    const out = shrink({ items: Array.from({ length: 25 }, (_, i) => i) }) as {
      items: unknown[];
    };

    expect(out.items).toHaveLength(21);
    expect(out.items[20]).toMatchObject({ _omitted_items: 5 });
  });

  it("leaves short arrays untouched", () => {
    expect(shrink({ items: [1, 2, 3] })).toEqual({ items: [1, 2, 3] });
  });

  it("truncates very long strings", () => {
    const out = shrink({ text: "a".repeat(2500) }) as { text: string };
    expect(out.text).toContain("(+500 chars");
  });

  it("renders dates as ISO strings", () => {
    expect(shrink({ at: new Date("2026-08-30T00:00:00.000Z") })).toEqual({
      at: "2026-08-30T00:00:00.000Z",
    });
  });

  it("recurses into nested structures", () => {
    expect(
      shrink({ call: { id: "x", own_capabilities: ["a"], nested: { config: {}, keep: 1 } } })
    ).toEqual({
      call: { id: "x", nested: { keep: 1 } },
    });
  });
});

describe("serialize", () => {
  it("pretty-prints objects", () => {
    expect(serialize({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("passes strings through", () => {
    expect(serialize("hi")).toBe("hi");
  });

  it("caps oversized payloads with an explicit notice", () => {
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "100";
    const text = serialize({ blob: "x".repeat(1000) });

    expect(text).toContain("[TRUNCATED:");
    expect(text).toContain("Narrow the filter");
  });
});

describe("toolResult / toolError", () => {
  it("wraps data as a text content block", () => {
    expect(toolResult({ a: 1 })).toEqual({
      content: [{ type: "text", text: '{\n  "a": 1\n}' }],
    });
  });

  it("marks errors with isError", () => {
    const result = toolError(new Error("nope"));
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "nope" });
  });
});
