import type { BeeClient, JsonSseEvent } from "@beeai/cli/lib";
import { describe, expect, it, vi } from "vitest";
import { BeeAdapterClient } from "../bee-client.js";
import { BeeAuthenticationError, BeeCommandError } from "../errors.js";
import { BEE_REALTIME_EVENT_TYPES, normalizeBeeRealtimeEvent } from "../realtime.js";

const NOW = "2026-09-12T08:00:00.000Z";

describe("Bee realtime normalization", () => {
  it("normalizes the documented new-utterance envelope without leaking Bee shape", () => {
    const result = normalizeBeeRealtimeEvent({
      event: "new-utterance",
      id: "event_synthetic_001",
      data: {
        utterance: { id: "utterance_synthetic_001", text: "I will send the synthetic pricing deck.", speaker: "speaker_1", final: true },
        conversation_uuid: "conversation_synthetic_001",
      },
    }, NOW);

    expect(result).toEqual({ event: {
      kind: "utterance",
      id: "bee_rt_event_synthetic_001",
      provider: "bee",
      providerEventId: "event_synthetic_001",
      sessionId: null,
      conversationId: "conversation_synthetic_001",
      observedAt: NOW,
      utteranceId: "utterance_synthetic_001",
      spokenAt: null,
      text: "I will send the synthetic pricing deck.",
      final: true,
    } });
  });

  it("normalizes conversation state without copying title or summary content", () => {
    const result = normalizeBeeRealtimeEvent({
      event: "update-conversation",
      data: { conversation: { id: 42, state: "processed", title: "private synthetic title", short_summary: "private" } },
    }, NOW);

    expect(result).toHaveProperty("event.kind", "conversation_state");
    expect(result).toHaveProperty("event.conversationId", "42");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("returns fixed content-free warnings for malformed and unsupported events", () => {
    expect(normalizeBeeRealtimeEvent({ event: "new-utterance", data: { utterance: {} } }, NOW)).toEqual({
      warning: { code: "malformed_event", message: "Bee realtime event was malformed and was ignored." },
    });
    expect(normalizeBeeRealtimeEvent({ event: "todo-created", data: { todo: { text: "secret" } } }, NOW)).toEqual({
      warning: { code: "unsupported_event", message: "Bee realtime event type is not supported and was ignored." },
    });
  });
});

describe("Bee realtime subscription", () => {
  it("uses the official streamJson surface and deduplicates provider event IDs", async () => {
    const streamJson = vi.fn(() => fakeStream([
      envelope("event_synthetic_001", "First synthetic fragment"),
      envelope("event_synthetic_001", "Duplicate synthetic fragment"),
      envelope("event_synthetic_002", "Second synthetic fragment"),
    ]));
    const client = new BeeAdapterClient({ client: fakeClient(streamJson) });

    const subscription = client.subscribeRealtime({ now: () => NOW });
    const events = await collect(subscription.events);

    expect(streamJson).toHaveBeenCalledWith({ types: [...BEE_REALTIME_EVENT_TYPES], signal: undefined });
    expect(events.map((event) => event.providerEventId)).toEqual(["event_synthetic_001", "event_synthetic_002"]);
  });

  it("reports malformed events and continues with later valid events", async () => {
    const warnings: string[] = [];
    const client = new BeeAdapterClient({ client: fakeClient(() => fakeStream([
      { event: "new-utterance", data: { utterance: {} } },
      envelope("event_synthetic_002", "Valid synthetic fragment"),
    ])) });

    const events = await collect(client.subscribeRealtime({
      now: () => NOW,
      onWarning: (warning) => warnings.push(warning.code),
    }).events);

    expect(warnings).toEqual(["malformed_event"]);
    expect(events).toHaveLength(1);
  });

  it("treats a clean disconnect as stream completion only", async () => {
    const client = new BeeAdapterClient({ client: fakeClient(() => fakeStream([])) });
    await expect(collect(client.subscribeRealtime({ now: () => NOW }).events)).resolves.toEqual([]);
  });

  it("maps stream failures to a privacy-safe typed command error", async () => {
    const rawDetail = "private stderr from synthetic stream";
    const client = new BeeAdapterClient({ client: fakeClient(() => failingStream(new Error(rawDetail))) });
    const error = await collect(client.subscribeRealtime({ now: () => NOW }).events).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(BeeCommandError);
    expect((error as Error).message).not.toContain(rawDetail);
  });

  it("closes the official subscription and suppresses cancellation failure", async () => {
    let reject!: (error: Error) => void;
    const close = vi.fn(() => reject(new Error("process killed")));
    const events = { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<JsonSseEvent<unknown>>>((_, rejectNext) => { reject = rejectNext; }) }) };
    const client = new BeeAdapterClient({ client: fakeClient(() => ({ events, close, process: {} } as never)) });
    const subscription = client.subscribeRealtime({ now: () => NOW });
    const collecting = collect(subscription.events);
    await Promise.resolve();
    subscription.close();
    await expect(collecting).resolves.toEqual([]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("preserves authentication failure classification before a watch subscribes", async () => {
    const client = fakeClient(() => fakeStream([]));
    client.auth.getProfile = vi.fn().mockRejectedValue(new Error("not logged in"));
    await expect(new BeeAdapterClient({ client }).ensureAuthenticated()).rejects.toBeInstanceOf(BeeAuthenticationError);
  });
});

function envelope(id: string, text: string): unknown {
  return { event: "new-utterance", id, data: { utterance: { text }, conversation_uuid: "conversation_synthetic_001" } };
}

function fakeStream(values: readonly unknown[]) {
  return {
    events: (async function* () { for (const data of values) yield { data, raw: "synthetic" }; })(),
    close: vi.fn(),
    process: {},
  } as never;
}

function failingStream(error: Error) {
  return {
    events: (async function* () { throw error; })(),
    close: vi.fn(),
    process: {},
  } as never;
}

function fakeClient(streamJson: BeeClient["sse"]["streamJson"]): BeeClient {
  const notImplemented = () => Promise.reject(new Error("not implemented"));
  return {
    auth: { getProfile: vi.fn().mockResolvedValue({}), isAuthenticated: vi.fn(), login: notImplemented, logout: notImplemented },
    api: {} as BeeClient["api"],
    sse: { streamJson },
    run: notImplemented,
    runJson: notImplemented,
  } as unknown as BeeClient;
}

async function collect(events: AsyncIterable<import("@cuenexa-loop/contracts").EphemeralRealtimeEvent>) {
  const collected = [];
  for await (const event of events) collected.push(event);
  return collected;
}
