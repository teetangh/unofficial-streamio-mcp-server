import { describe, it, expect } from "vitest";
import { toolResult, toolError } from "../../utils/format.js";

describe("toolResult", () => {
  it("formats an object as JSON text content", () => {
    const result = toolResult({ foo: "bar" });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ foo: "bar" }, null, 2),
    });
    expect(result.isError).toBeUndefined();
  });

  it("passes through a string directly", () => {
    const result = toolResult("hello");
    expect(result.content[0]).toEqual({ type: "text", text: "hello" });
  });
});

describe("toolError", () => {
  it("returns an error result with formatted message", () => {
    const result = toolError(new Error("bad request"));
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "bad request",
    });
  });
});
