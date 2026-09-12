import { describe, expect, it } from "vitest";
import { evaluatePairEligibility } from "../correlation/eligibility.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem, LoopItemType } from "../types.js";

function makeItem(
  id: string,
  conversationId: string | null,
  text: string,
  type: LoopItemType = "commitment",
  provider = "test-provider",
  state: LoopItem["state"] = "open",
): LoopItem {
  return LoopItemSchema.parse({
    id,
    type,
    text,
    state,
    confidence: 0.9,
    owner: null,
    counterparties: [],
    dueAt: null,
    dueAtPhrase: null,
    source: { provider, conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text }],
    createdAt: "2026-02-01T12:00:00.000Z",
    resolvedAt: null,
  });
}

describe("evaluatePairEligibility", () => {
  it("accepts compatible action items with a shared pricing deck anchor", () => {
    const result = evaluatePairEligibility(
      makeItem("a", "conv-a", "I'll send the revised pricing deck."),
      makeItem("b", "conv-b", "Please review the revised pricing deck.", "follow_up"),
    );

    expect(result.eligible).toBe(true);
    expect(result.sharedSpecificAnchorCount).toBeGreaterThanOrEqual(2);
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["same_action_family", "shared_specific_anchor_phrase"]));
  });

  it("accepts quarterly forecast across distinct conversations", () => {
    const result = evaluatePairEligibility(
      makeItem("a", "conv-a", "I'll prepare the quarterly forecast."),
      makeItem("b", "conv-b", "Please review the quarterly forecast.", "delegation"),
    );
    expect(result.eligible).toBe(true);
  });

  it.each([
    ["Follow up with the vendor.", "Follow up with the vendor."],
    ["Send the report tomorrow.", "Send the report tomorrow."],
  ])("rejects generic false-positive pair %s / %s", (firstText, secondText) => {
    const result = evaluatePairEligibility(makeItem("a", "conv-a", firstText), makeItem("b", "conv-b", secondText));
    expect(result.eligible).toBe(false);
    expect(result.rejectionReasonCodes).toContain("generic_language_only");
  });

  it.each([
    ["Send the revised budget.", "Send the revised contract."],
    ["Review the final proposal.", "Review the final budget."],
  ])("rejects pairs that only share a generic action/modifier fragment", (firstText, secondText) => {
    const result = evaluatePairEligibility(makeItem("a", "conv-a", firstText), makeItem("b", "conv-b", secondText));

    expect(result.eligible).toBe(false);
    expect(result.rejectionReasonCodes).toContain("generic_language_only");
    expect(result.hasSharedSpecificAnchorPhrase).toBe(false);
  });

  it.each([
    ["I'll send the pricing deck.", "Please review the pricing deck."],
    ["I'll prepare the quarterly forecast.", "Please review the quarterly forecast."],
    ["I'll send the vendor contract.", "Please review the vendor contract."],
  ])("retains meaningful domain phrase eligibility for %s", (firstText, secondText) => {
    const result = evaluatePairEligibility(makeItem("a", "conv-a", firstText), makeItem("b", "conv-b", secondText));

    expect(result.eligible).toBe(true);
    expect(result.hasSharedSpecificAnchorPhrase).toBe(true);
  });

  it("rejects two items from the same conversation", () => {
    const result = evaluatePairEligibility(
      makeItem("a", "conv-a", "I'll send the pricing deck."),
      makeItem("b", "conv-a", "Please review the pricing deck."),
    );
    expect(result.eligible).toBe(false);
    expect(result.rejectionReasonCodes).toContain("same_conversation");
  });

  it("rejects provider conflicts and missing conversation context", () => {
    expect(
      evaluatePairEligibility(
        makeItem("a", "conv-a", "I'll send the pricing deck."),
        makeItem("b", "conv-b", "Please review the pricing deck.", "commitment", "other-provider"),
      ).rejectionReasonCodes,
    ).toContain("different_provider");
    expect(
      evaluatePairEligibility(makeItem("a", null, "I'll send the pricing deck."), makeItem("b", "conv-b", "Review the pricing deck.")).rejectionReasonCodes,
    ).toContain("missing_conversation_context");
  });

  it("allows decision-to-action only with a shared phrase and two specific anchors", () => {
    const strong = evaluatePairEligibility(
      makeItem("a", "conv-a", "We're going with the quarterly forecast.", "decision"),
      makeItem("b", "conv-b", "I'll send the quarterly forecast."),
    );
    const weak = evaluatePairEligibility(
      makeItem("a", "conv-a", "We're going with the contract.", "decision"),
      makeItem("b", "conv-b", "I'll send the vendor contract."),
    );

    expect(strong.eligible).toBe(true);
    expect(strong.reasonCodes).toContain("decision_to_action");
    expect(weak.eligible).toBe(false);
    expect(weak.rejectionReasonCodes).toContain("decision_requires_strong_anchor");
  });

  it("rejects incompatible and open-question item families conservatively", () => {
    const decisionPair = evaluatePairEligibility(
      makeItem("a", "conv-a", "We're going with the pricing deck.", "decision"),
      makeItem("b", "conv-b", "We decided on the pricing deck.", "decision"),
    );
    const questionPair = evaluatePairEligibility(
      makeItem("a", "conv-a", "Who owns the pricing deck?", "open_question"),
      makeItem("b", "conv-b", "Who owns the pricing deck?", "open_question"),
    );

    expect(decisionPair.eligible).toBe(false);
    expect(decisionPair.rejectionReasonCodes).toContain("incompatible_item_families");
    expect(questionPair.eligible).toBe(false);
    expect(questionPair.rejectionReasonCodes).toContain("open_question_conservative");
  });

  it("is deterministic regardless of argument order", () => {
    const first = makeItem("a", "conv-a", "I'll send the pricing deck.");
    const second = makeItem("b", "conv-b", "Please review the pricing deck.", "delegation");
    expect(evaluatePairEligibility(first, second)).toEqual(evaluatePairEligibility(second, first));
  });

  it.each(["provisional", "dismissed"] as const)("rejects %s items as correlation seeds", (state) => {
    const result = evaluatePairEligibility(
      makeItem("a", "conv-a", "I'll send the pricing deck.", "commitment", "test-provider", state),
      makeItem("b", "conv-b", "Please review the pricing deck."),
    );

    expect(result.eligible).toBe(false);
    expect(result.rejectionReasonCodes).toContain("ineligible_item_state");
  });
});
