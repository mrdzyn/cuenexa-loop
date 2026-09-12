import type { BeeRealtimeSubscription } from "@cuenexa-loop/bee-adapter";
import type { EphemeralRealtimeEvent } from "@cuenexa-loop/contracts";
import type { NotificationPlan, ReviewModel } from "@cuenexa-loop/loop-store";
import { describe, expect, it, vi } from "vitest";
import { runAmbientWatch, WATCH_RECONNECT_BACKOFF_MS, WATCH_TICK_MS } from "../watch-runtime.js";
import type { AuthoritativeSyncResult } from "../persistent-orchestration.js";

const NOW = "2026-09-12T08:00:00.000Z";

describe("ambient watch runtime", () => {
  it("completes authoritative sync before opening realtime and renders a provisional event", async () => {
    const order: string[] = [];
    const output: string[] = [];
    const controller = new AbortController();
    const result = await runAmbientWatch({
      ...dependencies(output),
      initialSync: async () => { order.push("sync"); return syncResult(); },
      subscribe: () => {
        order.push("subscribe");
        return stream([utterance()]);
      },
      output: (text) => {
        output.push(text);
        if (text.startsWith("PROVISIONAL")) controller.abort();
      },
    }, controller.signal);

    expect(order).toEqual(["sync", "subscribe"]);
    expect(output.some((line) => line.includes("Authoritative CueNexa state is ready"))).toBe(true);
    expect(output.some((line) => line.startsWith("PROVISIONAL"))).toBe(true);
    expect(result.subscriptionsOpened).toBe(1);
  });

  it("cleans up the active subscription on graceful cancellation", async () => {
    const controller = new AbortController();
    const close = vi.fn();
    const wait = vi.fn(async (_milliseconds: number, _signal: AbortSignal) => controller.abort());
    await runAmbientWatch({
      ...dependencies([]),
      subscribe: () => ({ events: neverEnding(), close }),
      wait,
    }, controller.signal);
    expect(close).toHaveBeenCalledOnce();
    expect(wait.mock.calls[0]?.[0]).toBe(WATCH_TICK_MS);
    expect(wait.mock.calls[0]?.[1].aborted).toBe(true);
  });

  it("keeps persistent review visible and bounds reconnects when realtime fails", async () => {
    const output: string[] = [];
    const subscribe = vi.fn(() => { throw new Error("synthetic private transport detail"); });
    const wait = vi.fn(async (_milliseconds: number, _signal: AbortSignal) => undefined);
    const result = await runAmbientWatch({ ...dependencies(output), subscribe, wait }, new AbortController().signal);
    expect(output.some((line) => line.includes("CueNexa Loop — Follow Through"))).toBe(true);
    expect(output.some((line) => line === "Realtime unavailable — authoritative CueNexa state remains available.")).toBe(true);
    expect(output.join("\n")).not.toContain("synthetic private transport detail");
    expect(subscribe).toHaveBeenCalledTimes(WATCH_RECONNECT_BACKOFF_MS.length + 1);
    expect(result.reconnectsAttempted).toBe(WATCH_RECONNECT_BACKOFF_MS.length);
    expect(wait.mock.calls.map((call) => call[0])).toEqual([...WATCH_RECONNECT_BACKOFF_MS]);
  });

  it("performs at most one rate-limited authoritative repair across rapid gaps", async () => {
    const refresh = vi.fn(async () => syncResult());
    const result = await runAmbientWatch({
      ...dependencies([]),
      authoritativeRefresh: refresh,
      subscribe: () => stream([]),
      wait: async () => undefined,
    }, new AbortController().signal);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.authoritativeRefreshes).toBe(1);
  });

  it("does not record notifications when authoritative changes are displayed", async () => {
    const controller = new AbortController();
    const deliveryWrite = vi.fn();
    const changed = syncResult({
      events: [{ id: "event_change", threadId: "thread_synthetic", type: "new_activity", observedAt: NOW, details: {} }],
    });
    await runAmbientWatch({
      ...dependencies([]),
      authoritativeRefresh: async () => changed,
      subscribe: () => stream([{ kind: "conversation_state", id: "state_1", provider: "bee", providerEventId: null,
        sessionId: null, conversationId: "conversation_synthetic", observedAt: NOW, state: "processed" }]),
      output: (text) => { if (text.startsWith("AUTHORITATIVE")) controller.abort(); },
    }, controller.signal);
    expect(deliveryWrite).not.toHaveBeenCalled();
  });
});

function dependencies(output: string[]) {
  return {
    initialSync: async () => syncResult(),
    authoritativeRefresh: async () => syncResult(),
    subscribe: () => stream([]),
    loadReview: (): ReviewModel => ({ generatedAt: NOW, dueNow: [], needsAttention: [], waiting: [], snoozed: [], recentlyResolved: [] }),
    loadNotifications: (): NotificationPlan => ({ generatedAt: NOW, candidates: [] }),
    output: (text: string) => output.push(text),
    now: () => NOW,
    wait: async () => undefined,
  };
}

function syncResult(overrides: Partial<AuthoritativeSyncResult["reconcile"]> = {}): AuthoritativeSyncResult {
  return {
    reconcile: { threads: [], events: [], warnings: [], complete: true, ...overrides },
    detectedConversationIds: new Set(),
    timeZone: "UTC",
  };
}

function stream(events: readonly EphemeralRealtimeEvent[]): BeeRealtimeSubscription {
  return { events: (async function* () { yield* events; })(), close: vi.fn() };
}

function neverEnding(): AsyncIterable<EphemeralRealtimeEvent> {
  return { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<EphemeralRealtimeEvent>>(() => undefined) }) };
}

function utterance(): EphemeralRealtimeEvent {
  return {
    kind: "utterance", id: "event_synthetic", provider: "bee", providerEventId: null, sessionId: null,
    conversationId: "conversation_synthetic", utteranceId: "utterance_synthetic", observedAt: NOW,
    spokenAt: null, text: "I will send the synthetic pricing deck.", final: true,
  };
}
