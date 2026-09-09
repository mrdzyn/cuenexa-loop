import type { LoopConversation, LoopFact, LoopTodo } from "@cuenexa-loop/contracts";
import { candidateFromTodo, candidatesFromConversation, candidatesFromFact } from "./candidate-builder.js";
import { SUPPRESSION_THRESHOLD } from "./confidence.js";
import { deduplicateCandidates } from "./dedup.js";
import { nextLoopItemId } from "./id.js";
import { LoopItemSchema } from "./types.js";
import type { DetectionCandidate, DetectionWarning, LoopItem } from "./types.js";

export interface LoopDetectionInput {
  conversations: LoopConversation[];
  facts: LoopFact[];
  todos: LoopTodo[];
  /** Reference instant (ISO 8601) used to resolve relative deadline phrases and to stamp `createdAt`. */
  now: string;
}

export interface LoopDetectionResult {
  items: LoopItem[];
  warnings: DetectionWarning[];
}

/**
 * Transforms normalized CueNexa Loop contracts into structured Loop
 * items: Bee -> Bee Adapter -> Normalized Contracts -> **Loop Detection
 * Engine** -> Structured Loop Items. Deterministic and local-only — no
 * LLM, no network call, no persistence. See docs/LOOP-DETECTION.md for
 * the full pipeline (candidate -> dedup -> confidence filter -> LoopItem)
 * and the detection philosophy behind each type.
 */
export function detectLoopItems(input: LoopDetectionInput): LoopDetectionResult {
  const warnings: DetectionWarning[] = [];
  const candidates: DetectionCandidate[] = [];

  for (const conversation of input.conversations) {
    candidates.push(...candidatesFromConversation(conversation, input.now, warnings));
  }
  for (const fact of input.facts) {
    candidates.push(...candidatesFromFact(fact, input.now, warnings));
  }
  for (const todo of input.todos) {
    const candidate = candidateFromTodo(todo, input.now, warnings);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const deduplicated = deduplicateCandidates(candidates);

  const accepted = deduplicated.filter((candidate) => {
    if (candidate.text.trim().length === 0) {
      warnings.push({ field: "text", message: "Dropped a candidate with no displayable text." });
      return false;
    }
    return candidate.confidence >= SUPPRESSION_THRESHOLD;
  });

  const items = accepted.map((candidate) => toLoopItem(candidate, input.now));

  return { items, warnings };
}

function toLoopItem(candidate: DetectionCandidate, now: string): LoopItem {
  return LoopItemSchema.parse({
    id: nextLoopItemId(),
    type: candidate.type,
    text: candidate.text,
    state: "open",
    confidence: candidate.confidence,
    owner: candidate.owner,
    counterparties: candidate.counterparties,
    dueAt: candidate.dueAt,
    dueAtPhrase: candidate.dueAtPhrase,
    source: candidate.source,
    evidence: candidate.evidence,
    createdAt: now,
    resolvedAt: null,
  });
}
