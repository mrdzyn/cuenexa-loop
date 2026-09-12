import type { LoopConversation } from "@cuenexa-loop/contracts";
import { describe, expect, it } from "vitest";
import { scoreCorrelationPair } from "../correlation/scoring.js";
import { LoopCorrelationLinkSchema, MINIMUM_LOOP_CORRELATION_CONFIDENCE } from "../loop-types.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem, LoopItemType, LoopItemState } from "../types.js";

const NOW = "2026-02-10T12:00:00.000Z";

function makeItem(
  id: string,
  conversationId: string,
  text: string,
  overrides: Partial<LoopItem> = {},
): LoopItem {
  return LoopItemSchema.parse({
    id,
    type: "commitment" as LoopItemType,
    text,
    state: "open" as LoopItemState,
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

function makeConversation(id: string, spokenAt: string | null): LoopConversation {
  return {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt: NOW },
    startedAt: null,
    endedAt: null,
    summary: "Synthetic correlation fixture.",
    detailedSummary: null,
    location: null,
    deviceType: null,
    utterances: [{ speaker: null, text: "Synthetic correlation fixture.", spokenAt }],
  };
}

const chronology = {
  conversations: [
    makeConversation("conv-a", "2026-02-01T10:00:00.000Z"),
    makeConversation("conv-b", "2026-02-03T10:00:00.000Z"),
  ],
};

describe("scoreCorrelationPair", () => {
  it.each([
    ["I'll send the pricing deck.", "Please review the pricing deck."],
    ["I'll update the quarterly forecast.", "Please review the quarterly forecast."],
    ["I'll send the vendor contract.", "Please review the vendor contract."],
  ])("accepts a strong specific subject pair: %s", (firstText, secondText) => {
    const result = scoreCorrelationPair(makeItem("a", "conv-a", firstText), makeItem("b", "conv-b", secondText), chronology);

    expect(result.eligible).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(MINIMUM_LOOP_CORRELATION_CONFIDENCE);
  });

  it.each([
    ["Send the report tomorrow.", "Send the report tomorrow."],
    ["Follow up with the vendor tomorrow.", "Follow up with the vendor tomorrow."],
    ["Send the revised budget.", "Send the revised contract."],
    ["Review the final proposal.", "Review the final budget."],
    ["Email the client after the meeting.", "Email the client after the meeting."],
  ])("rejects generic or action/modifier false positives: %s", (firstText, secondText) => {
    const result = scoreCorrelationPair(makeItem("a", "conv-a", firstText), makeItem("b", "conv-b", secondText), chronology);
    expect(result.eligible).toBe(false);
    expect(result.accepted).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("keeps supporting metadata below threshold without a strong phrase", () => {
    const dueAt = "2026-02-20T00:00:00.000Z";
    const first = makeItem("a", "conv-a", "Prepare Azure detailed migration", { owner: { label: "Alex" }, dueAt });
    const second = makeItem("b", "conv-b", "Finalize Azure careful migration", { owner: { label: " alex " }, dueAt });
    const result = scoreCorrelationPair(first, second, chronology);

    expect(result.eligible).toBe(true);
    expect(result.hasSharedSpecificAnchorPhrase).toBe(false);
    expect(result.supportingSignals).toEqual({ chronologicalContinuation: true, matchingDueDate: true, matchingOwner: true });
    expect(result.confidence).toBeLessThan(MINIMUM_LOOP_CORRELATION_CONFIDENCE);
    expect(result.accepted).toBe(false);
  });

  it.each([
    ["action family", {}, {}],
    ["owner", { owner: { label: "Alex" } }, { owner: { label: "alex" } }],
    ["due date", { dueAt: "2026-02-20T00:00:00.000Z" }, { dueAt: "2026-02-20T00:00:00.000Z" }],
    ["chronology", {}, {}],
  ])("does not correlate from %s alone", (_label, firstOverrides, secondOverrides) => {
    const result = scoreCorrelationPair(
      makeItem("a", "conv-a", "Send the report tomorrow.", firstOverrides),
      makeItem("b", "conv-b", "Send the report tomorrow.", secondOverrides),
      chronology,
    );
    expect(result.accepted).toBe(false);
    expect(result.confidence).toBeLessThan(MINIMUM_LOOP_CORRELATION_CONFIDENCE);
  });

  it("caps confidence at 1.0 and emits stable structural reasons", () => {
    const shared = { owner: { label: "Alex" }, dueAt: "2026-02-20T00:00:00.000Z" };
    const first = makeItem("a", "conv-a", "Prepare the detailed quarterly forecast.", shared);
    const second = makeItem("b", "conv-b", "Prepare the detailed quarterly forecast.", shared);
    const forward = scoreCorrelationPair(first, second, chronology);
    const reverse = scoreCorrelationPair(second, first, chronology);

    expect(forward.confidence).toBe(1);
    expect(forward).toEqual(reverse);
    expect(forward.reasonCodes).toEqual([...forward.reasonCodes].sort());
  });

  it("retains provider, conversation, state, and decision hard gates", () => {
    const action = makeItem("a", "conv-a", "I'll send the renewal proposal.");
    const differentProvider = makeItem("b", "conv-b", "Please review the renewal proposal.", {
      source: { ...action.source, conversationId: "conv-b", provider: "other" },
    });
    const sameConversation = makeItem("c", "conv-a", "Please review the renewal proposal.");
    const provisional = makeItem("d", "conv-b", "Please review the renewal proposal.", { state: "provisional" });
    const weakDecision = makeItem("e", "conv-b", "We approved the proposal.", { type: "decision" });

    expect(scoreCorrelationPair(action, differentProvider).accepted).toBe(false);
    expect(scoreCorrelationPair(action, sameConversation).accepted).toBe(false);
    expect(scoreCorrelationPair(action, provisional).rejectionReasonCodes).toContain("ineligible_item_state");
    expect(scoreCorrelationPair(action, weakDecision).rejectionReasonCodes).toContain("decision_requires_strong_anchor");
  });

  it("accepts decision-to-action only with strong renewal-proposal anchors", () => {
    const decision = makeItem("a", "conv-a", "We approved the renewal proposal.", { type: "decision" });
    const action = makeItem("b", "conv-b", "I'll send the renewal proposal.");
    const result = scoreCorrelationPair(decision, action, chronology);
    expect(result.accepted).toBe(true);
    expect(result.reasonCodes).toContain("decision_to_action");
  });

  it("never turns a below-threshold score into a valid emitted link", () => {
    const result = scoreCorrelationPair(
      makeItem("a", "conv-a", "Prepare Azure detailed migration"),
      makeItem("b", "conv-b", "Finalize Azure careful migration"),
      chronology,
    );
    expect(result.accepted).toBe(false);
    expect(LoopCorrelationLinkSchema.safeParse({
      fromItemId: "a",
      toItemId: "b",
      confidence: result.confidence,
      reasonCodes: result.reasonCodes,
      sharedSpecificAnchorCount: result.sharedSpecificAnchorCount,
    }).success).toBe(false);
  });

  it("does not mutate source items", () => {
    const first = makeItem("a", "conv-a", "I'll send the pricing deck.");
    const second = makeItem("b", "conv-b", "Please review the pricing deck.");
    const before = structuredClone([first, second]);
    scoreCorrelationPair(first, second, chronology);
    expect([first, second]).toEqual(before);
  });
});
