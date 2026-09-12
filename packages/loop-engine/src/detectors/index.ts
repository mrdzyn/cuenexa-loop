import { detectCommitment } from "./commitment.js";
import { detectDecision } from "./decision.js";
import { detectDelegation } from "./delegation.js";
import { detectFollowUp } from "./follow-up.js";
import { detectOpenQuestion } from "./open-question.js";
import type { DetectorMatch } from "./types.js";

const DETECTORS = [detectCommitment, detectDecision, detectDelegation, detectFollowUp, detectOpenQuestion];

/**
 * Runs every Phase 1A detector against a single sentence and returns at
 * most one match — a sentence never produces more than one candidate,
 * even where more than one detector's pattern could in principle match.
 * Delegation precedes generic follow-up so direct-address assignments
 * retain their owner. Commitment and follow-up remain mutually exclusive
 * because commitment explicitly defers follow-up action phrases.
 */
export function detectSentence(sentence: string): DetectorMatch | null {
  for (const detector of DETECTORS) {
    const match = detector(sentence);
    if (match) {
      return match;
    }
  }
  return null;
}

export { detectCommitment, detectDecision, detectDelegation, detectFollowUp, detectOpenQuestion };
export type { DetectorMatch } from "./types.js";
