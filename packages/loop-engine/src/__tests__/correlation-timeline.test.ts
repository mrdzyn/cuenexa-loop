import type { LoopConversation } from "@cuenexa-loop/contracts";
import { describe, expect, it } from "vitest";
import { buildLoopTimeline } from "../correlation/timeline.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem } from "../types.js";

const NOW = "2026-08-01T00:00:00.000Z";

function item(id: string, conversationId: string, createdAt = NOW): LoopItem {
  const text = "I'll send the security assessment.";
  return LoopItemSchema.parse({
    id, type: "commitment", text, state: "open", confidence: 0.9, owner: null, counterparties: [], dueAt: null,
    dueAtPhrase: null,
    source: { provider: "bee", conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text }],
    createdAt,
    resolvedAt: null,
  });
}

function conversation(id: string, spokenAt: string | null, endedAt: string | null, startedAt: string | null): LoopConversation {
  return {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt: NOW },
    startedAt,
    endedAt,
    summary: "Synthetic fixture",
    detailedSummary: null,
    location: null,
    deviceType: null,
    utterances: [{ speaker: null, text: "Synthetic fixture", spokenAt }],
  };
}

describe("buildLoopTimeline", () => {
  it("uses utterance, endedAt, startedAt, then unavailable precedence", () => {
    const items = [item("utterance", "conv-u"), item("ended", "conv-e"), item("started", "conv-s"), item("missing", "conv-m")];
    const conversations = [
      conversation("conv-u", "2026-01-01T10:00:00.000Z", "2026-07-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"),
      conversation("conv-e", null, "2026-02-01T10:00:00.000Z", "2026-01-01T00:00:00.000Z"),
      conversation("conv-s", null, null, "2026-03-01T10:00:00.000Z"),
      conversation("conv-m", null, null, null),
    ];
    const timeline = buildLoopTimeline(items, conversations);

    expect(timeline.map((event) => event.timestampSource)).toEqual([
      "utterance", "conversation_ended", "conversation_started", "unavailable",
    ]);
    expect(timeline.at(-1)?.occurredAt).toBeNull();
  });

  it("sorts equal and missing timestamps deterministically after known timestamps", () => {
    const a = item("a", "conv-a");
    const b = item("b", "conv-b");
    const c = item("c", "conv-c");
    const conversations = [
      conversation("conv-a", null, null, null),
      conversation("conv-b", "2026-01-01T00:00:00.000Z", null, null),
      conversation("conv-c", "2026-01-01T00:00:00.000Z", null, null),
    ];
    expect(buildLoopTimeline([a, b, c], conversations)).toEqual(buildLoopTimeline([c, a, b], conversations));
    expect(buildLoopTimeline([a, b, c], conversations)[2]?.timestampSource).toBe("unavailable");
  });

  it("never uses LoopItem.createdAt and does not mutate input", () => {
    const first = item("a", "conv-a", "1999-01-01T00:00:00.000Z");
    const second = item("b", "conv-b", "2099-01-01T00:00:00.000Z");
    const before = structuredClone([first, second]);
    const timeline = buildLoopTimeline([first, second], []);

    expect(timeline.every((event) => event.occurredAt === null)).toBe(true);
    expect([first, second]).toEqual(before);
  });
});
