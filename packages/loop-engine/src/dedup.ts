import { tokenize } from "./text-utils.js";
import type { DetectionCandidate, LoopSource } from "./types.js";

/**
 * Fraction of overlapping tokens (Jaccard-style) above which two
 * candidates are treated as the same action. Deliberately conservative:
 * short action sentences share a lot of boilerplate ("I'll send the ___
 * tomorrow"), so a looser threshold merges genuinely different actions
 * (e.g. "send the estimate" and "send the invoice" measure ~0.6 overlap
 * against each other) while the true positive this exists for — a
 * conversation commitment and its matching Bee Todo, which typically
 * differ only by the todo lacking a leading "I'll" — measures ~0.75. See
 * the regression tests in __tests__/dedup.test.ts.
 */
const SIMILARITY_MERGE_THRESHOLD = 0.7;

/** The text used for similarity comparison is each candidate's raw evidence text, not its cleaned display text. */
function comparisonText(candidate: DetectionCandidate): string {
  return candidate.evidence.map((evidence) => evidence.text).join(" ");
}

function similarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Two candidates are only eligible to merge if they could plausibly be
 * "the same snapshot", not "the same conversation happened twice
 * independently": candidates from two *different* named conversations
 * never merge, even if their text is identical — that's cross-conversation
 * correlation, explicitly out of scope for Phase 1A (belongs to Phase
 * 1B). A todo or fact (no conversationId of its own) can still merge with
 * a conversation-sourced candidate, since that's the same-task-different-
 * evidence-source case this function exists to catch.
 */
function eligibleToMerge(a: DetectionCandidate, b: DetectionCandidate): boolean {
  const aConversationId = a.source.conversationId;
  const bConversationId = b.source.conversationId;
  if (aConversationId && bConversationId && aConversationId !== bConversationId) {
    return false;
  }
  return true;
}

/**
 * Merges candidates whose source text overlaps enough to represent the
 * same underlying action — most commonly a conversation commitment and a
 * matching Bee Todo for the same task. Deterministic, token-overlap
 * based, and within-snapshot only: no cross-conversation matching (see
 * `eligibleToMerge`), no embeddings. See docs/LOOP-DETECTION.md
 * ("Deduplication").
 */
export function deduplicateCandidates(candidates: DetectionCandidate[]): DetectionCandidate[] {
  const merged: DetectionCandidate[] = [];

  for (const candidate of candidates) {
    const existingIndex = merged.findIndex(
      (existing) =>
        eligibleToMerge(existing, candidate) &&
        similarity(comparisonText(existing), comparisonText(candidate)) >= SIMILARITY_MERGE_THRESHOLD,
    );

    if (existingIndex === -1) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[existingIndex];
    if (existing) {
      merged[existingIndex] = mergeCandidates(existing, candidate);
    }
  }

  return merged;
}

function mergeCandidates(a: DetectionCandidate, b: DetectionCandidate): DetectionCandidate {
  const primary = a.confidence >= b.confidence ? a : b;
  const secondary = primary === a ? b : a;

  return {
    ...primary,
    confidence: Math.max(a.confidence, b.confidence),
    dueAt: primary.dueAt ?? secondary.dueAt,
    dueAtPhrase: primary.dueAtPhrase ?? secondary.dueAtPhrase,
    owner: primary.owner ?? secondary.owner,
    counterparties: primary.counterparties.length > 0 ? primary.counterparties : secondary.counterparties,
    source: mergeSources(primary.source, secondary.source),
    evidence: [...primary.evidence, ...secondary.evidence],
  };
}

function mergeSources(a: LoopSource, b: LoopSource): LoopSource {
  return {
    provider: a.provider,
    conversationId: a.conversationId ?? b.conversationId,
    factId: a.factId ?? b.factId,
    todoId: a.todoId ?? b.todoId,
    utteranceIndexes: [...new Set([...a.utteranceIndexes, ...b.utteranceIndexes])].sort((x, y) => x - y),
  };
}
