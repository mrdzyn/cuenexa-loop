import { jaccardSimilarity } from "./text-utils.js";
import type { DetectionCandidate } from "./types.js";

/**
 * A completed Bee Todo's text, kept only long enough to check whether it
 * matches — and should therefore suppress — an otherwise-still-open
 * candidate. A completion signal never becomes a `LoopItem` itself: Bee
 * marking something done is a completion signal, not a new unfinished
 * item to surface. See docs/LOOP-DETECTION.md ("Completion reconciliation").
 */
export interface CompletionSignal {
  todoId: string;
  text: string;
}

/**
 * Same threshold and comparison approach as within-snapshot deduplication
 * (dedup.ts) — this is the same "same action?" judgment, just applied
 * against a completion signal instead of another open candidate.
 */
const RECONCILIATION_SIMILARITY_THRESHOLD = 0.7;

function candidateText(candidate: DetectionCandidate): string {
  return candidate.evidence.map((evidence) => evidence.text).join(" ");
}

/**
 * Drops any candidate whose evidence text conservatively matches a
 * completed Bee Todo. CueNexa Loop's purpose is surfacing what remains
 * *unfinished* — a conversation commitment ("I'll send the estimate
 * tomorrow.") whose matching Todo has already been marked done should not
 * still appear as an open item just because the conversation-side
 * candidate doesn't know that. Only a conservative match suppresses;
 * unrelated completed todos never affect unrelated open candidates.
 */
export function reconcileCompletions(
  candidates: DetectionCandidate[],
  completions: CompletionSignal[],
): DetectionCandidate[] {
  if (completions.length === 0) {
    return candidates;
  }

  return candidates.filter((candidate) => {
    const text = candidateText(candidate);
    return !completions.some((completion) => jaccardSimilarity(text, completion.text) >= RECONCILIATION_SIMILARITY_THRESHOLD);
  });
}
