import { describe, expect, it } from "vitest";
import { detectCommitment } from "../detectors/commitment.js";

describe("detectCommitment", () => {
  it("detects an explicit 'I'll' commitment and derives a clean action text", () => {
    const match = detectCommitment("I'll send the revised proposal tomorrow.");

    expect(match).not.toBeNull();
    expect(match?.type).toBe("commitment");
    expect(match?.text).toBe("Send the revised proposal tomorrow");
    expect(match?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detects an explicit 'I will' commitment", () => {
    const match = detectCommitment("I will take care of the deployment.");
    expect(match?.type).toBe("commitment");
  });

  it("detects 'I can <verb>' commitments", () => {
    expect(detectCommitment("I can send that over today.")).not.toBeNull();
    expect(detectCommitment("I can handle the client call.")).not.toBeNull();
  });

  it("does not treat hedged language as a firm commitment", () => {
    expect(detectCommitment("I might send the proposal tomorrow.")).toBeNull();
    expect(detectCommitment("Maybe I'll send the proposal tomorrow.")).toBeNull();
    expect(detectCommitment("Perhaps I could send it.")).toBeNull();
    expect(detectCommitment("I could possibly send it tomorrow.")).toBeNull();
    expect(detectCommitment("We should consider sending it.")).toBeNull();
  });

  it("does not treat a negated commitment as a commitment", () => {
    expect(detectCommitment("I won't send the proposal yet.")).toBeNull();
    expect(detectCommitment("I will not send the proposal yet.")).toBeNull();
  });

  it("does not match unrelated sentences", () => {
    expect(detectCommitment("The weather has been nice lately.")).toBeNull();
    expect(detectCommitment("Good morning everyone.")).toBeNull();
  });

  it("defers to the follow-up detector for explicit follow-up verbs", () => {
    // "I'll check back next week." should be classified as a follow-up, not a commitment.
    expect(detectCommitment("I'll check back next week.")).toBeNull();
  });
});
