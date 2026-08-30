import { afterEach, describe, expect, it } from "vitest";
import {
  bounded,
  pick,
  serialize,
  shrink,
  summarizeRecord,
  toolError,
  toolResult,
  userRef,
} from "../../utils/format.js";

afterEach(() => {
  delete process.env.STREAM_MCP_MAX_RESPONSE_BYTES;
});

describe("shrink", () => {
  it("drops noisy structural keys", () => {
    const out = shrink({ id: "c1", config: { a: 1 }, own_capabilities: ["x"], grants: {} });
    expect(out).toEqual({ id: "c1" });
  });

  it("caps long arrays from the middle, keeping both ends", () => {
    const out = shrink({ items: Array.from({ length: 25 }, (_, i) => i) }) as {
      items: unknown[];
    };

    // Stream returns messages oldest-first, so dropping the tail would hide
    // the newest entries — exactly what a caller reading history wants.
    expect(out.items[0]).toBe(0);
    expect(out.items.at(-1)).toBe(24);
    expect(out.items).toContainEqual(expect.objectContaining({ _omitted_items: 5 }));
  });

  it("scales the retained window with the requested cap", () => {
    const items = Array.from({ length: 400 }, (_, i) => i);
    const out = bounded({ items }) as { items: unknown[] };

    // A raised cap must actually return more, not the default 20.
    expect(out.items.length).toBeGreaterThan(250);
    expect(out.items[0]).toBe(0);
    expect(out.items.at(-1)).toBe(399);
  });

  it("normalises a payload that JSON.stringify cannot represent", () => {
    expect(serialize(undefined)).toBe("null");
  });

  it("keeps every item when the caller already bounded the list", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const out = bounded({ items }) as { items: unknown[] };

    expect(out.items).toHaveLength(120);
    expect(out.items.at(-1)).toBe(119);
  });

  it("still drops noisy keys under bounded compaction", () => {
    expect(bounded({ id: "c1", config: { a: 1 } })).toEqual({ id: "c1" });
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
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "500";
    const text = serialize({ blob: "x".repeat(5000) });

    expect(text).toContain("[TRUNCATED:");
    expect(text).toContain("Narrow the filter");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(500);
  });

  it("measures the cap in UTF-8 bytes, not UTF-16 code units", () => {
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "200";
    // 150 CJK characters are 450 UTF-8 bytes but only 150 `.length` units,
    // so a length-based check would wave this through.
    const text = serialize({ blob: "。".repeat(150) });

    expect(text).toContain("[TRUNCATED:");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(200);
  });
});

describe("serialize under pressure", () => {
  it("drops indentation before it drops rows", () => {
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "900";
    const items = Array.from({ length: 20 }, (_, index) => ({
      id: `row-${index}`,
      name: `Row ${index}`,
    }));
    const text = serialize({ items });

    // Whitespace is boilerplate; a row is data. Shed the boilerplate first.
    expect(text).not.toContain("\n");
    expect(text).not.toContain("_omitted_items");
    expect(JSON.parse(text).items).toHaveLength(20);
  });

  it("keeps the largest prefix that fits rather than halving", () => {
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "700";
    const items = Array.from({ length: 60 }, (_, index) => ({ id: `row-${index}` }));
    const parsed = JSON.parse(serialize({ items }));

    // Repeated halving landed on 15 of 60 here, and 7 of 30 on a real page.
    expect(parsed.items.length).toBeGreaterThan(20);
    expect(parsed._omitted_items).toBe(60 - parsed.items.length);
    expect(parsed._hint).toContain("were dropped");
  });

  it("keeps a projection's own hint in front of the truncation notice", () => {
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "700";
    const items = Array.from({ length: 60 }, (_, index) => ({ id: `row-${index}` }));
    const parsed = JSON.parse(serialize({ items, _hint: "Use chat_get_channel for one channel." }));

    expect(parsed._hint).toContain("Use chat_get_channel for one channel.");
    expect(parsed._hint).toContain("were dropped");
  });

  it("returns parseable JSON when it has to drop rows", () => {
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "400";
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `row-${index}` }));
    expect(() => JSON.parse(serialize({ items }))).not.toThrow();
  });

  it("keeps a parseable envelope when not even one row fits", () => {
    process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "300";
    const items = Array.from({ length: 5 }, () => ({ blob: "x".repeat(400) }));
    const parsed = JSON.parse(serialize({ items }));

    expect(parsed.items).toEqual([]);
    expect(parsed._omitted_items).toBe(5);
  });
});

describe("projection helpers", () => {
  it("pick keeps only the named keys and skips absent ones", () => {
    expect(pick({ id: "a", name: "A", secret: 1 }, ["id", "name", "missing"] as never)).toEqual({
      id: "a",
      name: "A",
    });
    expect(pick(undefined, ["id"] as never)).toBeUndefined();
  });

  it("userRef reduces a user to a reference", () => {
    expect(userRef({ id: "alice", name: "Alice" })).toEqual({ id: "alice", name: "Alice" });
    expect(userRef({ id: "alice" })).toEqual({ id: "alice" });
    expect(userRef(undefined)).toBeUndefined();
  });

  it("summarizeRecord lists small key sets and counts large ones", () => {
    expect(summarizeRecord({ a: 1, b: 2 })).toEqual({ count: 2, keys: ["a", "b"] });
    expect(
      summarizeRecord(Object.fromEntries(Array.from({ length: 55 }, (_, i) => [`k${i}`, i])))
    ).toEqual({ count: 55 });
    expect(summarizeRecord(undefined)).toBeUndefined();
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
