import { describe, expect, it } from "vitest";
import { extractDeadline } from "../deadline.js";

// A fixed Monday 09:00 UTC reference instant so UTC-zone weekday math is deterministic.
const NOW_UTC = "2026-01-05T09:00:00.000Z"; // Monday, in UTC

describe("extractDeadline (UTC)", () => {
  it("resolves 'tomorrow' relative to now", () => {
    const result = extractDeadline("Send it tomorrow.", NOW_UTC, "UTC");
    expect(result?.phrase.toLowerCase()).toBe("tomorrow");
    expect(result?.dueAt).toBe("2026-01-06T00:00:00.000Z");
  });

  it("resolves 'today' relative to now", () => {
    const result = extractDeadline("Send it today.", NOW_UTC, "UTC");
    expect(result?.dueAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("resolves 'by end of day' to the end of the reference day", () => {
    const result = extractDeadline("Send it by end of day.", NOW_UTC, "UTC");
    expect(result?.dueAt).toBe("2026-01-05T23:59:59.999Z");
  });

  it("resolves 'next week' to seven days out", () => {
    const result = extractDeadline("Let's revisit next week.", NOW_UTC, "UTC");
    expect(result?.dueAt).toBe("2026-01-12T00:00:00.000Z");
  });

  it("resolves a bare weekday name to its nearest upcoming occurrence", () => {
    // NOW_UTC is a Monday; the nearest Friday is 4 days out.
    const result = extractDeadline("Let's revisit this on Friday.", NOW_UTC, "UTC");
    expect(result?.dueAt).toBe("2026-01-09T00:00:00.000Z");
  });

  it("resolves an explicit month/day phrase", () => {
    const result = extractDeadline("The report is due September 15.", NOW_UTC, "UTC");
    expect(result?.phrase.toLowerCase()).toContain("september 15");
    expect(result?.dueAt).toBe("2026-09-15T00:00:00.000Z");
  });

  it("rolls an already-passed month/day phrase to next year", () => {
    // Reference is June 2026; "March 1" without a year should resolve to 2027-03-01, not a past date.
    const result = extractDeadline("Due March 1.", "2026-06-01T00:00:00.000Z", "UTC");
    expect(result?.dueAt).toBe("2027-03-01T00:00:00.000Z");
  });

  it("returns null when no recognizable temporal phrase is present", () => {
    expect(extractDeadline("Send the revised proposal.", NOW_UTC, "UTC")).toBeNull();
  });
});

describe("extractDeadline (time zone awareness)", () => {
  // Regression case straight from the audit remediation brief: at
  // 2026-09-09T17:00:00Z it's already 2026-09-10 01:00 local in Manila
  // (UTC+8) — "tomorrow" must mean the *local* Sep 11, not a UTC-derived
  // Sep 10. A naive UTC-only implementation gives 2026-09-10T00:00:00.000Z
  // here instead — this test fails against that bug.
  it("resolves 'tomorrow' against the local calendar day in Asia/Manila, not the UTC calendar day", () => {
    const result = extractDeadline("I'll send it tomorrow.", "2026-09-09T17:00:00.000Z", "Asia/Manila");
    expect(result?.dueAt).toBe("2026-09-10T16:00:00.000Z");
  });

  it("resolves 'today' against the local calendar day in America/Los_Angeles", () => {
    // 2026-01-05T06:00:00Z is still 2026-01-04 22:00 local in Los Angeles (UTC-8, winter/PST).
    const result = extractDeadline("Send it today.", "2026-01-05T06:00:00.000Z", "America/Los_Angeles");
    expect(result?.dueAt).toBe("2026-01-04T08:00:00.000Z");
  });

  it("resolves 'by end of day' against the local calendar day in America/Los_Angeles", () => {
    const result = extractDeadline("Send it by end of day.", "2026-01-05T06:00:00.000Z", "America/Los_Angeles");
    expect(result?.dueAt).toBe("2026-01-05T07:59:59.999Z");
  });

  it("resolves a weekday name against the local calendar day in America/Los_Angeles", () => {
    // Local today is Sunday 2026-01-04; the nearest Friday is 2026-01-09.
    const result = extractDeadline("Let's revisit on Friday.", "2026-01-05T06:00:00.000Z", "America/Los_Angeles");
    expect(result?.dueAt).toBe("2026-01-09T08:00:00.000Z");
  });

  it("produces different UTC instants for the same phrase and now in two different zones", () => {
    const manila = extractDeadline("Send it tomorrow.", NOW_UTC, "Asia/Manila");
    const losAngeles = extractDeadline("Send it tomorrow.", NOW_UTC, "America/Los_Angeles");
    expect(manila?.dueAt).not.toBe(losAngeles?.dueAt);
  });
});

describe("extractDeadline (invalid calendar dates are never invented)", () => {
  it("does not roll September 31 into October", () => {
    const result = extractDeadline("Due September 31.", NOW_UTC, "UTC");
    expect(result?.phrase.toLowerCase()).toContain("september 31");
    expect(result?.dueAt).toBeNull();
  });

  it("does not roll April 31 into May", () => {
    const result = extractDeadline("Due April 31.", NOW_UTC, "UTC");
    expect(result?.dueAt).toBeNull();
  });

  it("does not roll February 30 into March", () => {
    const result = extractDeadline("Due February 30.", NOW_UTC, "UTC");
    expect(result?.dueAt).toBeNull();
  });

  it("resolves February 29 when the reference year itself is a leap year", () => {
    // 2028 is a leap year, and Feb 29 hasn't passed yet relative to Jan 5 2028.
    const result = extractDeadline("Due February 29.", "2028-01-05T00:00:00.000Z", "UTC");
    expect(result?.dueAt).toBe("2028-02-29T00:00:00.000Z");
  });

  it("does not resolve February 29 relative to a non-leap year", () => {
    // Reference now is late Feb 2027 (not a leap year); the next Feb 29 candidate year (2027) doesn't have one.
    const result = extractDeadline("Due February 29.", "2027-02-20T00:00:00.000Z", "UTC");
    expect(result?.dueAt).toBeNull();
  });

  it("preserves the raw phrase even when the date is invalid", () => {
    const result = extractDeadline("Due September 31.", NOW_UTC, "UTC");
    expect(result?.phrase).not.toBeNull();
    expect(result?.dueAt).toBeNull();
  });
});
