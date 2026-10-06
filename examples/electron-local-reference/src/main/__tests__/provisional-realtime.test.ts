import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BeeAdapterClient,
  BeeCliUnavailableError,
  type BeeRealtimeSubscription,
  type CompleteDetectionSnapshot,
} from "@cuenexa-loop/bee-adapter";
import type { EphemeralRealtimeEvent, EphemeralRealtimeUtterance } from "@cuenexa-loop/contracts";
import { ProvisionalAwareness } from "@cuenexa-loop/loop-engine";
import { LoopStore } from "@cuenexa-loop/loop-store";
import { CueNexaService } from "../cuenexa-service.js";
import { assertProvisionalSignalIsSanitized, dtoContainsProhibitedContent, toProvisionalSignalDto } from "../dto.js";

const NOW = "2026-10-06T18:00:00.000Z";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempStore(): LoopStore {
  const directory = mkdtempSync(join(tmpdir(), "cuenexa-electron-r1b-"));
  directories.push(directory);
  return new LoopStore({ path: join(directory, "state.sqlite") });
}

function fakeClient(ensureAuthenticated: BeeAdapterClient["ensureAuthenticated"] = async () => ({ timeZone: "Asia/Manila" })): BeeAdapterClient {
  return { ensureAuthenticated } as BeeAdapterClient;
}

function emptySnapshot(): CompleteDetectionSnapshot {
  return {
    complete: true,
    snapshot: {
      conversations: [],
      facts: [],
      todos: [],
      warnings: [],
      pagination: {
        conversations: { nextCursor: null },
        facts: { nextCursor: null },
        todos: { nextCursor: null },
      },
    },
  };
}

function utterance(overrides: Partial<EphemeralRealtimeUtterance> = {}): EphemeralRealtimeUtterance {
  return {
    id: "evt_1",
    kind: "utterance",
    provider: "bee",
    providerEventId: "pe_1",
    sessionId: "sess_1",
    conversationId: "conv_a",
    observedAt: NOW,
    utteranceId: "utt_1",
    spokenAt: NOW,
    text: "I will send the report tomorrow. SECRET_UTTERANCE_TEXT",
    final: true,
    ...overrides,
  };
}

function subscriptionOf(events: readonly EphemeralRealtimeEvent[], closed: { value: boolean } = { value: false }): BeeRealtimeSubscription {
  return {
    events: (async function* () {
      for (const event of events) {
        if (closed.value) return;
        yield event;
      }
    })(),
    close() {
      closed.value = true;
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("P4-R1B provisional realtime host boundary", () => {
  it("routes utterance events through ProvisionalAwareness and never writes LoopStore", async () => {
    const store = tempStore();
    const originalReconcile = store.reconcile.bind(store);
    let reconcileCalls = 0;
    store.reconcile = ((input) => {
      reconcileCalls += 1;
      return originalReconcile(input);
    }) as LoopStore["reconcile"];
    const awareness = new ProvisionalAwareness();
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      awareness,
      subscribeRealtime: () => subscriptionOf([utterance()]),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const beforeEvents = store.listEvents().length;
    const beforeThreads = store.listThreads().length;
    await service.startRealtime();
    await waitFor(() => service.getProvisional().signals.length > 0);
    await waitFor(() => service.getProvisional().health === "disconnected");
    expect(service.getProvisional().signals[0]?.label).toBe("PROVISIONAL");
    expect(service.getProvisional().signals[0]?.kind).toBe("possible_commitment");
    expect(JSON.stringify(service.getProvisional())).not.toContain("SECRET_UTTERANCE_TEXT");
    expect(dtoContainsProhibitedContent(service.getProvisional().signals)).toBe(false);
    expect(store.listEvents().length).toBe(beforeEvents);
    expect(store.listThreads().length).toBe(beforeThreads);
    expect(reconcileCalls).toBe(0);
    store.close();
  });

  it("keeps authoritative Sync healthy when realtime was never started or disconnects", async () => {
    const store = tempStore();
    const closed = { value: false };
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      fetchSnapshot: async () => emptySnapshot(),
      subscribeRealtime: () => subscriptionOf([], closed),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    expect(service.getProvisional().health).toBe("off");
    const first = await service.sync();
    expect(first.complete).toBe(true);
    expect(first.errorCode).toBeNull();
    await service.startRealtime();
    await waitFor(() => service.getProvisional().health === "disconnected");
    const second = await service.sync();
    expect(second.complete).toBe(true);
    expect(second.errorCode).toBeNull();
    expect(closed.value).toBe(true);
    store.close();
  });

  it("does not treat realtime health as authoritative completeness", async () => {
    const store = tempStore();
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      fetchSnapshot: async () => ({ ...emptySnapshot(), complete: false }),
      subscribeRealtime: () => subscriptionOf([utterance()]),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    const snapshot = await service.sync();
    expect(snapshot.complete).toBe(false);
    expect(service.getProvisional().health).not.toBe("off");
    store.close();
  });

  it("maps Bee realtime start failure to disconnected without touching persistence", async () => {
    const store = tempStore();
    const service = new CueNexaService({
      client: fakeClient(async () => {
        throw new BeeCliUnavailableError("ENOENT /secret/path/bee");
      }),
      store,
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const snapshot = await service.startRealtime();
    expect(snapshot.health).toBe("disconnected");
    expect(JSON.stringify(snapshot)).not.toContain("/secret/path");
    expect(store.listThreads()).toHaveLength(0);
    store.close();
  });

  it("closes the subscription on stop and starts empty after restart", async () => {
    const store = tempStore();
    const closed = { value: false };
    const hanging: BeeRealtimeSubscription = {
      events: (async function* () {
        await new Promise(() => undefined);
      })(),
      close() {
        closed.value = true;
      },
    };
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      subscribeRealtime: () => hanging,
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    expect(service.getProvisional().health).toBe("active");
    service.stopRealtime();
    expect(closed.value).toBe(true);
    expect(service.getProvisional().health).toBe("off");
    expect(service.getProvisional().signals).toHaveLength(0);
    store.close();
  });

  it("dedupes repeated events and prunes expired signals", async () => {
    const store = tempStore();
    const awareness = new ProvisionalAwareness({ ttlMs: 1000 });
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      awareness,
      subscribeRealtime: () =>
        subscriptionOf([
          utterance(),
          utterance(),
          utterance({ id: "evt_old", observedAt: "2026-10-06T17:00:00.000Z", text: "I will send it." }),
        ]),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    await waitFor(() => service.getProvisional().health === "disconnected");
    expect(service.getProvisional().signals.length).toBeLessThanOrEqual(1);
    store.close();
  });

  it("retires provisional signals only via explicit historical conversation IDs from Sync", async () => {
    const store = tempStore();
    const awareness = new ProvisionalAwareness();
    awareness.ingest(utterance(), "Asia/Manila");
    expect(awareness.list().length).toBeGreaterThan(0);
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      awareness,
      fetchSnapshot: async () => emptySnapshot(),
      detect: () => ({
        items: [
          {
            id: "item_a",
            type: "commitment",
            text: "Synthetic private item",
            state: "open",
            confidence: 0.95,
            owner: null,
            counterparties: [],
            dueAt: null,
            dueAtPhrase: null,
            source: { provider: "test", conversationId: "conv_a", factId: null, todoId: null, utteranceIndexes: [0] },
            evidence: [],
            createdAt: NOW,
            resolvedAt: null,
          },
        ],
        warnings: [],
      }),
      correlate: (input) => ({ loops: [], warnings: [], snapshot: input.snapshot }),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.sync();
    expect(service.getProvisional().signals).toHaveLength(0);
    store.close();
  });

  it("resolves conversation identity only from an explicit dual-id conversation_state event", async () => {
    const store = tempStore();
    const awareness = new ProvisionalAwareness();
    awareness.ingest(utterance({ conversationId: null }), "Asia/Manila");
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      awareness,
      subscribeRealtime: () =>
        subscriptionOf([
          {
            id: "state_1",
            kind: "conversation_state",
            provider: "bee",
            providerEventId: "st_1",
            sessionId: "sess_1",
            conversationId: "conv_numeric",
            observedAt: NOW,
            state: "processed",
          },
        ]),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    await waitFor(() => service.getProvisional().health === "disconnected");
    awareness.retireConversations(new Set(["conv_numeric"]));
    expect(awareness.list()).toHaveLength(0);
    store.close();
  });

  it("cancels in-flight startup so Stop does not leave a later stream active", async () => {
    const store = tempStore();
    let releaseAuth!: (value: { timeZone: string | null }) => void;
    const authGate = new Promise<{ timeZone: string | null }>((resolve) => {
      releaseAuth = resolve;
    });
    let subscribeCount = 0;
    const service = new CueNexaService({
      client: fakeClient(() => authGate),
      store,
      subscribeRealtime: () => {
        subscribeCount += 1;
        return subscriptionOf([]);
      },
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const started = service.startRealtime();
    await waitFor(() => service.getProvisional().health === "connecting");
    service.stopRealtime();
    expect(service.getProvisional().health).toBe("off");
    releaseAuth({ timeZone: "Asia/Manila" });
    await started;
    expect(subscribeCount).toBe(0);
    expect(service.getProvisional().health).toBe("off");
    store.close();
  });

  it("serializes overlapping Start calls into a single subscription", async () => {
    const store = tempStore();
    let releaseAuth!: (value: { timeZone: string | null }) => void;
    const authGate = new Promise<{ timeZone: string | null }>((resolve) => {
      releaseAuth = resolve;
    });
    let subscribeCount = 0;
    const hanging: BeeRealtimeSubscription = {
      events: (async function* () {
        await new Promise(() => undefined);
      })(),
      close() {},
    };
    const service = new CueNexaService({
      client: fakeClient(() => authGate),
      store,
      subscribeRealtime: () => {
        subscribeCount += 1;
        return hanging;
      },
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const first = service.startRealtime();
    const second = service.startRealtime();
    releaseAuth({ timeZone: "Asia/Manila" });
    await Promise.all([first, second]);
    expect(subscribeCount).toBe(1);
    expect(service.getProvisional().health).toBe("active");
    service.stopRealtime();
    store.close();
  });

  it("clears a terminated stream so Start can reconnect without Stop", async () => {
    const store = tempStore();
    let subscribeCount = 0;
    const hanging: BeeRealtimeSubscription = {
      events: (async function* () {
        await new Promise(() => undefined);
      })(),
      close() {},
    };
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      subscribeRealtime: () => {
        subscribeCount += 1;
        return subscribeCount === 1 ? subscriptionOf([]) : hanging;
      },
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    await waitFor(() => service.getProvisional().health === "disconnected");
    expect(subscribeCount).toBe(1);
    await service.startRealtime();
    expect(subscribeCount).toBe(2);
    expect(service.getProvisional().health).toBe("active");
    service.stopRealtime();
    store.close();
  });

  it("clears a thrown stream so Start can reconnect", async () => {
    const store = tempStore();
    let subscribeCount = 0;
    const hanging: BeeRealtimeSubscription = {
      events: (async function* () {
        await new Promise(() => undefined);
      })(),
      close() {},
    };
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      subscribeRealtime: () => {
        subscribeCount += 1;
        if (subscribeCount === 1) {
          return {
            events: (async function* () {
              throw new Error("stream failed");
            })(),
            close() {},
          };
        }
        return hanging;
      },
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    await waitFor(() => service.getProvisional().health === "disconnected");
    await service.startRealtime();
    expect(subscribeCount).toBe(2);
    expect(service.getProvisional().health).toBe("active");
    service.stopRealtime();
    store.close();
  });

  it("emits a pruned snapshot when TTL elapses without further realtime events", async () => {
    const store = tempStore();
    let nowMs = Date.parse(NOW);
    const scheduled: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];
    const snapshots: Array<{ health: string; signalCount: number }> = [];
    const awareness = new ProvisionalAwareness({ ttlMs: 1_000 });
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      awareness,
      subscribeRealtime: () => subscriptionOf([utterance()]),
      now: () => new Date(nowMs).toISOString(),
      schedule: (callback, delayMs) => {
        const handle = { callback, delayMs, cancelled: false };
        scheduled.push(handle);
        return handle;
      },
      cancelSchedule: (handle) => {
        (handle as { cancelled: boolean }).cancelled = true;
      },
      onProvisionalChange: (snapshot) => {
        snapshots.push({ health: snapshot.health, signalCount: snapshot.signals.length });
      },
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    await waitFor(() => service.getProvisional().signals.length > 0);
    const timer = scheduled.find((item) => !item.cancelled && item.delayMs === 1_000);
    expect(timer).toBeTruthy();
    nowMs += 1_000;
    timer!.callback();
    expect(service.getProvisional().signals).toHaveLength(0);
    expect(snapshots.some((snapshot) => snapshot.signalCount === 0)).toBe(true);
    service.stopRealtime();
    store.close();
  });

  it("does not emit stale expiry updates after Stop", async () => {
    const store = tempStore();
    let nowMs = Date.parse(NOW);
    const scheduled: Array<{ callback: () => void; cancelled: boolean }> = [];
    let emissions = 0;
    const awareness = new ProvisionalAwareness({ ttlMs: 1_000 });
    const hanging: BeeRealtimeSubscription = {
      events: (async function* () {
        yield utterance();
        await new Promise(() => undefined);
      })(),
      close() {},
    };
    const service = new CueNexaService({
      client: fakeClient(),
      store,
      awareness,
      subscribeRealtime: () => hanging,
      now: () => new Date(nowMs).toISOString(),
      schedule: (callback) => {
        const handle = { callback, cancelled: false };
        scheduled.push(handle);
        return handle;
      },
      cancelSchedule: (handle) => {
        (handle as { cancelled: boolean }).cancelled = true;
      },
      onProvisionalChange: () => {
        emissions += 1;
      },
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.startRealtime();
    await waitFor(() => service.getProvisional().signals.length > 0);
    const pending = scheduled.filter((item) => !item.cancelled);
    expect(pending.length).toBeGreaterThan(0);
    service.stopRealtime();
    const afterStop = emissions;
    nowMs += 1_000;
    for (const item of pending) item.callback();
    expect(emissions).toBe(afterStop);
    expect(service.getProvisional().health).toBe("off");
    store.close();
  });
});

describe("provisional DTO sanitizer", () => {
  it("omits prohibited engine fields including ephemeral text and conversation ids", () => {
    const awareness = new ProvisionalAwareness();
    awareness.ingest(utterance(), "Asia/Manila");
    const signal = awareness.list()[0];
    expect(signal).toBeTruthy();
    const dto = toProvisionalSignalDto(signal!);
    assertProvisionalSignalIsSanitized(dto);
    expect(JSON.stringify(dto)).not.toContain("SECRET_UTTERANCE_TEXT");
    expect(JSON.stringify(dto)).not.toContain("sess_1");
    expect(JSON.stringify(dto)).not.toContain("conv_a");
    expect(dtoContainsProhibitedContent(dto)).toBe(false);
  });
});
