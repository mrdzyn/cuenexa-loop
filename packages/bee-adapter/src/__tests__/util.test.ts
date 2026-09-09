import { describe, expect, it } from "vitest";
import { coerceTimestamp } from "../normalize/util.js";

describe("coerceTimestamp", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(coerceTimestamp(null)).toBeNull();
    expect(coerceTimestamp(undefined)).toBeNull();
    expect(coerceTimestamp("")).toBeNull();
    expect(coerceTimestamp("   ")).toBeNull();
  });

  it("passes through a well-formed ISO 8601 string", () => {
    expect(coerceTimestamp("2026-01-05T09:00:00.000Z")).toBe("2026-01-05T09:00:00.000Z");
  });

  it("returns null for a garbage, non-timestamp string", () => {
    expect(coerceTimestamp("not a date")).toBeNull();
  });

  // --- Bee-style numeric epoch values --------------------------------------
  // Bee CLI records use realistic epoch-*second* values (~1e9, "now"-ish),
  // not epoch milliseconds, for at least some numeric timestamp fields.
  // A naive `new Date(value)` on a ~1e9 number lands in 1970, not the
  // intended date, because Date's numeric constructor always expects
  // milliseconds.

  it("treats a realistic epoch-seconds number (~1e9) as seconds, not milliseconds", () => {
    // 1767603600 seconds since epoch = 2026-01-05T09:00:00.000Z
    const epochSeconds = 1767603600;
    expect(coerceTimestamp(epochSeconds)).toBe("2026-01-05T09:00:00.000Z");
  });

  it("treats a realistic epoch-milliseconds number (~1e12) as milliseconds", () => {
    const epochMilliseconds = 1767603600000;
    expect(coerceTimestamp(epochMilliseconds)).toBe("2026-01-05T09:00:00.000Z");
  });

  it("treats a numeric epoch-seconds *string* the same as the equivalent number", () => {
    expect(coerceTimestamp("1767603600")).toBe("2026-01-05T09:00:00.000Z");
  });

  it("treats a numeric epoch-milliseconds *string* the same as the equivalent number", () => {
    expect(coerceTimestamp("1767603600000")).toBe("2026-01-05T09:00:00.000Z");
  });

  it("rejects a naive (non-seconds-aware) interpretation of an epoch-seconds value", () => {
    // Sanity guard against regressing to `new Date(value)` directly: that
    // would place 1767603600 in 1970, not 2026.
    const result = coerceTimestamp(1767603600);
    expect(result).not.toContain("1970");
  });

  it("handles a negative numeric string (pre-epoch) without throwing", () => {
    expect(() => coerceTimestamp("-1000")).not.toThrow();
  });

  it("returns null for a non-finite number", () => {
    expect(coerceTimestamp(Number.NaN)).toBeNull();
    expect(coerceTimestamp(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
