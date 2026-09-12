import { describe, expect, it } from "vitest";
import { extractCorrelationAnchors } from "../correlation/anchors.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem } from "../types.js";

function makeItem(text: string): LoopItem {
  return LoopItemSchema.parse({
    id: "item-anchor",
    type: "commitment",
    text,
    state: "open",
    confidence: 0.9,
    owner: null,
    counterparties: [],
    dueAt: null,
    dueAtPhrase: null,
    source: { provider: "test", conversationId: "conv-anchor", factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: "conv-anchor", text }],
    createdAt: "2026-02-01T12:00:00.000Z",
    resolvedAt: null,
  });
}

describe("extractCorrelationAnchors", () => {
  it("extracts specific phrases consistently across case and punctuation", () => {
    const first = extractCorrelationAnchors(makeItem("Send the Pricing Deck!"));
    const second = extractCorrelationAnchors(makeItem("send pricing-deck."));

    expect(first).toEqual(second);
    expect(first.specificTokens).toEqual(["deck", "pricing"]);
    expect(first.specificPhrases).toContain("pricing deck");
  });

  it("retains meaningful subject phrases such as quarterly forecast and vendor contract", () => {
    const anchors = extractCorrelationAnchors(makeItem("Review the quarterly forecast and vendor contract."));

    expect(anchors.specificPhrases).toEqual(expect.arrayContaining(["quarterly forecast", "vendor contract"]));
  });

  it("never lets action, timing, or courtesy tokens strengthen an adjacent phrase", () => {
    const sendAnchors = extractCorrelationAnchors(makeItem("Send the revised budget."));
    const reviewAnchors = extractCorrelationAnchors(makeItem("Review the final proposal."));
    const timingAnchors = extractCorrelationAnchors(makeItem("Please update the final report tomorrow."));

    expect(sendAnchors.specificPhrases).not.toContain("send revised");
    expect(reviewAnchors.specificPhrases).not.toContain("review final");
    expect(timingAnchors.specificPhrases).not.toEqual(expect.arrayContaining(["please update", "update final", "report tomorrow"]));
  });

  it("does not mutate Phase 1A item text or evidence", () => {
    const item = makeItem("Review the quarterly forecast.");
    const before = structuredClone(item);

    extractCorrelationAnchors(item);

    expect(item).toEqual(before);
  });

  it("does not treat generic action language as specific anchors", () => {
    const anchors = extractCorrelationAnchors(makeItem("Send the report tomorrow. Follow up with the vendor."));

    expect(anchors.specificTokens).toEqual([]);
    expect(anchors.specificPhrases).toEqual([]);
  });
});
