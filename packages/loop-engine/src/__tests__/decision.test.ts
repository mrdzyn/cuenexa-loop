import { describe, expect, it } from "vitest";
import { detectDecision } from "../detectors/decision.js";

describe("detectDecision", () => {
  it("detects an explicit 'going with' decision", () => {
    const match = detectDecision("We're going with Cloudflare.");
    expect(match?.type).toBe("decision");
  });

  it("detects an explicit 'decided to' decision", () => {
    expect(detectDecision("We decided to postpone the rollout.")).not.toBeNull();
  });

  it("detects an explicit 'let's proceed with' decision", () => {
    expect(detectDecision("Let's proceed with option B.")).not.toBeNull();
  });

  it("detects an explicit date-setting decision", () => {
    expect(detectDecision("The launch date will be October 15.")).not.toBeNull();
  });

  it("does not treat a hedged proposal as a decision", () => {
    expect(detectDecision("Maybe we should use Cloudflare.")).toBeNull();
    expect(detectDecision("We should consider going with Cloudflare.")).toBeNull();
    expect(detectDecision("Perhaps we're going with Cloudflare.")).toBeNull();
  });

  it("does not match unrelated sentences", () => {
    expect(detectDecision("I like the new office layout.")).toBeNull();
  });
});
