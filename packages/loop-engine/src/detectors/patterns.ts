/**
 * Shared regex triggers used by more than one detector, kept in one place
 * so the commitment/follow-up precedence rule (see follow-up.ts) stays
 * consistent by construction rather than by two detectors' patterns
 * happening to agree.
 */

/** Hedging/uncertainty language that downgrades an otherwise-explicit commitment or decision to "not firm enough". */
export const HEDGE_PATTERN = /\b(maybe|perhaps|possibly|might|could\s+possibly|we\s+should\s+consider)\b/i;

/** An explicit first-person future commitment trigger: "I'll", "I will", or "I can <action verb>". */
export const COMMITMENT_TRIGGER_PATTERN =
  /\bi(?:'ll|\s+will)\b|\bi\s+can\s+(?:send|do|handle|take\s+care\s+of|follow\s+up|get|finish|complete|prepare|deliver|check)\b/i;

/** Explicit follow-up verbs/phrases, independent of who the subject is. */
export const FOLLOW_UP_VERB_PATTERN = /\bcheck\s+back\b|\bcheck\s+in\b|\bcheck\s+with\b|\bcircle\s+back\b|\brevisit\b|\bfollow\s+up\b/i;

/** Explicit, finalized-decision language — deliberately excludes proposal/brainstorming phrasing (handled via HEDGE_PATTERN). */
export const DECISION_PATTERN =
  /\bwe'?re\s+going\s+with\b|\bwe\s+decided\s+to\b|\blet'?s\s+proceed\s+with\b|\bwe'?ll\s+proceed\s+with\b|\bwe'?re\s+moving\s+forward\s+with\b|\b(?:date|deadline|launch)\b.{0,25}\bwill\s+be\b/i;
