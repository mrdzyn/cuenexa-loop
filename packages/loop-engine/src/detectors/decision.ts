import { CONFIDENCE } from "../confidence.js";
import { capitalizeFirst, stripTrailingPunctuation } from "../text-utils.js";
import { DECISION_PATTERN, HEDGE_PATTERN } from "./patterns.js";
import type { DetectorMatch } from "./types.js";

/**
 * Detects an explicit, finalized decision ("We're going with...", "We
 * decided to...", "Let's proceed with...", or a date/deadline-setting
 * statement like "The launch date will be October 15."). Returns null for
 * hedged proposal/brainstorming language ("maybe we should use...", "we
 * should consider...") even if the rest of the sentence would otherwise
 * match — a proposal is not a decision.
 */
export function detectDecision(sentence: string): DetectorMatch | null {
  if (HEDGE_PATTERN.test(sentence)) {
    return null;
  }
  if (!DECISION_PATTERN.test(sentence)) {
    return null;
  }

  return {
    type: "decision",
    text: capitalizeFirst(stripTrailingPunctuation(sentence).trim()),
    confidence: CONFIDENCE.EXPLICIT_DECISION,
    owner: null,
    counterparties: [],
  };
}
