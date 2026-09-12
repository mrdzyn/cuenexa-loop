import { describe, expect, it } from "vitest";
import { runSyntheticRealtimeDemo } from "../realtime-demo.js";

describe("synthetic realtime demo", () => {
  it("shows provisional-to-authoritative handoff without duplicate durable state", () => {
    const result = runSyntheticRealtimeDemo(false);
    expect(result.threadsBeforeAuthoritativeHandoff).toBe(0);
    expect(result.threadsAfterAuthoritativeHandoff).toBe(1);
    expect(result.threadCreatedEvents).toBe(1);
    expect(result.notificationDeliveries).toBe(0);
    expect(result.output).toContain("PROVISIONAL");
    expect(result.output).toContain("Persistent threads after realtime only: 0");
    expect(result.output).toContain("Persistent threads after authoritative reconciliation and replay: 1");
    expect(result.output).toContain("Provisional signals remaining after confirmation: 0");
    expect(result.output).toContain("Private content printed: NO");
    expect(result.output).not.toContain("demo@example.com");
  });

  it("redacts the opted-in synthetic preview and derived title", () => {
    const output = runSyntheticRealtimeDemo(true).output;
    expect(output).toContain("[redacted-email]");
    expect(output).not.toContain("demo@example.com");
  });
});
