/**
 * Detects an explicit first-person commitment negation ("I won't...",
 * "I will not...", "I'll not..."). This is intentionally narrow rather
 * than a general negation detector: "I won't send it" never matches the
 * positive commitment trigger pattern in the first place ("won't" isn't
 * "will"), so the only case that needs an explicit guard is when the
 * modal verb itself is present but followed by "not" — "I will not send
 * it" would otherwise match the positive pattern.
 *
 * Phase 1A does not attempt cross-utterance retraction reasoning (a later
 * "actually, don't send it yet" correctly produces no commitment on its
 * own, since imperative "don't X" never matches the positive commitment
 * pattern either) — see docs/LOOP-DETECTION.md ("Limitations").
 */
const NEGATED_COMMITMENT_PATTERN = /\bi\s+won'?t\b|\bi(?:'ll|\s+will)\s+not\b/i;

export function hasCommitmentNegation(text: string): boolean {
  return NEGATED_COMMITMENT_PATTERN.test(text);
}
