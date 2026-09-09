import { describe, expect, it } from "vitest";
import { extractDeadline } from "../deadline.js";

// A fixed Monday reference instant so weekday math is deterministic.
const NOW = "2026-01-05T09:00:00.000Z"; // Monday

describe("extractDeadline", () => {
  it("resolves 'tomorrow' relative to now", () => {
    const result = extractDeadline("Send it tomorrow.", NOW);
    expect(result?.phrase.toLowerCase()).toBe("tomorrow");
    expect(result?.dueAt).toBe("2026-01-06T00:00:00.000Z");
  });

  it("resolves 'today' relative to now", () => {
    const result = extractDeadline("Send it today.", NOW);
    expect(result?.dueAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("resolves 'by end of day' to the end of the reference day", () => {
    const result = extractDeadline("Send it by end of day.", NOW);
    expect(result?.dueAt).toBe("2026-01-05T23:59:59.999Z");
  });

  it("resolves 'next week' to seven days out", () => {
    const result = extractDeadline("Let's revisit next week.", NOW);
    expect(result?.dueAt).toBe("2026-01-12T00:00:00.000Z");
  });

  it("resolves a bare weekday name to its nearest upcoming occurrence", () => {
    // NOW is a Monday; the nearest Friday is 4 days out.
    const result = extractDeadline("Let's revisit this on Friday.", NOW);
    expect(result?.dueAt).toBe("2026-01-09T00:00:00.000Z");
  });

  it("resolves an explicit month/day phrase", () => {
    const result = extractDeadline("The report is due September 15.", NOW);
    expect(result?.phrase.toLowerCase()).toContain("september 15");
    expect(result?.dueAt).toBe("2026-09-15T00:00:00.000Z");
  });

  it("rolls an already-passed month/day phrase to next year", () => {
    // NOW is January 2026; "March 1" without a year should resolve to 2026-03-01, not a past date.
    const result = extractDeadline("Due March 1.", "2026-06-01T00:00:00.000Z");
    expect(result?.dueAt).toBe("2027-03-01T00:00:00.000Z");
  });

  it("returns null when no recognizable temporal phrase is present", () => {
    expect(extractDeadline("Send the revised proposal.", NOW)).toBeNull();
  });
});
