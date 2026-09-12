import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStableLoopId, type Loop, type LoopItem } from "@cuenexa-loop/loop-engine";
import { LoopStore, resolveLoopStorePath, resolveRetentionDays } from "../store.js";

const FIRST = "2026-08-01T12:00:00.000Z";
const SECOND = "2026-08-02T12:00:00.000Z";

function item(id: string, conversationId: string, evidenceText: string, dueAt: string | null = null): LoopItem {
  return {
    id, type: "commitment", text: "Synthetic private item", state: "open", confidence: 0.95, owner: null, counterparties: [], dueAt,
    dueAtPhrase: dueAt ? "tomorrow" : null,
    source: { provider: "test", conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text: evidenceText }], createdAt: FIRST, resolvedAt: null,
  };
}

function loop(items: LoopItem[], state: Loop["state"] = "open", title: string | null = "Pricing deck"): Loop {
  return {
    id: createStableLoopId(items), title, state, members: items.map((entry) => ({ itemId: entry.id, item: entry })),
    timeline: items.map((entry, sequence) => ({ itemId: entry.id, source: entry.source, occurredAt: null, timestampSource: "unavailable", sequence })),
    correlationLinks: [{ fromItemId: items[0]!.id, toItemId: items[1]!.id, confidence: 0.95, reasonCodes: ["shared_specific_anchor_phrase"], sharedSpecificAnchorCount: 2 }],
    correlationConfidence: 0.95, snapshot: { observedAt: FIRST, completeness: "complete" }, resolvedAt: state === "resolved" ? FIRST : null,
  };
}

describe("LoopStore", () => {
  it("initializes idempotently and does not duplicate events or mutate timestamps on the same snapshot", () => {
    const store = new LoopStore({ path: ":memory:" });
    const candidate = loop([item("a", "a", "private evidence A"), item("b", "b", "private evidence B")]);
    const first = store.reconcile({ loops: [candidate], observedAt: FIRST, complete: true });
    const second = store.reconcile({ loops: [candidate], observedAt: SECOND, complete: true });
    expect(first.events.map((event) => event.type)).toEqual(["thread_created"]);
    expect(second.events).toEqual([]);
    expect(second.threads[0]?.updatedAt).toBe(FIRST);
    store.close();
  });

  it("keeps one thread when a snapshot Loop id changes through strong member expansion", () => {
    const store = new LoopStore({ path: ":memory:" });
    const a = item("a", "a", "evidence A");
    const b = item("b", "b", "evidence B");
    const c = item("c", "c", "evidence C");
    const first = store.reconcile({ loops: [loop([a, b])], observedAt: FIRST, complete: true });
    const second = store.reconcile({ loops: [loop([a, b, c])], observedAt: SECOND, complete: true });
    expect(second.threads[0]?.id).toBe(first.threads[0]?.id);
    expect(second.threads[0]?.memberIdentities).toHaveLength(3);
    expect(second.events.map((event) => event.type)).toContain("member_added");
    store.close();
  });

  it("never resolves based on an incomplete or absent snapshot", () => {
    const store = new LoopStore({ path: ":memory:" });
    const candidate = loop([item("a", "a", "A"), item("b", "b", "B")]);
    const first = store.reconcile({ loops: [candidate], observedAt: FIRST, complete: true });
    store.reconcile({ loops: [], observedAt: SECOND, complete: false });
    expect(store.getThread(first.threads[0]!.id)?.state).toBe("open");
    store.close();
  });

  it("records state, due, reopen and resolved transitions without source evidence", () => {
    const store = new LoopStore({ path: ":memory:" });
    const a = item("a", "a", "evidence A", "2026-08-03T12:00:00.000Z");
    const b = item("b", "b", "evidence B", "2026-08-03T12:00:00.000Z");
    const open = loop([a, b]);
    store.reconcile({ loops: [open], observedAt: FIRST, complete: true });
    const resolved = { ...open, state: "resolved" as const, resolvedAt: SECOND };
    const close = store.reconcile({ loops: [resolved], observedAt: SECOND, complete: true });
    const reopen = store.reconcile({ loops: [open], observedAt: "2026-08-03T12:00:00.000Z", complete: true });
    expect(close.events.map((event) => event.type)).toEqual(["state_changed", "resolved"]);
    expect(reopen.events.map((event) => event.type)).toEqual(["state_changed", "reopened"]);
    store.close();
  });

  it("does not retain raw transcript or evidence text in the SQLite file", () => {
    const directory = mkdtempSync(join(tmpdir(), "cuenexa-loop-store-"));
    const path = join(directory, "state.sqlite");
    const store = new LoopStore({ path });
    store.reconcile({ loops: [loop([item("a", "a", "SECRET_TRANSCRIPT_123"), item("b", "b", "SECRET_EVIDENCE_456")])], observedAt: FIRST, complete: true });
    store.close();
    const file = readFileSync(path).toString("utf8");
    expect(file).not.toContain("SECRET_TRANSCRIPT_123");
    expect(file).not.toContain("SECRET_EVIDENCE_456");
    rmSync(directory, { recursive: true, force: true });
  });

  it("uses bounded configuration defaults and rejects invalid retention", () => {
    expect(resolveLoopStorePath({ CUENEXA_LOOP_DB_PATH: "/tmp/cuenexa.sqlite" })).toBe("/tmp/cuenexa.sqlite");
    expect(resolveRetentionDays({})).toBe(30);
    expect(() => resolveRetentionDays({ CUENEXA_LOOP_RETENTION_DAYS: "0" })).toThrow("must be an integer");
  });
});
