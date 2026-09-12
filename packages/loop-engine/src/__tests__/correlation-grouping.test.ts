import type { LoopConversation } from "@cuenexa-loop/contracts";
import { describe, expect, it } from "vitest";
import { correlateLoopItems } from "../correlation/correlate.js";
import { scoreCorrelationPair } from "../correlation/scoring.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem } from "../types.js";

const NOW = "2026-02-10T12:00:00.000Z";

function item(id: string, conversationId: string, text: string, overrides: Partial<LoopItem> = {}): LoopItem {
  return LoopItemSchema.parse({
    id,
    type: "commitment",
    text,
    state: "open",
    confidence: 0.9,
    owner: null,
    counterparties: [],
    dueAt: null,
    dueAtPhrase: null,
    source: { provider: "bee", conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text }],
    createdAt: NOW,
    resolvedAt: null,
    ...overrides,
  });
}

function conversation(id: string, spokenAt: string | null = null, endedAt: string | null = null, startedAt: string | null = null): LoopConversation {
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

function correlate(
  items: LoopItem[],
  conversations = items.map((value) => {
    const conversationId = value.source.conversationId!;
    const day = conversationId === "conv-a" ? 1 : conversationId === "conv-b" ? 2 : 3;
    return conversation(conversationId, `2026-02-0${day}T10:00:00.000Z`);
  }),
) {
  return correlateLoopItems({
    items,
    conversations,
    facts: [],
    todos: [],
    now: NOW,
    snapshot: { observedAt: NOW, completeness: "complete" },
  });
}

describe("correlateLoopItems complete-link grouping", () => {
  const a = item("a", "conv-a", "I'll send the pricing deck.");
  const b = item("b", "conv-b", "Let's review the pricing deck and renewal proposal.");
  const c = item("c", "conv-c", "I'll finalize the renewal proposal.");

  it("does not create a transitive three-member Loop when A-C is rejected", () => {
    const context = { conversations: [
      conversation("conv-a", "2026-02-01T10:00:00.000Z"),
      conversation("conv-b", "2026-02-02T10:00:00.000Z"),
      conversation("conv-c", "2026-02-03T10:00:00.000Z"),
    ] };
    expect(scoreCorrelationPair(a, b, context).accepted).toBe(true);
    expect(scoreCorrelationPair(b, c, context).accepted).toBe(true);
    expect(scoreCorrelationPair(a, c, context).accepted).toBe(false);
    const result = correlate([a, b, c]);
    expect(result.loops.every((loop) => loop.members.length < 3)).toBe(true);
    expect(result.loops).toHaveLength(1);
  });

  it("creates a deterministic three-member Loop only when every pair is accepted", () => {
    const allStrong = [
      item("a", "conv-a", "I'll send the quarterly forecast."),
      item("b", "conv-b", "Please review the quarterly forecast."),
      item("c", "conv-c", "I'll finalize the quarterly forecast."),
    ];
    const forward = correlate(allStrong);
    const shuffled = correlate([allStrong[2]!, allStrong[0]!, allStrong[1]!]);

    expect(forward.loops).toHaveLength(1);
    expect(forward.loops[0]?.members).toHaveLength(3);
    expect(shuffled.loops).toEqual(forward.loops);
  });

  it("chooses the stronger competing complete-link group independently of input order", () => {
    const members = [
      item("a", "conv-a", "I'll send the vendor contract and quarterly forecast."),
      item("b", "conv-b", "Please review the vendor contract and quarterly forecast."),
      item("c", "conv-c", "I'll finalize the vendor contract."),
      item("d", "conv-d", "I'll finalize the quarterly forecast."),
    ];
    const conversations = [
      conversation("conv-a", "2026-02-01T10:00:00.000Z"),
      conversation("conv-b", "2026-02-02T10:00:00.000Z"),
      conversation("conv-c", "2026-02-03T10:00:00.000Z"),
      conversation("conv-d", "2026-02-04T10:00:00.000Z"),
    ];
    const forward = correlate(members, conversations);
    const shuffled = correlate([members[3]!, members[1]!, members[2]!, members[0]!], [...conversations].reverse());
    const expectedMemberIds = ["a", "b", "d"];

    expect(forward.loops).toHaveLength(1);
    expect(forward.loops[0]?.members.map((member) => member.itemId).sort()).toEqual(expectedMemberIds);
    expect(forward.loops[0]?.correlationConfidence).toBe(
      Math.min(...(forward.loops[0]?.correlationLinks ?? []).map((link) => link.confidence)),
    );
    expect(shuffled.loops).toEqual(forward.loops);
  });

  it("uses the weakest complete-link score as Loop confidence", () => {
    const sharedDue = "2026-02-20T00:00:00.000Z";
    const members = [
      item("a", "conv-a", "I'll send the vendor contract.", { dueAt: sharedDue }),
      item("b", "conv-b", "Please review the vendor contract.", { dueAt: sharedDue }),
      item("c", "conv-c", "I'll finalize the vendor contract."),
    ];
    const loop = correlate(members).loops[0]!;
    expect(loop.correlationConfidence).toBe(Math.min(...loop.correlationLinks.map((link) => link.confidence)));
    expect(loop.correlationConfidence).toBe(0.9);
  });

  it("preserves member provenance and changes only membership-sensitive identity", () => {
    const firstTwo = correlate([a, b]).loops[0]!;
    const allStrongC = item("c", "conv-c", "I'll send the pricing deck.");
    const three = correlate([a, b, allStrongC]).loops[0]!;

    expect(firstTwo.members.map((member) => member.item)).toEqual(expect.arrayContaining([a, b]));
    expect(firstTwo.id).not.toBe(three.id);
    expect(a.evidence[0]?.text).toBe("I'll send the pricing deck.");
  });

  it("keeps stable Loop identity when run-local item IDs change", () => {
    const original = correlate([a, b]).loops[0]!;
    const rerun = correlate([
      LoopItemSchema.parse({ ...a, id: "rerun-a", createdAt: "2030-01-01T00:00:00.000Z" }),
      LoopItemSchema.parse({ ...b, id: "rerun-b", createdAt: "2030-01-01T00:00:00.000Z" }),
    ]).loops[0]!;
    expect(rerun.id).toBe(original.id);
  });

  it("does not group same-conversation or different-provider items", () => {
    const sameConversation = item("same", "conv-a", "Please review the pricing deck.");
    const otherProvider = item("other", "conv-b", "Please review the pricing deck.", {
      source: { ...b.source, provider: "other" },
    });
    expect(correlate([a, sameConversation]).loops).toEqual([]);
    expect(correlate([a, otherProvider]).loops).toEqual([]);
  });
});
