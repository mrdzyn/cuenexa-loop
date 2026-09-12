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
