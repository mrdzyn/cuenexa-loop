import type { LoopConversation } from "@cuenexa-loop/contracts";
import { MINIMUM_LOOP_CORRELATION_CONFIDENCE } from "../loop-types.js";
import { normalizeForComparison } from "../text-utils.js";
import type { LoopItem } from "../types.js";
import { evaluatePairEligibility } from "./eligibility.js";
import { deriveItemOccurrence } from "./occurrence.js";
import { CorrelationScoreResultSchema } from "./types.js";
import type { CorrelationScoreResult } from "./types.js";

export const CORRELATION_SCORE_WEIGHTS = Object.freeze({
  sharedSpecificAnchorPhrase: 0.65,
  sharedSpecificToken: 0.1,
  maximumSharedSpecificTokens: 2,
  compatibleItemFamily: 0.1,
  chronologicalContinuation: 0.05,
  matchingDueDate: 0.05,
  matchingOwner: 0.05,
});

export const CORRELATION_CONTINUATION_WINDOW_DAYS = 30;
const CONTINUATION_WINDOW_MS = CORRELATION_CONTINUATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface CorrelationScoringContext {
  readonly conversations?: readonly LoopConversation[];
}

/**
 * Scores a pair only after Phase 1B.2 hard eligibility. Confidence is a
 * transparent deterministic heuristic score, not probability or certainty.
 */
export function scoreCorrelationPair(
  a: LoopItem,
  b: LoopItem,
  context: CorrelationScoringContext = {},
): CorrelationScoreResult {
  const eligibility = evaluatePairEligibility(a, b);
  const conversations = context.conversations ?? [];
  const chronologicalContinuation = hasChronologicalContinuation(a, b, conversations);
  const matchingDueDate = a.dueAt !== null && b.dueAt !== null && a.dueAt === b.dueAt;
  const matchingOwner = hasMatchingOwner(a, b);
  const supportingSignals = { chronologicalContinuation, matchingDueDate, matchingOwner };

  if (!eligibility.eligible) {
    return CorrelationScoreResultSchema.parse({
      ...eligibility,
      accepted: false,
      confidence: 0,
      supportingSignals,
    });
  }

  let confidence = 0;
  if (eligibility.hasSharedSpecificAnchorPhrase) {
    confidence += CORRELATION_SCORE_WEIGHTS.sharedSpecificAnchorPhrase;
  }
  confidence +=
    Math.min(eligibility.sharedSpecificAnchorCount, CORRELATION_SCORE_WEIGHTS.maximumSharedSpecificTokens) *
    CORRELATION_SCORE_WEIGHTS.sharedSpecificToken;
  if (eligibility.reasonCodes.includes("same_action_family") || eligibility.reasonCodes.includes("decision_to_action")) {
    confidence += CORRELATION_SCORE_WEIGHTS.compatibleItemFamily;
  }

  const reasonCodes = [...eligibility.reasonCodes];
  if (chronologicalContinuation) {
    confidence += CORRELATION_SCORE_WEIGHTS.chronologicalContinuation;
    reasonCodes.push("chronological_continuation");
  }
  if (matchingDueDate) {
    confidence += CORRELATION_SCORE_WEIGHTS.matchingDueDate;
    reasonCodes.push("matching_due_date");
  }
  if (matchingOwner) {
    confidence += CORRELATION_SCORE_WEIGHTS.matchingOwner;
    reasonCodes.push("matching_owner");
  }

  confidence = Math.min(1, Number(confidence.toFixed(2)));
  return CorrelationScoreResultSchema.parse({
    ...eligibility,
    accepted: confidence >= MINIMUM_LOOP_CORRELATION_CONFIDENCE,
    confidence,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    supportingSignals,
  });
}

function hasMatchingOwner(a: LoopItem, b: LoopItem): boolean {
  if (!a.owner || !b.owner) {
    return false;
  }
  const first = normalizeForComparison(a.owner.label);
  const second = normalizeForComparison(b.owner.label);
  return first.length > 0 && first === second;
}

function hasChronologicalContinuation(
  a: LoopItem,
  b: LoopItem,
  conversations: readonly LoopConversation[],
): boolean {
  const first = deriveItemOccurrence(a, conversations).occurredAt;
  const second = deriveItemOccurrence(b, conversations).occurredAt;
  if (!first || !second) {
    return false;
  }
  return Math.abs(Date.parse(first) - Date.parse(second)) <= CONTINUATION_WINDOW_MS;
}
