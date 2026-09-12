import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStableLoopId, createStableMemberIdentity, type Loop, type LoopItem } from "@cuenexa-loop/loop-engine";
import { LoopStore, resetLoopStore } from "../store.js";

const DAY_ONE = "2026-01-01T12:00:00.000Z";

function item(id: string): LoopItem {
  return {
    id, type: "commitment", text: "Synthetic", state: "open", confidence: 0.95, owner: null, counterparties: [], dueAt: null, dueAtPhrase: null,
    source: { provider: "test", conversationId: `conversation-${id}`, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: `conversation-${id}`, text: `synthetic-${id}` }], createdAt: DAY_ONE, resolvedAt: null,
  };
}

function loop(members: LoopItem[], state: Loop["state"] = "open"): Loop {
  return {
    id: createStableLoopId(members), title: null, state, members: members.map((item) => ({ itemId: item.id, item })),
    timeline: members.map((item, sequence) => ({ itemId: item.id, source: item.source, occurredAt: null, timestampSource: "unavailable", sequence })),
    correlationLinks: [{ fromItemId: members[0]!.id, toItemId: members[1]!.id, confidence: 0.95, reasonCodes: ["shared_specific_anchor_phrase"], sharedSpecificAnchorCount: 2 }],
    correlationConfidence: 0.95, snapshot: { observedAt: DAY_ONE, completeness: "complete" }, resolvedAt: state === "resolved" ? DAY_ONE : null,
  };
}

describe("LoopStore hardening", () => {
  it("reopens an initialized file without losing local state, then reset removes only that file", () => {
    const directory = mkdtempSync(join(tmpdir(), "cuenexa-loop-reopen-"));
    const path = join(directory, "state.sqlite");
    const first = new LoopStore({ path });
    first.reconcile({ loops: [loop([item("a"), item("b")])], observedAt: DAY_ONE, complete: true });
    first.close();
    const reopened = new LoopStore({ path });
    expect(reopened.listThreads()).toHaveLength(1);
    reopened.close();
    expect(resetLoopStore(path)).toBe(true);
    expect(existsSync(path)).toBe(false);
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps active threads while retention removes only old resolved state", () => {
    const store = new LoopStore({ path: ":memory:", retentionDays: 30 });
    const resolved = loop([item("a"), item("b")], "resolved");
    const active = loop([item("c"), item("d")]);
    store.reconcile({ loops: [resolved, active], observedAt: DAY_ONE, complete: true });
    expect(store.purgeResolved("2026-02-02T12:00:00.000Z")).toBe(1);
    expect(store.listThreads().map((thread) => thread.state)).toEqual(["open"]);
    store.close();
  });

  it("reopens the same persistent thread after resolved membership expansion changes the snapshot Loop id", () => {
    const store = new LoopStore({ path: ":memory:" });
    const a = item("a"); const b = item("b"); const c = item("c");
    const original = loop([a, b]);
    const created = store.reconcile({ loops: [original], observedAt: DAY_ONE, complete: true });
    const threadId = created.threads[0]!.id;

    store.reconcile({ loops: [loop([a, b], "resolved")], observedAt: "2026-01-02T12:00:00.000Z", complete: true });
    const expanded = loop([a, b, c], "open");
    expect(expanded.id).not.toBe(original.id);

    const reopened = store.reconcile({ loops: [expanded], observedAt: "2026-01-03T12:00:00.000Z", complete: true });
    expect(reopened.threads[0]?.id).toBe(threadId);
    expect(reopened.threads[0]?.memberIdentities).toHaveLength(3);
    expect(reopened.events.map((event) => event.type)).toEqual([
      "state_changed", "reopened", "member_added", "new_activity",
    ]);
    expect(store.listThreads()).toHaveLength(1);
    store.close();
  });

  it("does not merge an ambiguous strong overlap between resolved candidates", () => {
    const store = new LoopStore({ path: ":memory:" });
    const a = item("a"); const b = item("b"); const c = item("c"); const d = item("d"); const e = item("e");
    // Simulate a pre-existing local database with two plausible resolved candidates.
    // This is intentionally structural: only synthetic thread/member hashes enter it.
    const database = (store as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    for (const [threadId, members] of [["thread_one", [a, b, c]], ["thread_two", [a, b, d]]] as const) {
      database.prepare("INSERT INTO loop_threads (thread_id, state, title, due_at, created_at, updated_at, last_observed_at, resolved_at) VALUES (?, 'resolved', NULL, NULL, ?, ?, ?, ?)").run(threadId, DAY_ONE, DAY_ONE, DAY_ONE, DAY_ONE);
      for (const member of members) {
        database.prepare("INSERT INTO loop_thread_members (thread_id, member_identity, first_observed_at, last_observed_at) VALUES (?, ?, ?, ?)").run(threadId, createStableMemberIdentity(member), DAY_ONE, DAY_ONE);
      }
    }
    const ambiguous = store.reconcile({ loops: [loop([a, b, e])], observedAt: "2026-01-02T12:00:00.000Z", complete: true });
    expect(ambiguous.warnings.join(" ")).toContain("Ambiguous member overlap");
    expect(store.listThreads()).toHaveLength(3);
    store.close();
  });

  it("rolls back a failed reconciliation transaction", () => {
    const store = new LoopStore({ path: ":memory:" });
    const invalid = { ...loop([item("a"), item("b")]), state: "invalid" } as unknown as Loop;
    expect(() => store.reconcile({ loops: [invalid], observedAt: DAY_ONE, complete: true })).toThrow();
    expect(store.listThreads()).toEqual([]);
    store.close();
  });
});
