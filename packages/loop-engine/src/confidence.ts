/**
 * Deterministic heuristic detection confidence constants, 0.0-1.0. These
 * are not calibrated ML probabilities — they encode a fixed ranking of
 * "how explicit was the structural/linguistic signal," per the rough
 * bands in docs/LOOP-DETECTION.md:
 *
 *   0.90-1.00  explicit Bee Todo / explicit first-person commitment
 *   0.80-0.89  strong explicit linguistic signal (decision, delegation)
 *   0.70-0.79  moderately clear signal (follow-up, open question)
 *   below 0.70 suppressed from default output entirely
 */
export const CONFIDENCE = {
  BEE_TODO_OPEN: 0.95,
  EXPLICIT_COMMITMENT: 0.9,
  EXPLICIT_DECISION: 0.85,
  EXPLICIT_DELEGATION: 0.85,
  EXPLICIT_FOLLOW_UP: 0.78,
  EXPLICIT_OPEN_QUESTION: 0.75,
} as const;

/** Candidates below this confidence are dropped before becoming LoopItems. */
export const SUPPRESSION_THRESHOLD = 0.7;
