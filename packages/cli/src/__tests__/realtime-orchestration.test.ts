import type { EphemeralRealtimeUtterance } from "@cuenexa-loop/contracts";
import { createStableLoopId, ProvisionalAwareness, type Loop, type LoopItem } from "@cuenexa-loop/loop-engine";
import { buildReviewModel, LoopStore, type ReconcileResult } from "@cuenexa-loop/loop-store";
import { describe, expect, it, vi } from "vitest";
import {
  REALTIME_IDLE_REFRESH_MS,
  REALTIME_MIN_REFRESH_INTERVAL_MS,
  RealtimeHandoffCoordinator,
} from "../realtime-orchestration.js";

const NOW = "2026-09-12T08:00:00.000Z";
const LATER = "2026-09-12T08:02:00.000Z";

describe("authoritative realtime handoff", () => {
  it("creates no database, event, user-state, or notification rows from a provisional signal", () => {
    const store = new LoopStore({ path: ":memory:" });
    const coordinator = coordinatorWith(async () => emptySync());
    expect(coordinator.observe(utterance(), "UTC").emitted).toHaveLength(1);
    expect(store.listThreads()).toEqual([]);
    expect(store.listEvents()).toEqual([]);
    expect(store.listThreadUserStates()).toEqual([]);
    expect(store.listNotificationDeliveries()).toEqual([]);
    store.close();
  });

  it("creates and then reuses one persistent thread only through authoritative reconciliation", async () => {
    const store = new LoopStore({ path: ":memory:" });
    const loop = syntheticLoop("alpha");
    const refresh = vi.fn(async (now: string) => ({
      reconcile: store.reconcile({ loops: [loop], observedAt: now, complete: true }),
      detectedConversationIds: new Set(["conversation_synthetic"]),
      timeZone: "UTC",
    }));
    const coordinator = coordinatorWith(refresh);
    coordinator.observe(utterance(), "UTC");
    const first = await coordinator.refresh("conversation_processed", NOW);
    const second = await coordinator.refresh("realtime_gap", LATER);

    expect(first.attempted).toBe(true);
    expect(second.attempted).toBe(true);
    expect(store.listThreads()).toHaveLength(1);
    expect(store.listEvents().filter((event) => event.type === "thread_created")).toHaveLength(1);
    expect(coordinator.signals()).toEqual([]);
    store.close();
  });

  it("expires unconfirmed awareness without resolving or deleting persistent state", () => {
    const store = new LoopStore({ path: ":memory:" });
    store.reconcile({ loops: [syntheticLoop("existing")], observedAt: NOW, complete: true });
    const awareness = new ProvisionalAwareness({ ttlMs: 1_000 });
    const coordinator = coordinatorWith(async () => emptySync(), awareness);
    coordinator.observe(utterance(), "UTC");
    expect(coordinator.expire("2026-09-12T08:00:01.000Z")).toBe(1);
    expect(store.listThreads()).toHaveLength(1);
    expect(store.listThreads()[0]?.state).toBe("open");
    store.close();
  });

  it("repairs a realtime gap via one bounded authoritative refresh", async () => {
    const store = new LoopStore({ path: ":memory:" });
    const refresh = vi.fn(async (now: string) => ({
      reconcile: store.reconcile({ loops: [syntheticLoop("gap")], observedAt: now, complete: true }),
      detectedConversationIds: new Set(["conversation_synthetic"]),
      timeZone: "UTC",
    }));
    const coordinator = coordinatorWith(refresh);
    expect((await coordinator.refresh("realtime_gap", NOW)).attempted).toBe(true);
    expect((await coordinator.refresh("realtime_gap", "2026-09-12T08:00:30.000Z")).attempted).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.listThreads()).toHaveLength(1);
    store.close();
  });

  it("does not infer resolution from a partial historical snapshot", async () => {
    const store = new LoopStore({ path: ":memory:" });
    store.reconcile({ loops: [syntheticLoop("partial")], observedAt: NOW, complete: true });
    const coordinator = coordinatorWith(async (now) => ({
      reconcile: store.reconcile({ loops: [], observedAt: now, complete: false }),
      detectedConversationIds: new Set(),
      timeZone: "UTC",
    }));
    await coordinator.refresh("realtime_gap", LATER);
    expect(store.listThreads()[0]?.state).toBe("open");
    expect(store.listEvents().some((event) => event.type === "resolved")).toBe(false);
    store.close();
  });

  it("leaves acknowledgement and dismissal precedence to existing Phase 3 policy", async () => {
    const store = new LoopStore({ path: ":memory:" });
    const firstLoop = syntheticLoop("preference");
    const seeded = store.reconcile({ loops: [firstLoop], observedAt: NOW, complete: true });
    const threadId = seeded.threads[0]!.id;
    store.acknowledgeThread(threadId, "2026-09-12T08:00:10.000Z");
    store.dismissThread(threadId, "2026-09-12T08:00:10.000Z");
    const expanded = syntheticLoop("preference", "c");
    const coordinator = coordinatorWith(async (now) => ({
      reconcile: store.reconcile({ loops: [expanded], observedAt: now, complete: true }),
      detectedConversationIds: new Set(["conversation_synthetic"]),
      timeZone: "UTC",
    }));
    coordinator.observe(utterance(), "UTC");
    await coordinator.refresh("conversation_processed", LATER);

    const state = store.getThreadUserState(threadId);
    expect(state.acknowledgedAt).toBe("2026-09-12T08:00:10.000Z");
    expect(state.dismissedAt).toBe("2026-09-12T08:00:10.000Z");
    const review = buildReviewModel(store.listThreads(), store.listEvents(), [state], LATER);
    expect(review.needsAttention[0]?.reasonCodes).toContain("new_activity");
    store.close();
  });

  it("rate-limits idle refresh deterministically and never writes notification deliveries", async () => {
    const store = new LoopStore({ path: ":memory:" });
    const refresh = vi.fn(async () => emptySync());
    const coordinator = coordinatorWith(refresh);
    coordinator.observe(utterance(), "UTC");
    expect(coordinator.idleRefreshDue(new Date(Date.parse(NOW) + REALTIME_IDLE_REFRESH_MS - 1).toISOString())).toBe(false);
    const due = new Date(Date.parse(NOW) + REALTIME_IDLE_REFRESH_MS).toISOString();
    expect(coordinator.idleRefreshDue(due)).toBe(true);
    await coordinator.refresh("idle", due);
    coordinator.observe(utterance("event_second", "utterance_second", "2026-09-12T08:00:31.000Z"), "UTC");
    expect(coordinator.idleRefreshDue(new Date(Date.parse(due) + REALTIME_MIN_REFRESH_INTERVAL_MS - 1).toISOString())).toBe(false);
    expect(store.listNotificationDeliveries()).toEqual([]);
    store.close();
  });
});

function coordinatorWith(
  refresh: ConstructorParameters<typeof RealtimeHandoffCoordinator>[1],
  awareness = new ProvisionalAwareness(),
) {
  return new RealtimeHandoffCoordinator(awareness, refresh);
}

function emptySync(): { reconcile: ReconcileResult; detectedConversationIds: Set<string>; timeZone: string } {
  return { reconcile: { threads: [], events: [], warnings: [], complete: true }, detectedConversationIds: new Set(), timeZone: "UTC" };
}

function utterance(id = "event_synthetic", utteranceId = "utterance_synthetic", observedAt = NOW): EphemeralRealtimeUtterance {
  return {
    kind: "utterance", id, provider: "bee", providerEventId: id, sessionId: null,
    conversationId: "conversation_synthetic", utteranceId, observedAt, spokenAt: null,
    text: "I will send the synthetic pricing deck.", final: true,
  };
}

function syntheticLoop(seed: string, extra?: string): Loop {
  const items = [item(`${seed}-a`), item(`${seed}-b`), ...(extra ? [item(`${seed}-${extra}`)] : [])];
  return {
    id: createStableLoopId(items), title: "Synthetic pricing deck", state: "open",
    members: items.map((value) => ({ itemId: value.id, item: value })),
    timeline: items.map((value, sequence) => ({
      itemId: value.id, source: value.source, occurredAt: null, timestampSource: "unavailable", sequence,
    })),
    correlationLinks: items.slice(1).map((value) => ({
      fromItemId: items[0]!.id, toItemId: value.id, confidence: 0.95,
      reasonCodes: ["shared_specific_anchor_phrase"], sharedSpecificAnchorCount: 1,
    })),
    correlationConfidence: 0.95,
    snapshot: { observedAt: NOW, completeness: "complete" }, resolvedAt: null,
  };
}

function item(id: string): LoopItem {
  return {
    id, type: "commitment", text: "Send synthetic pricing deck", state: "open", confidence: 0.95,
    owner: null, counterparties: [], dueAt: null, dueAtPhrase: null,
    source: { provider: "test", conversationId: `conversation-${id}`, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: `conversation-${id}`, text: "Synthetic evidence" }],
    createdAt: NOW, resolvedAt: null,
  };
}
