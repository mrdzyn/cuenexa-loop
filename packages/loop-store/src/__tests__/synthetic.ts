import { createStableLoopId, type Loop, type LoopItem } from "@cuenexa-loop/loop-engine";

export const TEST_NOW = "2026-01-01T12:00:00.000Z";

export function syntheticItem(id: string, dueAt: string | null = null): LoopItem {
  return {
    id,
    type: "commitment",
    text: "Synthetic action",
    state: "open",
    confidence: 0.95,
    owner: null,
    counterparties: [],
    dueAt,
    dueAtPhrase: null,
    source: { provider: "test", conversationId: `conversation-${id}`, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: `conversation-${id}`, text: `synthetic evidence ${id}` }],
    createdAt: TEST_NOW,
    resolvedAt: null,
  };
}

export function syntheticLoop(items: LoopItem[], state: Loop["state"] = "open"): Loop {
  return {
    id: createStableLoopId(items),
    title: "Synthetic project",
    state,
    members: items.map((item) => ({ itemId: item.id, item })),
    timeline: items.map((item, sequence) => ({
      itemId: item.id,
      source: item.source,
      occurredAt: null,
      timestampSource: "unavailable",
      sequence,
    })),
    correlationLinks: [{
      fromItemId: items[0]!.id,
      toItemId: items[1]!.id,
      confidence: 0.95,
      reasonCodes: ["shared_specific_anchor_phrase"],
      sharedSpecificAnchorCount: 2,
    }],
    correlationConfidence: 0.95,
    snapshot: { observedAt: TEST_NOW, completeness: "complete" },
    resolvedAt: state === "resolved" ? TEST_NOW : null,
  };
}

export function seedThread(store: import("../store.js").LoopStore, state: Loop["state"] = "open"): string {
  const result = store.reconcile({
    loops: [syntheticLoop([syntheticItem("a"), syntheticItem("b")], state)],
    observedAt: TEST_NOW,
    complete: true,
  });
  return result.threads[0]!.id;
}
