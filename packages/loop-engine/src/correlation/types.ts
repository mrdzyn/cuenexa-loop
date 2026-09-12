import { z } from "zod";
import { LoopCorrelationReasonCodeSchema } from "../loop-types.js";

/** Explicit guard failures make rejected pairs auditable without exposing source text. */
export const PairEligibilityRejectionReasonCodeSchema = z.enum([
  "same_member",
  "missing_conversation_context",
  "same_conversation",
  "different_provider",
  "incompatible_item_families",
  "open_question_conservative",
  "decision_requires_strong_anchor",
  "no_shared_specific_anchors",
  "generic_language_only",
  "ineligible_item_state",
  "decision_action_chronology_required",
]);
export type PairEligibilityRejectionReasonCode = z.infer<typeof PairEligibilityRejectionReasonCodeSchema>;

/**
 * Phase 1B.2's pre-scoring result. It intentionally contains no final
 * numeric confidence and no raw anchor text; later phases may score only
 * pairs that pass these guards.
 */
export const PairEligibilityResultSchema = z.object({
  eligible: z.boolean(),
  reasonCodes: z.array(LoopCorrelationReasonCodeSchema),
  rejectionReasonCodes: z.array(PairEligibilityRejectionReasonCodeSchema),
  sharedSpecificAnchorCount: z.number().int().nonnegative(),
  hasSharedSpecificAnchorPhrase: z.boolean(),
});
export type PairEligibilityResult = z.infer<typeof PairEligibilityResultSchema>;

export const CorrelationSupportingSignalsSchema = z.object({
  chronologicalContinuation: z.boolean(),
  matchingDueDate: z.boolean(),
  matchingOwner: z.boolean(),
});
export type CorrelationSupportingSignals = z.infer<typeof CorrelationSupportingSignalsSchema>;

/** Explainable deterministic heuristic evaluation; confidence is not a probability. */
export const CorrelationScoreResultSchema = z.object({
  eligible: z.boolean(),
  accepted: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasonCodes: z.array(LoopCorrelationReasonCodeSchema),
  rejectionReasonCodes: z.array(PairEligibilityRejectionReasonCodeSchema),
  sharedSpecificAnchorCount: z.number().int().nonnegative(),
  hasSharedSpecificAnchorPhrase: z.boolean(),
  supportingSignals: CorrelationSupportingSignalsSchema,
});
export type CorrelationScoreResult = z.infer<typeof CorrelationScoreResultSchema>;
