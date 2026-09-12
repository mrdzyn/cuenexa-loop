import { createHash } from "node:crypto";
import { normalizeForComparison } from "./text-utils.js";
import type { LoopItem } from "./types.js";

/**
 * Produces a snapshot-local Loop identity from stable source identifiers
 * only. Text, parties, timestamps, and Phase 1A's run-local item id are
 * deliberately excluded so the identifier cannot expose private content or
 * change merely because detection ran again.
 */
export function createStableLoopId(items: readonly LoopItem[]): string {
  // Deliberately preserve duplicates: two independently detected items can
  // have the same source identifiers, and membership cardinality is part of
  // a Loop's identity.
  const canonicalMembers = items.map(createStableMemberIdentity).sort();
  const digest = createHash("sha256").update(JSON.stringify(canonicalMembers)).digest("hex").slice(0, 24);
  return `loop_${digest}`;
}

/**
 * Stable, privacy-safe identity for a Phase 1A member. Phase 1A stores an
 * utterance index but not sentence position, so source IDs alone cannot
 * distinguish two detected sentences in the same utterance. A SHA-256
 * digest of normalized evidence text supplies that discriminator. Only the
 * digest enters this value and the eventual Loop ID; no raw evidence,
 * names, owners, timestamps, or run-local item IDs are retained or output.
 */
export function createStableMemberIdentity(item: LoopItem): string {
  const source = item.source;
  const evidenceReferences = item.evidence
    .map((evidence) => ({
      type: evidence.type,
      sourceId: evidence.sourceId,
      normalizedTextDigest: digest(normalizeForComparison(evidence.text)),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  const canonicalIdentity = {
    itemType: item.type,
    provider: source.provider,
    conversationId: source.conversationId,
    factId: source.factId,
    todoId: source.todoId,
    utteranceIndexes: [...source.utteranceIndexes].sort((a, b) => a - b),
    evidenceReferences,
  };
  return `member_${digest(JSON.stringify(canonicalIdentity))}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
