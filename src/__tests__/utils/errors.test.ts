import { describe, it, expect } from "vitest";
import { formatErrorMessage } from "../../utils/errors.js";

describe("formatErrorMessage", () => {
  it("formats a plain Error", () => {
    const err = new Error("something went wrong");
    expect(formatErrorMessage(err)).toBe("something went wrong");
  });

  it("formats a Stream API error with status and code", () => {
    const err = Object.assign(new Error("Not Found"), {
      status: 404,
      code: 16,
    });
    expect(formatErrorMessage(err)).toBe("Stream API Error (404): Not Found");
  });

  it("formats a non-Error value", () => {
    expect(formatErrorMessage("string error")).toBe("string error");
    expect(formatErrorMessage(42)).toBe("42");
    expect(formatErrorMessage(null)).toBe("null");
  });
});
