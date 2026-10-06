import { describe, expect, it } from "vitest";
import { resolveHostTimeZone } from "../timezone.js";

describe("resolveHostTimeZone", () => {
  it("prefers a valid LOOP_TIMEZONE override", () => {
    expect(
      resolveHostTimeZone({
        beeTimeZone: "America/Los_Angeles",
        env: { LOOP_TIMEZONE: "Asia/Manila" },
        systemTimeZone: () => "UTC",
      }),
    ).toBe("Asia/Manila");
  });

  it("ignores an invalid override and uses Bee timezone", () => {
    expect(
      resolveHostTimeZone({
        beeTimeZone: "America/New_York",
        env: { LOOP_TIMEZONE: "Not/AZone" },
        systemTimeZone: () => "Europe/London",
      }),
    ).toBe("America/New_York");
  });

  it("falls back to the system timezone", () => {
    expect(
      resolveHostTimeZone({
        beeTimeZone: null,
        env: {},
        systemTimeZone: () => "Pacific/Auckland",
      }),
    ).toBe("Pacific/Auckland");
  });
});
