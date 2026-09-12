import type { LoopConversation, LoopFact, LoopTodo } from "@cuenexa-loop/contracts";
import { candidateFromTodo, candidatesFromConversation, candidatesFromFact, completionSignalFromTodo } from "./candidate-builder.js";
import type { CompletionSignal } from "./completion.js";
import { reconcileCompletions } from "./completion.js";
import { SUPPRESSION_THRESHOLD } from "./confidence.js";
import { deduplicateCandidates } from "./dedup.js";
import { nextLoopItemId } from "./id.js";
import { LoopItemSchema } from "./types.js";
import type { DetectionCandidate, DetectionContext, DetectionWarning, LoopItem } from "./types.js";

export interface LoopDetectionInput {
  conversations: LoopConversation[];
  facts: LoopFact[];
  todos: LoopTodo[];
  /** Reference instant (ISO 8601) used to resolve relative deadline phrases and to stamp `createdAt`. */
  now: string;
  /**
   * IANA time zone ("Asia/Manila", "America/Los_Angeles", ...) that
   * calendar phrases ("today", "tomorrow", weekday names, "by end of
   * day") are resolved against. Callers should supply Bee's own account
   * time zone where available, falling back to the local system's IANA
   * time zone — never silently assume UTC. See
   * docs/LOOP-DETECTION.md ("Timezone-aware deadline resolution").
   */
  timeZone: string;
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
 * the full pipeline (candidate -> dedup -> completion reconciliation ->
 * confidence filter -> LoopItem) and the detection philosophy behind
 * each type.
 */
export function detectLoopItems(input: LoopDetectionInput): LoopDetectionResult {
  const warnings: DetectionWarning[] = [];
  const candidates: DetectionCandidate[] = [];
  const completions: CompletionSignal[] = [];
  const context: DetectionContext = { now: input.now, timeZone: input.timeZone };

  for (const conversation of input.conversations) {
    candidates.push(...candidatesFromConversation(conversation, context, warnings));
  }
  for (const fact of input.facts) {
    candidates.push(...candidatesFromFact(fact, context, warnings));
  }
  for (const todo of input.todos) {
    if (todo.status === "completed") {
      const signal = completionSignalFromTodo(todo, warnings);
      if (signal) {
        completions.push(signal);
      }
      continue;
    }
    if (todo.status !== "open") {
      continue;
    }
    const candidate = candidateFromTodo(todo, context, warnings);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const deduplicated = deduplicateCandidates(candidates);
  const reconciled = reconcileCompletions(deduplicated, completions);

  const accepted = reconciled.filter((candidate) => {
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
