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
      subscribe: (signal) => ({ events: neverEnding(signal), close }),
      wait,
    }, controller.signal);
    expect(close).toHaveBeenCalledOnce();
    expect(wait.mock.calls[0]?.[0]).toBe(WATCH_TICK_MS);
    expect(wait.mock.calls[0]?.[1].aborted).toBe(true);
  });

  it("keeps one bounded iterator reaction across prolonged realtime silence", async () => {
    const controller = new AbortController();
    const silence = instrumentedSilence();
    let ticks = 0;

    await runAmbientWatch({
      ...dependencies([]),
      subscribe: () => silence.subscription,
      wait: async (milliseconds) => {
        expect(milliseconds).toBe(WATCH_TICK_MS);
        ticks += 1;
        if (ticks === 100) controller.abort();
      },
    }, controller.signal);

    expect(ticks).toBe(100);
    expect(silence.nextCalls()).toBe(1);
    expect(silence.thenCalls()).toBeLessThanOrEqual(1);
    expect(silence.close).toHaveBeenCalledOnce();
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
    const controller = new AbortController();
    const wait = vi.fn(async (milliseconds: number, signal: AbortSignal) => {
      if (signal !== controller.signal) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (signal.aborted) return;
      }
      await time.wait(milliseconds, signal);
    });
    const result = await runAmbientWatch({
      ...dependencies([]),
      authoritativeRefresh: refresh,
      subscribe: () => stream([]),
      wait,
      now: time.now,
    }, controller.signal);
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
    const result = await runAmbientWatch({
      ...dependencies(output),
      authoritativeRefresh: async () => { throw new Error("synthetic private history error"); },
      subscribe: (signal) => ({ events: eventThenSilence({
        kind: "conversation_state", id: "state_1", provider: "bee", providerEventId: null,
        sessionId: null, conversationId: "conversation_synthetic", observedAt: NOW, state: "processed",
      }, signal), close }),
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
    await runAmbientWatch({
      ...dependencies(output),
      authoritativeRefresh: refresh,
      subscribe: (signal) => ({ events: eventThenSilence(processedConversation(), signal), close }),
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
      subscribe: (signal) => ({ events: neverEnding(signal), close: vi.fn() }),
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

function neverEnding(signal: AbortSignal): AsyncIterable<EphemeralRealtimeEvent> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => signal.aborted
        ? Promise.resolve({ done: true, value: undefined })
        : new Promise<IteratorResult<EphemeralRealtimeEvent>>((resolve) => {
          signal.addEventListener("abort", () => resolve({ done: true, value: undefined }), { once: true });
        }),
    }),
  };
}

async function* eventThenSilence(
  event: EphemeralRealtimeEvent,
  signal: AbortSignal,
): AsyncIterable<EphemeralRealtimeEvent> {
  yield event;
  if (!signal.aborted) {
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
  }
}

function instrumentedSilence() {
  let nextCallCount = 0;
  let thenCallCount = 0;
  let finish!: (result: IteratorResult<EphemeralRealtimeEvent>) => void;
  const unresolved = new Promise<IteratorResult<EphemeralRealtimeEvent>>((resolve) => { finish = resolve; });
  const originalThen = unresolved.then.bind(unresolved);
  unresolved.then = ((...args: Parameters<typeof unresolved.then>) => {
    thenCallCount += 1;
    return originalThen(...args);
  }) as typeof unresolved.then;
  const close = vi.fn(() => finish({ done: true, value: undefined }));
  return {
    subscription: {
      events: {
        [Symbol.asyncIterator]: () => ({
          next: () => {
            nextCallCount += 1;
            return unresolved;
          },
        }),
      },
      close,
    } satisfies BeeRealtimeSubscription,
    close,
    nextCalls: () => nextCallCount,
    thenCalls: () => thenCallCount,
  };
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
