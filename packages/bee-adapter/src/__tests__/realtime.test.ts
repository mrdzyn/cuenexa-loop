import type { BeeClient, JsonSseEvent } from "@beeai/cli/lib";
import { describe, expect, it, vi } from "vitest";
import { BeeAdapterClient } from "../bee-client.js";
import { BeeAuthenticationError, BeeCommandError } from "../errors.js";
import {
  BEE_REALTIME_EVENT_TYPES,
  BeeConversationIdentityBridge,
  normalizeBeeRealtimeEvent,
} from "../realtime.js";

const NOW = "2026-09-12T08:00:00.000Z";
const REALTIME_UUID = "uuid-synthetic-001";
const HISTORICAL_ID = "6531525";

describe("Bee 0.7.3 realtime payload normalization", () => {
  it("normalizes the documented raw new-utterance payload without an invented envelope", () => {
    const result = normalizeBeeRealtimeEvent(utterancePayload("I will send the synthetic pricing deck."), NOW);

    expect(result).toEqual({ event: {
      kind: "utterance",
      id: expect.stringMatching(/^bee_rt_[a-f0-9]{32}$/),
      provider: "bee",
      providerEventId: null,
      sessionId: REALTIME_UUID,
      conversationId: null,
      observedAt: NOW,
      utteranceId: "utterance-synthetic-001",
      spokenAt: null,
      text: "I will send the synthetic pricing deck.",
      final: true,
    } });
  });

  it("normalizes a documented new-conversation payload and records its explicit UUID-to-ID bridge", () => {
    const identities = new BeeConversationIdentityBridge();
    const result = normalizeBeeRealtimeEvent({
      conversation: { id: 6_531_525, uuid: REALTIME_UUID, state: "processing", title: "private synthetic title" },
    }, NOW, identities);

    expect(result).toHaveProperty("event.kind", "conversation_state");
    expect(result).toHaveProperty("event.conversationId", HISTORICAL_ID);
    expect(result).toHaveProperty("event.sessionId", REALTIME_UUID);
    expect(identities.authoritativeIdForUuid(REALTIME_UUID)).toBe(HISTORICAL_ID);
    expect(JSON.stringify(result)).not.toContain("private synthetic title");
  });

  it("normalizes an updated/processed conversation and resolves its UUID only from the proven bridge", () => {
    const identities = new BeeConversationIdentityBridge();
    identities.remember(REALTIME_UUID, HISTORICAL_ID);
    const result = normalizeBeeRealtimeEvent({
      conversation: { id: 6_531_525, state: "processed", title: "private", short_summary: "private" },
    }, NOW, identities);

    expect(result).toHaveProperty("event.kind", "conversation_state");
    expect(result).toHaveProperty("event.state", "processed");
    expect(result).toHaveProperty("event.conversationId", HISTORICAL_ID);
    expect(result).toHaveProperty("event.sessionId", REALTIME_UUID);
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("resolves later utterances to a historical ID only after an explicit Bee pair was observed", () => {
    const identities = new BeeConversationIdentityBridge();
    expect(normalizeBeeRealtimeEvent(utterancePayload("First fragment"), NOW, identities))
      .toHaveProperty("event.conversationId", null);
    normalizeBeeRealtimeEvent({ conversation: { id: 6_531_525, uuid: REALTIME_UUID, state: "processing" } }, NOW, identities);
    expect(normalizeBeeRealtimeEvent(utterancePayload("Later fragment"), NOW, identities))
      .toHaveProperty("event.conversationId", HISTORICAL_ID);
  });

  it("refuses conflicting UUID-to-ID mappings", () => {
    const identities = new BeeConversationIdentityBridge();
    expect(identities.remember(REALTIME_UUID, HISTORICAL_ID)).toBe(true);
    expect(identities.remember(REALTIME_UUID, "9999999")).toBe(false);
    expect(identities.authoritativeIdForUuid(REALTIME_UUID)).toBe(HISTORICAL_ID);
    expect(normalizeBeeRealtimeEvent({
      conversation: { id: 9_999_999, uuid: REALTIME_UUID, state: "processed" },
    }, NOW, identities)).toHaveProperty("warning.code", "malformed_event");
  });

  it("bounds the in-memory identity bridge and forgets its oldest explicit pair", () => {
    const identities = new BeeConversationIdentityBridge(1);
    expect(identities.remember(REALTIME_UUID, HISTORICAL_ID)).toBe(true);
    expect(identities.remember("uuid-synthetic-002", "6531526")).toBe(true);
    expect(identities.authoritativeIdForUuid(REALTIME_UUID)).toBeNull();
    expect(identities.uuidForAuthoritativeId(HISTORICAL_ID)).toBeNull();
    expect(identities.authoritativeIdForUuid("uuid-synthetic-002")).toBe("6531526");
  });

  it("returns fixed content-free warnings for malformed and unsupported raw payloads", () => {
    const identities = new BeeConversationIdentityBridge();
    expect(normalizeBeeRealtimeEvent({ utterance: {}, conversation_uuid: REALTIME_UUID }, NOW)).toEqual({
      warning: { code: "malformed_event", message: "Bee realtime event was malformed and was ignored." },
    });
    expect(normalizeBeeRealtimeEvent({
      conversation: { id: "not-a-numeric-history-id", uuid: REALTIME_UUID, state: "processed" },
    }, NOW)).toHaveProperty("warning.code", "malformed_event");
    expect(normalizeBeeRealtimeEvent({
      conversation: { id: 6_531_525, uuid: REALTIME_UUID },
    }, NOW, identities)).toHaveProperty("warning.code", "malformed_event");
    expect(identities.authoritativeIdForUuid(REALTIME_UUID)).toBeNull();
    expect(normalizeBeeRealtimeEvent({ todo: { text: "secret" } }, NOW)).toEqual({
      warning: { code: "unsupported_event", message: "Bee realtime event type is not supported and was ignored." },
    });
  });
});

describe("Bee realtime subscription", () => {
  it("requests only identifiable event types and deduplicates identical raw utterances", async () => {
    const streamJson = vi.fn(() => fakeStream([
      utterancePayload("Identical synthetic fragment"),
      utterancePayload("Identical synthetic fragment"),
      utterancePayload("Different synthetic fragment", "utterance-synthetic-002"),
    ]));
    const client = new BeeAdapterClient({ client: fakeClient(streamJson) });

    const events = await collect(client.subscribeRealtime({ now: () => NOW }).events);

    expect(BEE_REALTIME_EVENT_TYPES).toEqual(["new-utterance", "new-conversation", "update-conversation"]);
    expect(streamJson).toHaveBeenCalledWith({ types: [...BEE_REALTIME_EVENT_TYPES], signal: undefined });
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.providerEventId === null)).toBe(true);
  });

  it("shares the bounded identity bridge across raw payloads in one subscription", async () => {
    const client = new BeeAdapterClient({ client: fakeClient(() => fakeStream([
      utterancePayload("Before mapping", "utterance-before"),
      { conversation: { id: 6_531_525, uuid: REALTIME_UUID, state: "processing" } },
      utterancePayload("After mapping", "utterance-after"),
    ])) });

    const events = await collect(client.subscribeRealtime({ now: () => NOW }).events);
    expect(events.map((event) => event.conversationId)).toEqual([null, HISTORICAL_ID, HISTORICAL_ID]);
  });

  it("retains proven identity pairs across reconnect subscriptions in one adapter process", async () => {
    const streamJson = vi.fn()
      .mockReturnValueOnce(fakeStream([
        { conversation: { id: 6_531_525, uuid: REALTIME_UUID, state: "processing" } },
      ]))
      .mockReturnValueOnce(fakeStream([
        utterancePayload("After reconnect", "utterance-after-reconnect"),
      ]));
    const client = new BeeAdapterClient({ client: fakeClient(streamJson) });

    await collect(client.subscribeRealtime({ now: () => NOW }).events);
    const afterReconnect = await collect(client.subscribeRealtime({ now: () => NOW }).events);
    expect(afterReconnect[0]?.conversationId).toBe(HISTORICAL_ID);
  });

  it("reports a malformed raw payload and continues with a later valid payload", async () => {
    const warnings: string[] = [];
    const client = new BeeAdapterClient({ client: fakeClient(() => fakeStream([
      { utterance: {}, conversation_uuid: REALTIME_UUID },
      utterancePayload("Valid synthetic fragment"),
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

function utterancePayload(text: string, id = "utterance-synthetic-001"): unknown {
  return {
    utterance: { id, text, speaker: "speaker_1", final: true },
    conversation_uuid: REALTIME_UUID,
  };
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
