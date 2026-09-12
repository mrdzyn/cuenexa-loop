/**
 * Detects explicit commitment negation for a given subject, allowing a
 * short adverbial gap between the modal verb and the negator: "I will
 * not...", "I will definitely not...", "I will never...", "I won't...".
 * The gap is capped at two words specifically so this stays a narrow,
 * deterministic pattern rather than drifting toward general negation-
 * scope detection — "Do not implement general NLP negation" per the
 * Phase 1A brief. A known false-positive this accepts as a documented
 * limitation: idiomatic "not only X but also Y" would still trigger it.
 * See docs/LOOP-DETECTION.md ("Limitations").
 */
function buildWillNegationPattern(subjectPattern: string): RegExp {
  return new RegExp(
    `\\b${subjectPattern}\\s+won'?t\\b|\\b${subjectPattern}(?:'ll|\\s+will)\\s+(?:\\w+\\s+){0,2}(?:not|never)\\b`,
    "i",
  );
}

const FIRST_PERSON_NEGATION_PATTERN = buildWillNegationPattern("i");

/**
 * First-person commitment/follow-up negation: "I won't...", "I will
 * not...", "I will definitely not...", "I will never...", "I'll
 * never...". Used by both `detectCommitment` and `detectFollowUp` — a
 * negated commitment is never reclassified as a negated follow-up, it's
 * simply not detected as either.
 */
export function hasCommitmentNegation(text: string): boolean {
  return FIRST_PERSON_NEGATION_PATTERN.test(text);
}

const NEGATED_CONTINUATION_PATTERN = /^(?:\w+\s+){0,2}(?:not|never)\b/i;

/**
 * True when `remainder` (the text immediately following a "<Name> will"
 * trigger) starts with a negator within the same short adverbial-gap
 * allowance as `hasCommitmentNegation` — used by `detectDelegation` so
 * "Sarah will not prepare the report." isn't misread as delegating the
 * report to Sarah.
 */
export function isNegatedContinuation(remainder: string): boolean {
  return NEGATED_CONTINUATION_PATTERN.test(remainder.trim());
}
