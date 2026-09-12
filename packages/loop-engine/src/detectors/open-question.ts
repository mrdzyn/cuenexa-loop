import { CONFIDENCE } from "../confidence.js";
import { capitalizeFirst } from "../text-utils.js";
import type { DetectorMatch } from "./types.js";

const RHETORICAL_TAG_PATTERN = /,\s*(right|isn't it|don't you think|correct)\s*\?$/i;
const RHETORICAL_START_PATTERN = /^(isn't|wasn't|aren't|weren't|doesn't|didn't)\b/i;

/**
 * Detects an explicit, unresolved question. Any sentence ending in "?" is
 * treated as an open question unless it matches a recognizable rhetorical
 * shape (a tag question like "..., right?", or a negative-polarity
 * opener like "Isn't that great?") — a deliberately conservative,
 * structural check, not an attempt at full rhetorical-question detection.
 */
export function detectOpenQuestion(sentence: string): DetectorMatch | null {
  const trimmed = sentence.trim();
  if (!trimmed.endsWith("?")) {
    return null;
  }
  if (RHETORICAL_TAG_PATTERN.test(trimmed) || RHETORICAL_START_PATTERN.test(trimmed)) {
    return null;
  }

  return {
    type: "open_question",
    text: capitalizeFirst(trimmed),
    confidence: CONFIDENCE.EXPLICIT_OPEN_QUESTION,
    owner: null,
    counterparties: [],
  };
}
