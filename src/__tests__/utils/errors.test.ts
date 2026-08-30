import { describe, expect, it } from "vitest";
import { formatErrorMessage, ToolInputError } from "../../utils/errors.js";

class FakeStreamError extends Error {
  constructor(
    message: string,
    public code?: number,
    public metadata: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

describe("formatErrorMessage", () => {
  it("surfaces the HTTP status and Stream code from metadata", () => {
    const error = new FakeStreamError("Stream error code 16: message doesn't exist", 16, {
      responseCode: 404,
      clientRequestId: "req-1",
    });

    const text = formatErrorMessage(error);

    expect(text).toContain("HTTP 404");
    expect(text).toContain("Stream code 16");
    expect(text).toContain("does not exist");
    expect(text).toContain("req-1");
  });

  it("includes rate-limit details when present", () => {
    const error = new FakeStreamError("too many requests", 9, {
      responseCode: 429,
      rateLimit: {
        rateLimit: 100,
        rateLimitRemaining: 0,
        rateLimitReset: new Date("2026-08-30T12:00:00.000Z"),
      },
    });

    const text = formatErrorMessage(error);

    expect(text).toContain("0/100 remaining");
    expect(text).toContain("2026-08-30T12:00:00.000Z");
    expect(text).toContain("back off");
  });

  it("still reports usefully when only a code is present", () => {
    const text = formatErrorMessage(new FakeStreamError("boom", 4, {}));
    expect(text).toContain("Stream code 4");
    expect(text).not.toContain("HTTP");
  });

  it("labels tool input errors distinctly", () => {
    expect(formatErrorMessage(new ToolInputError("need 2 members"))).toBe(
      "Invalid input: need 2 members"
    );
  });

  it("falls back to the message for plain errors", () => {
    expect(formatErrorMessage(new Error("plain"))).toBe("plain");
  });

  it("stringifies non-errors", () => {
    expect(formatErrorMessage("oops")).toBe("oops");
    expect(formatErrorMessage(42)).toBe("42");
    expect(formatErrorMessage(null)).toBe("null");
  });
});
