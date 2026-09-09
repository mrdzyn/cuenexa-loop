import { detectCommitment } from "./commitment.js";
import { detectDecision } from "./decision.js";
import { detectDelegation } from "./delegation.js";
import { detectFollowUp } from "./follow-up.js";
import { detectOpenQuestion } from "./open-question.js";
import type { DetectorMatch } from "./types.js";

const DETECTORS = [detectCommitment, detectFollowUp, detectDecision, detectDelegation, detectOpenQuestion];

/**
 * Runs every Phase 1A detector against a single sentence and returns at
 * most one match — a sentence never produces more than one candidate,
 * even where more than one detector's pattern could in principle match.
 * (In practice `detectCommitment` and `detectFollowUp` are mutually
 * exclusive by construction; the fixed order here just documents the
 * intended precedence rather than depending on that being coincidental.)
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
