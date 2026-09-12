import type { BeeRealtimeSubscription } from "@cuenexa-loop/bee-adapter";
import type { EphemeralRealtimeEvent } from "@cuenexa-loop/contracts";
import type { NotificationPlan, ReviewModel } from "@cuenexa-loop/loop-store";
import { describe, expect, it, vi } from "vitest";
import { runAmbientWatch, WATCH_RECONNECT_BACKOFF_MS, WATCH_TICK_MS } from "../watch-runtime.js";
import type { AuthoritativeSyncResult } from "../persistent-orchestration.js";
import { REALTIME_MIN_REFRESH_INTERVAL_MS } from "../realtime-orchestration.js";

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
    const time = advancingTime();
    const wait = vi.fn(time.wait);
    const result = await runAmbientWatch({
      ...dependencies(output), subscribe, wait, now: time.now,
    }, new AbortController().signal);
    expect(output.some((line) => line.includes("CueNexa Loop — Follow Through"))).toBe(true);
    expect(output.some((line) => line === "Realtime unavailable — authoritative CueNexa state remains available.")).toBe(true);
    expect(output.join("\n")).not.toContain("synthetic private transport detail");
    expect(subscribe).toHaveBeenCalledTimes(WATCH_RECONNECT_BACKOFF_MS.length + 1);
    expect(result.reconnectsAttempted).toBe(WATCH_RECONNECT_BACKOFF_MS.length);
    expect(wait.mock.calls.map((call) => call[0])).toEqual([
      ...WATCH_RECONNECT_BACKOFF_MS,
      REALTIME_MIN_REFRESH_INTERVAL_MS - WATCH_RECONNECT_BACKOFF_MS.reduce((sum, value) => sum + value, 0),
    ]);
  });

  it("does not lose a gap immediately after initial sync and coalesces rapid gaps into one permitted repair", async () => {
    const refresh = vi.fn(async () => syncResult());
    const time = advancingTime();
    const wait = vi.fn(time.wait);
    const result = await runAmbientWatch({
      ...dependencies([]),
      authoritativeRefresh: refresh,
      subscribe: () => stream([]),
      wait,
      now: time.now,
    }, new AbortController().signal);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.authoritativeRefreshes).toBe(1);
    expect(wait.mock.calls.length).toBeLessThanOrEqual(16);
    expect(time.elapsed()).toBe(REALTIME_MIN_REFRESH_INTERVAL_MS);
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
      now: clockAfterInitialSync(),
    }, controller.signal);
    expect(deliveryWrite).not.toHaveBeenCalled();
  });

  it("keeps the realtime subscription alive when an authoritative refresh fails", async () => {
    const controller = new AbortController();
    const close = vi.fn();
    const output: string[] = [];
    const events = (async function* () {
      yield { kind: "conversation_state", id: "state_1", provider: "bee", providerEventId: null,
        sessionId: null, conversationId: "conversation_synthetic", observedAt: NOW, state: "processed" } as const;
      await new Promise<void>(() => undefined);
    })();
    const result = await runAmbientWatch({
      ...dependencies(output),
      authoritativeRefresh: async () => { throw new Error("synthetic private history error"); },
      subscribe: () => ({ events, close }),
      output: (text) => {
        output.push(text);
        if (text.startsWith("Authoritative refresh unavailable")) controller.abort();
      },
      now: clockAfterInitialSync(),
    }, controller.signal);
    expect(result.subscriptionsOpened).toBe(1);
    expect(result.reconnectsAttempted).toBe(0);
    expect(close).toHaveBeenCalledOnce();
    expect(output.join("\n")).not.toContain("synthetic private history error");
  });

  it("renders refresh failure safely and performs only one deferred retry at the next permitted time", async () => {
    const controller = new AbortController();
    const close = vi.fn();
    const output: string[] = [];
    const changed = syncResult({
      events: [{ id: "event_retry", threadId: "thread_synthetic", type: "new_activity", observedAt: NOW, details: {} }],
    });
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error("synthetic private history error"))
      .mockResolvedValueOnce(changed);
    const time = timeAfterInitialSync();
    const wait = vi.fn(time.wait);
    const events = (async function* () {
      yield processedConversation();
      await new Promise<void>(() => undefined);
    })();

    await runAmbientWatch({
      ...dependencies(output),
      authoritativeRefresh: refresh,
      subscribe: () => ({ events, close }),
      now: time.now,
      wait,
      output: (text) => {
        output.push(text);
        if (text.startsWith("AUTHORITATIVE")) controller.abort();
      },
    }, controller.signal);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls.length).toBeLessThanOrEqual((REALTIME_MIN_REFRESH_INTERVAL_MS / WATCH_TICK_MS) + 2);
    expect(wait.mock.calls.every((call) => call[0] === WATCH_TICK_MS)).toBe(true);
    expect(output).toContain("Authoritative refresh unavailable — existing persistent state remains available.");
    expect(output.join("\n")).not.toContain("synthetic private history error");
    expect(close).toHaveBeenCalledOnce();
  });

  it("accepts an explicit foreground manual refresh without bypassing the shared limit", async () => {
    const controller = new AbortController();
    let requested = true;
    const refresh = vi.fn(async () => syncResult({
      events: [{ id: "event_manual", threadId: "thread_synthetic", type: "new_activity", observedAt: NOW, details: {} }],
    }));
    await runAmbientWatch({
      ...dependencies([]),
      authoritativeRefresh: refresh,
      subscribe: () => ({ events: neverEnding(), close: vi.fn() }),
      consumeManualRefreshRequest: () => { const result = requested; requested = false; return result; },
      wait: async () => undefined,
      now: clockAfterInitialSync(),
      output: (text) => { if (text.startsWith("AUTHORITATIVE")) controller.abort(); },
    }, controller.signal);
    expect(refresh).toHaveBeenCalledOnce();
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
    kind: "utterance", id: "event_synthetic", provider: "bee", providerEventId: null,
    sessionId: "uuid-synthetic-001", conversationId: null, utteranceId: "utterance_synthetic", observedAt: NOW,
    spokenAt: null, text: "I will send the synthetic pricing deck.", final: true,
  };
}

function processedConversation(): EphemeralRealtimeEvent {
  return {
    kind: "conversation_state", id: "state_processed", provider: "bee", providerEventId: null,
    sessionId: "uuid-synthetic-001", conversationId: "6531525", observedAt: NOW, state: "processed",
  };
}

function clockAfterInitialSync(): () => string {
  let calls = 0;
  return () => calls++ === 0 ? NOW : "2026-09-12T08:02:00.000Z";
}

function advancingTime() {
  const initial = Date.parse(NOW);
  let current = initial;
  return {
    now: () => new Date(current).toISOString(),
    wait: async (milliseconds: number, _signal: AbortSignal) => { current += milliseconds; },
    elapsed: () => current - initial,
  };
}

function timeAfterInitialSync() {
  let first = true;
  let current = Date.parse("2026-09-12T08:02:00.000Z");
  return {
    now: () => {
      if (first) {
        first = false;
        return NOW;
      }
      return new Date(current).toISOString();
    },
    wait: async (milliseconds: number, _signal: AbortSignal) => { current += milliseconds; },
  };
}
