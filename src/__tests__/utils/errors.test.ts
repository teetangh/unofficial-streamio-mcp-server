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

  it("does not treat a local error carrying metadata: null as a Stream error", () => {
    const local = Object.assign(new Error("socket hang up"), { metadata: null });
    expect(formatErrorMessage(local)).toBe("socket hang up");
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

describe("not-found hints", () => {
  it('replaces "Create it first" when a tool reads something uncreatable', () => {
    const error = Object.assign(new Error("call report data expired"), {
      code: 16,
      metadata: { responseCode: 404 },
    });

    const generic = formatErrorMessage(error);
    expect(generic).toContain("Create it first");

    const scoped = formatErrorMessage(error, "Reports are derived from call activity.");
    expect(scoped).toContain("Reports are derived from call activity.");
    expect(scoped).not.toContain("Create it first");
    // Stream's own wording still leads — it is what distinguishes an expired
    // report from a session that never existed.
    expect(scoped.indexOf("call report data expired")).toBeLessThan(
      scoped.indexOf("Reports are derived")
    );
  });

  it("leaves other codes alone", () => {
    const error = Object.assign(new Error("nope"), { code: 17, metadata: { responseCode: 403 } });
    expect(formatErrorMessage(error, "not used here")).toContain("Not allowed");
  });
});
