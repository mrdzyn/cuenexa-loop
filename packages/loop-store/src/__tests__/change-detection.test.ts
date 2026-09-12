import { describe, expect, it } from "vitest";
import { createStableLoopId, type Loop, type LoopItem } from "@cuenexa-loop/loop-engine";
import { LoopStore } from "../store.js";

const FIRST = "2026-09-01T12:00:00.000Z";

function member(id: string, conversationId: string, dueAt: string | null): LoopItem {
  return {
    id, type: "commitment", text: "Synthetic", state: "open", confidence: 0.95, owner: null, counterparties: [], dueAt, dueAtPhrase: null,
    source: { provider: "test", conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text: `evidence-${id}` }], createdAt: FIRST, resolvedAt: null,
  };
}

function makeLoop(items: LoopItem[], state: Loop["state"] = "open"): Loop {
  return {
    id: createStableLoopId(items), title: "Synthetic title", state,
    members: items.map((item) => ({ itemId: item.id, item })),
    timeline: items.map((item, sequence) => ({ itemId: item.id, source: item.source, occurredAt: null, timestampSource: "unavailable", sequence })),
    correlationLinks: [{ fromItemId: items[0]!.id, toItemId: items[1]!.id, confidence: 0.95, reasonCodes: ["shared_specific_anchor_phrase"], sharedSpecificAnchorCount: 2 }],
    correlationConfidence: 0.95, snapshot: { observedAt: FIRST, completeness: "complete" }, resolvedAt: state === "resolved" ? FIRST : null,
  };
}

describe("deterministic Loop change events", () => {
  it("emits a due-date change once and remains argument-order stable", () => {
    const store = new LoopStore({ path: ":memory:" });
    const a = member("a", "a", "2026-09-03T12:00:00.000Z");
    const b = member("b", "b", "2026-09-03T12:00:00.000Z");
    const laterA = { ...a, dueAt: "2026-09-04T12:00:00.000Z" };
    const laterB = { ...b, dueAt: "2026-09-04T12:00:00.000Z" };
    store.reconcile({ loops: [makeLoop([a, b])], observedAt: FIRST, complete: true });
    const changed = store.reconcile({ loops: [makeLoop([laterB, laterA])], observedAt: "2026-09-02T12:00:00.000Z", complete: true });
    const repeated = store.reconcile({ loops: [makeLoop([laterA, laterB])], observedAt: "2026-09-03T12:00:00.000Z", complete: true });
    expect(changed.events.map((event) => event.type)).toContain("due_date_changed");
    expect(repeated.events).toEqual([]);
    store.close();
  });

  it("refuses weak, one-member overlap between unrelated threads", () => {
    const store = new LoopStore({ path: ":memory:" });
    const a = member("a", "a", null);
    const b = member("b", "b", null);
    const c = member("c", "c", null);
    const d = member("d", "d", null);
    store.reconcile({ loops: [makeLoop([a, b])], observedAt: FIRST, complete: true });
    const next = store.reconcile({ loops: [makeLoop([a, c, d])], observedAt: "2026-09-02T12:00:00.000Z", complete: true });
    expect(next.threads).toHaveLength(1);
    expect(store.listThreads()).toHaveLength(2);
    store.close();
  });
});
