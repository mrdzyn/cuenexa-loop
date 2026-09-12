import { createHash } from "node:crypto";
import type { LoopItem } from "./types.js";

/**
 * Produces a snapshot-local Loop identity from stable source identifiers
 * only. Text, parties, timestamps, and Phase 1A's run-local item id are
 * deliberately excluded so the identifier cannot expose private content or
 * change merely because detection ran again.
 */
export function createStableLoopId(items: readonly LoopItem[]): string {
  const canonicalMembers = [...new Set(items.map(stableMemberIdentity))].sort();
  const digest = createHash("sha256").update(JSON.stringify(canonicalMembers)).digest("hex").slice(0, 24);
  return `loop_${digest}`;
}

function stableMemberIdentity(item: LoopItem): string {
  const source = item.source;
  const evidenceReferences = item.evidence
    .map((evidence) => ({ type: evidence.type, sourceId: evidence.sourceId }))
    .sort((a, b) => `${a.type}:${a.sourceId ?? ""}`.localeCompare(`${b.type}:${b.sourceId ?? ""}`));

  return JSON.stringify({
    provider: source.provider,
    conversationId: source.conversationId,
    factId: source.factId,
    todoId: source.todoId,
    utteranceIndexes: [...source.utteranceIndexes].sort((a, b) => a - b),
    evidenceReferences,
  });
}
