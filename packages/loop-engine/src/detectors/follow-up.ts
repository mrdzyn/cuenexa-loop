import { CONFIDENCE } from "../confidence.js";
import { hasCommitmentNegation } from "../negation.js";
import { deriveFirstPersonActionText } from "../text-utils.js";
import { COMMITMENT_TRIGGER_PATTERN, FOLLOW_UP_VERB_PATTERN, HEDGE_PATTERN } from "./patterns.js";
import type { DetectorMatch } from "./types.js";

/**
 * Detects an explicit follow-up intent ("I'll check back...", "Let's
 * revisit...", "Follow up with..."). When the sentence also carries an
 * explicit first-person commitment trigger ("I'll"/"I will"), the
 * explicit-commitment confidence tier is used — this is still a strong,
 * explicit self-commitment, just to a follow-up action specifically —
 * otherwise the plain follow-up (moderate) confidence tier applies.
 */
export function detectFollowUp(sentence: string): DetectorMatch | null {
  if (hasCommitmentNegation(sentence)) {
    return null;
  }
  if (HEDGE_PATTERN.test(sentence)) {
    return null;
  }
  if (!FOLLOW_UP_VERB_PATTERN.test(sentence)) {
    return null;
  }

  const hasCommitmentTrigger = COMMITMENT_TRIGGER_PATTERN.test(sentence);

  return {
    type: "follow_up",
    text: deriveFirstPersonActionText(sentence),
    confidence: hasCommitmentTrigger ? CONFIDENCE.EXPLICIT_COMMITMENT : CONFIDENCE.EXPLICIT_FOLLOW_UP,
    owner: null,
    counterparties: [],
  };
}
