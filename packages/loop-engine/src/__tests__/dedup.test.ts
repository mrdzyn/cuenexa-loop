import { describe, expect, it } from "vitest";
import { deduplicateCandidates } from "../dedup.js";
import type { DetectionCandidate } from "../types.js";

function makeCandidate(overrides: Partial<DetectionCandidate>): DetectionCandidate {
  return {
    type: "commitment",
    text: "Send the estimate",
    confidence: 0.9,
    owner: null,
    counterparties: [],
    dueAt: null,
    dueAtPhrase: null,
    source: { provider: "bee", conversationId: null, factId: null, todoId: null, utteranceIndexes: [] },
    evidence: [{ type: "utterance", sourceId: "conv_1", text: "I'll send the estimate tomorrow." }],
    ...overrides,
  };
}

describe("deduplicateCandidates", () => {
  it("merges a conversation commitment and a matching Bee Todo into one candidate", () => {
    const conversationCandidate = makeCandidate({
      confidence: 0.9,
      source: { provider: "bee", conversationId: "conv_1", factId: null, todoId: null, utteranceIndexes: [0] },
      evidence: [{ type: "utterance", sourceId: "conv_1", text: "I'll send the estimate tomorrow." }],
    });
    const todoCandidate = makeCandidate({
      confidence: 0.95,
      source: { provider: "bee", conversationId: null, factId: null, todoId: "todo_1", utteranceIndexes: [] },
      evidence: [{ type: "todo", sourceId: "todo_1", text: "Send the estimate tomorrow" }],
    });

    const result = deduplicateCandidates([conversationCandidate, todoCandidate]);

    expect(result).toHaveLength(1);
    expect(result[0]?.evidence).toHaveLength(2);
    expect(result[0]?.confidence).toBe(0.95);
    expect(result[0]?.source.conversationId).toBe("conv_1");
    expect(result[0]?.source.todoId).toBe("todo_1");
  });

  it("does not merge different actions that share a common carrier phrase", () => {
    // "I'll send the estimate/invoice/contract tomorrow" share 3 of 4
    // tokens ("send", "tomorrow", and the contraction fragment) — similar
    // enough to look related, but these are three different commitments,
    // not the same action restated. This is a regression guard for a
    // real over-merge bug found while building the CLI presenter.
    const estimate = makeCandidate({
      evidence: [{ type: "utterance", sourceId: "conv_1", text: "I'll send the estimate tomorrow." }],
    });
    const invoice = makeCandidate({
      evidence: [{ type: "utterance", sourceId: "conv_1", text: "I'll send the invoice tomorrow." }],
    });
    const contract = makeCandidate({
      evidence: [{ type: "utterance", sourceId: "conv_1", text: "I'll send the contract tomorrow." }],
    });

    const result = deduplicateCandidates([estimate, invoice, contract]);

    expect(result).toHaveLength(3);
  });

  it("keeps unrelated candidates separate", () => {
    const a = makeCandidate({ evidence: [{ type: "utterance", sourceId: "conv_1", text: "I'll send the estimate tomorrow." }] });
    const b = makeCandidate({ evidence: [{ type: "utterance", sourceId: "conv_1", text: "Who owns the deployment?" }], type: "open_question" });

    const result = deduplicateCandidates([a, b]);

    expect(result).toHaveLength(2);
  });

  it("does not merge a decision into a matching open Todo", () => {
    const decision = makeCandidate({ type: "decision", confidence: 0.85, evidence: [{ type: "utterance", sourceId: "conv_1", text: "We'll proceed with option B." }] });
    const todo = makeCandidate({ confidence: 0.95, source: { provider: "bee", conversationId: null, factId: null, todoId: "todo_1", utteranceIndexes: [] }, evidence: [{ type: "todo", sourceId: "todo_1", text: "Proceed with option B" }] });

    const result = deduplicateCandidates([decision, todo]);

    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe("decision");
  });

  it("preserves delegation and owner semantics when merging a matching Todo", () => {
    const delegation = makeCandidate({ type: "delegation", confidence: 0.85, owner: { label: "Alex" }, source: { provider: "bee", conversationId: "conv_1", factId: null, todoId: null, utteranceIndexes: [0] }, evidence: [{ type: "utterance", sourceId: "conv_1", text: "Alex, please prepare the report." }] });
    const todo = makeCandidate({ confidence: 0.95, source: { provider: "bee", conversationId: null, factId: null, todoId: "todo_1", utteranceIndexes: [] }, evidence: [{ type: "todo", sourceId: "todo_1", text: "Alex prepare the report" }] });

    const result = deduplicateCandidates([delegation, todo]);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("delegation");
    expect(result[0]?.owner).toEqual({ label: "Alex" });
    expect(result[0]?.evidence).toHaveLength(2);
  });

  it("preserves utterance indexes from both merged candidates", () => {
    const a = makeCandidate({
      source: { provider: "bee", conversationId: "conv_1", factId: null, todoId: null, utteranceIndexes: [0] },
      evidence: [{ type: "utterance", sourceId: "conv_1", text: "I'll send the estimate tomorrow." }],
    });
    const b = makeCandidate({
      source: { provider: "bee", conversationId: "conv_1", factId: null, todoId: null, utteranceIndexes: [3] },
      evidence: [{ type: "utterance", sourceId: "conv_1", text: "Send the estimate tomorrow." }],
    });

    const result = deduplicateCandidates([a, b]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source.utteranceIndexes).toEqual([0, 3]);
  });

  it("never merges candidates from two distinct conversations, even with identical text (Phase 1A scope)", () => {
    const a = makeCandidate({
      source: { provider: "bee", conversationId: "conv_a", factId: null, todoId: null, utteranceIndexes: [0] },
      evidence: [{ type: "utterance", sourceId: "conv_a", text: "I'll send the estimate tomorrow." }],
    });
    const b = makeCandidate({
      source: { provider: "bee", conversationId: "conv_b", factId: null, todoId: null, utteranceIndexes: [0] },
      evidence: [{ type: "utterance", sourceId: "conv_b", text: "I'll send the estimate tomorrow." }],
    });

    const result = deduplicateCandidates([a, b]);

    expect(result).toHaveLength(2);
  });

  it("is a no-op for a single candidate", () => {
    const only = makeCandidate({});
    expect(deduplicateCandidates([only])).toEqual([only]);
  });

  it("handles an empty list", () => {
    expect(deduplicateCandidates([])).toEqual([]);
  });
});
