import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import { correlateLoopItems, detectLoopItems } from "@cuenexa-loop/loop-engine";
import type { LoopCorrelationResult, LoopDetectionResult } from "@cuenexa-loop/loop-engine";

export interface CorrelationPipelineResult {
  readonly detection: LoopDetectionResult;
  readonly correlation: LoopCorrelationResult;
}

/** CLI-owned composition of the provider adapter snapshot and provider-independent engine. */
export function detectAndCorrelateSnapshot(
  snapshot: BeeSnapshot,
  now: string,
  timeZone: string,
): CorrelationPipelineResult {
  const detection = detectLoopItems({
    conversations: snapshot.conversations,
    facts: snapshot.facts,
    todos: snapshot.todos,
    now,
    timeZone,
  });
  const completeness = snapshot.warnings.length > 0 || detection.warnings.length > 0 ? "partial" : "complete";
  const correlation = correlateLoopItems({
    items: detection.items,
    conversations: snapshot.conversations,
    facts: snapshot.facts,
    todos: snapshot.todos,
    now,
    snapshot: { observedAt: now, completeness },
  });
  return { detection, correlation };
}
