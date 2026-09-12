import { CONFIDENCE } from "../confidence.js";
import { hasCommitmentNegation } from "../negation.js";
import { deriveFirstPersonActionText } from "../text-utils.js";
import { COMMITMENT_TRIGGER_PATTERN, FOLLOW_UP_VERB_PATTERN, HEDGE_PATTERN } from "./patterns.js";
import type { DetectorMatch } from "./types.js";

/**
 * Detects an explicit first-person commitment ("I'll...", "I will...",
 * "I can send/do/handle/take care of/..."). Returns null for hedged
 * ("maybe", "might") or negated ("I won't...") language, and for a
 * sentence that also carries an explicit follow-up verb — that case is
 * `detectFollowUp`'s to classify instead, so a single sentence never
 * produces both a commitment and a follow-up item for the same action
 * (see docs/LOOP-DETECTION.md, "Follow-up vs. commitment precedence").
 */
export function detectCommitment(sentence: string): DetectorMatch | null {
  if (hasCommitmentNegation(sentence)) {
    return null;
  }
  if (HEDGE_PATTERN.test(sentence)) {
    return null;
  }
  if (!COMMITMENT_TRIGGER_PATTERN.test(sentence)) {
    return null;
  }
  if (FOLLOW_UP_VERB_PATTERN.test(sentence)) {
    return null;
  }

  return {
    type: "commitment",
    text: deriveFirstPersonActionText(sentence),
    confidence: CONFIDENCE.EXPLICIT_COMMITMENT,
    owner: null,
    counterparties: [],
  };
}
