import type { EphemeralRealtimeUtterance } from "@cuenexa-loop/contracts";
import { describe, expect, it } from "vitest";
import { ProvisionalAwareness } from "../provisional.js";

const NOW = "2026-09-12T08:00:00.000Z";

describe("ProvisionalAwareness", () => {
  it.each([
    ["I will send the synthetic pricing deck.", "possible_commitment"],
    ["I'll follow up with the synthetic vendor.", "possible_follow_up"],
    ["Morgan, please review the synthetic contract.", "possible_delegation"],
    ["Please deliver the synthetic report tomorrow.", "possible_deadline"],
  ] as const)("detects %s as %s", (text, type) => {
    const result = new ProvisionalAwareness().ingest(utterance(text), "UTC");
    expect(result.emitted.map((signal) => signal.type)).toContain(type);
  });

  it("does not infer resolution from completed-work language", () => {
    expect(new ProvisionalAwareness().ingest(utterance("I finished sending the synthetic report."), "UTC").emitted).toEqual([]);
  });

  it("replaces identifiable fragments without repeatedly emitting the same signal", () => {
    const awareness = new ProvisionalAwareness();
    const first = awareness.ingest(utterance("I will send", { id: "event_1", utteranceId: "utterance_1", final: false }), "UTC");
    const corrected = awareness.ingest(utterance("I will send the corrected synthetic deck.", {
      id: "event_2", utteranceId: "utterance_1", final: true,
    }), "UTC");

    expect(first.emitted).toHaveLength(1);
    expect(corrected.emitted).toEqual([]);
    expect(corrected.active).toHaveLength(1);
    expect(corrected.active[0]?.id).toBe(first.emitted[0]?.id);
    expect(corrected.active[0]?.ephemeralText).toContain("corrected synthetic deck");
  });

  it("keeps provisional observations separate across conversations", () => {
    const awareness = new ProvisionalAwareness();
    awareness.ingest(utterance("I will send synthetic alpha.", { id: "event_1", conversationId: "conversation_alpha" }), "UTC");
    awareness.ingest(utterance("I will send synthetic beta.", { id: "event_2", conversationId: "conversation_beta" }), "UTC");
    expect(awareness.list().map((signal) => signal.conversationId)).toEqual(["conversation_alpha", "conversation_beta"]);
  });

  it("bounds utterance groups and event dedupe memory", () => {
    const awareness = new ProvisionalAwareness({ maxUtterances: 2, dedupeLimit: 2 });
    for (let index = 1; index <= 3; index += 1) {
      awareness.ingest(utterance(`I will send synthetic item ${index}.`, {
        id: `event_${index}`, utteranceId: `utterance_${index}`,
        observedAt: `2026-09-12T08:00:0${index}.000Z`,
      }), "UTC");
    }
    expect(awareness.list()).toHaveLength(2);
    expect(awareness.list().map((signal) => signal.ephemeralText)).toEqual([
      "I will send synthetic item 2.", "I will send synthetic item 3.",
    ]);
    expect(awareness.ingest(utterance("I will send synthetic item 1.", {
      id: "event_1", utteranceId: "utterance_1", observedAt: "2026-09-12T08:00:04.000Z",
    }), "UTC").emitted).toHaveLength(1);
  });

  it("uses deterministic ordering and IDs for ties", () => {
    const event = utterance("I will follow up with the synthetic vendor tomorrow.", { utteranceId: "utterance_tie" });
    const first = new ProvisionalAwareness().ingest(event, "UTC").active;
    const second = new ProvisionalAwareness().ingest(event, "UTC").active;
    expect(second).toEqual(first);
    expect(first.map((signal) => signal.type)).toEqual([
      "possible_follow_up", "possible_deadline",
    ]);
  });

  it("expires silently and can retire only explicitly confirmed conversations", () => {
    const awareness = new ProvisionalAwareness({ ttlMs: 1_000 });
    awareness.ingest(utterance("I will send synthetic alpha.", { conversationId: "conversation_alpha" }), "UTC");
    expect(awareness.pruneExpired("2026-09-12T08:00:01.000Z")).toBe(1);
    expect(awareness.list()).toEqual([]);

    awareness.ingest(utterance("I will send synthetic beta.", { id: "event_beta", conversationId: "conversation_beta" }), "UTC");
    expect(awareness.retireConversations(new Set(["conversation_other"]))).toBe(0);
    expect(awareness.retireConversations(new Set(["conversation_beta"]))).toBe(1);
  });

  it("resolves a realtime session to an authoritative ID only from an explicit bridge", () => {
    const awareness = new ProvisionalAwareness();
    awareness.ingest(utterance("I will send synthetic alpha.", {
      conversationId: null, sessionId: "uuid-synthetic-001",
    }), "UTC");
    expect(awareness.retireConversations(new Set(["6531525"]))).toBe(0);
    expect(awareness.resolveConversationIdentity("unrelated-uuid", "6531525")).toBe(0);
    expect(awareness.resolveConversationIdentity("uuid-synthetic-001", "6531525")).toBe(1);
    expect(awareness.list()[0]?.conversationId).toBe("6531525");
    const corrected = awareness.ingest(utterance("I will send corrected synthetic alpha.", {
      id: "event_corrected", conversationId: "6531525", sessionId: "uuid-synthetic-001",
    }), "UTC");
    expect(corrected.emitted).toEqual([]);
    expect(corrected.active).toHaveLength(1);
    expect(awareness.retireConversations(new Set(["6531525"]))).toBe(1);
  });
});

function utterance(text: string, overrides: Partial<EphemeralRealtimeUtterance> = {}): EphemeralRealtimeUtterance {
  return {
    kind: "utterance",
    id: "event_synthetic_001",
    provider: "bee",
    providerEventId: null,
    sessionId: null,
    conversationId: "conversation_synthetic_001",
    utteranceId: "utterance_synthetic_001",
    observedAt: NOW,
    spokenAt: null,
    text,
    final: null,
    ...overrides,
  };
}
