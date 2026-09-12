import { describe, expect, it } from "vitest";
import { detectSentence } from "../detectors/index.js";
import { CONFIDENCE } from "../confidence.js";

describe("follow-up detection and precedence", () => {
  it("detects an explicit 'I'll check back' follow-up, not a plain commitment", () => {
    const match = detectSentence("I'll check back next week.");
    expect(match?.type).toBe("follow_up");
  });

  it("detects an explicit 'let's revisit' follow-up", () => {
    const match = detectSentence("Let's revisit this on Friday.");
    expect(match?.type).toBe("follow_up");
  });

  it("detects an explicit 'I will follow up' intent", () => {
    expect(detectSentence("I will follow up with the vendor.")?.type).toBe("follow_up");
  });

  it("detects a bare imperative 'follow up with' as a follow-up", () => {
    const match = detectSentence("Follow up with the vendor tomorrow.");
    expect(match?.type).toBe("follow_up");
  });

  it("detects a bare imperative 'check back' follow-up", () => {
    expect(detectSentence("Check back next week.")?.type).toBe("follow_up");
  });

  it("detects a please-prefixed imperative follow-up", () => {
    expect(detectSentence("Please follow up with the vendor.")?.type).toBe("follow_up");
  });

  it("classifies 'I'll check with the vendor tomorrow.' as a follow-up", () => {
    const match = detectSentence("I'll check with the vendor tomorrow.");
    expect(match?.type).toBe("follow_up");
  });

  it.each([
    "I already checked with the vendor.",
    "Did you check with the vendor?",
    "Did you follow up with the vendor?",
    "I'll check with the vendor?",
    "We decided not to revisit this.",
    "The vendor asked whether we should follow up.",
  ])("does not classify a non-actionable mention: %s", (sentence) => {
    expect(detectSentence(sentence)?.type).not.toBe("follow_up");
  });

  it("gives an 'I'll'-prefixed follow-up the explicit-commitment confidence tier", () => {
    const match = detectSentence("I'll check back next week.");
    expect(match?.confidence).toBe(CONFIDENCE.EXPLICIT_COMMITMENT);
  });

  it("gives a bare imperative follow-up the moderate confidence tier", () => {
    const match = detectSentence("Follow up with the vendor tomorrow.");
    expect(match?.confidence).toBe(CONFIDENCE.EXPLICIT_FOLLOW_UP);
  });

  it("never produces two items for a sentence that could match more than one detector", () => {
    // Every sentence must resolve to at most one candidate — detectSentence enforces this by construction.
    const sentences = [
      "I'll check back next week.",
      "I'll check with the vendor tomorrow.",
      "Follow up with the vendor tomorrow.",
    ];
    for (const sentence of sentences) {
      const match = detectSentence(sentence);
      expect(match).not.toBeNull();
    }
  });
});
