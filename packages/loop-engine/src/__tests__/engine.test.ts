import { describe, expect, it } from "vitest";
import { SUPPRESSION_THRESHOLD } from "../confidence.js";
import { detectLoopItems } from "../engine.js";
import { makeConversation, makeFact, makeTodo, NOW } from "../fixtures/synthetic-loop-data.js";

function detect(overrides: Partial<Parameters<typeof detectLoopItems>[0]> = {}) {
  return detectLoopItems({ conversations: [], facts: [], todos: [], now: NOW, ...overrides });
}

describe("detectLoopItems — synthetic scenarios", () => {
  it("explicit commitment: 'I'll send the revised proposal tomorrow.'", () => {
    const result = detect({ conversations: [makeConversation(["I'll send the revised proposal tomorrow."])] });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("commitment");
    expect(result.items[0]?.text).toBe("Send the revised proposal");
    expect(result.items[0]?.dueAt).toBe("2026-01-06T00:00:00.000Z");
  });

  it("non-commitment: 'I might send the proposal tomorrow.'", () => {
    const result = detect({ conversations: [makeConversation(["I might send the proposal tomorrow."])] });
    expect(result.items).toHaveLength(0);
  });

  it("explicit decision: 'We're going with Cloudflare.'", () => {
    const result = detect({ conversations: [makeConversation(["We're going with Cloudflare."])] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("decision");
  });

  it("proposal, not decision: 'Maybe we should use Cloudflare.'", () => {
    const result = detect({ conversations: [makeConversation(["Maybe we should use Cloudflare."])] });
    expect(result.items).toHaveLength(0);
  });

  it("delegation: 'Alex, please prepare the report by Friday.'", () => {
    const result = detect({ conversations: [makeConversation(["Alex, please prepare the report by Friday."])] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("delegation");
    expect(result.items[0]?.owner).toEqual({ label: "Alex" });
  });

  it("open question: 'Who owns the deployment?'", () => {
    const result = detect({ conversations: [makeConversation(["Who owns the deployment?"])] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("open_question");
  });

  it("follow-up: 'I'll check with the vendor tomorrow.' produces exactly one item", () => {
    const result = detect({ conversations: [makeConversation(["I'll check with the vendor tomorrow."])] });
    expect(result.items).toHaveLength(1);
    expect(["follow_up", "commitment"]).toContain(result.items[0]?.type);
  });

  it("negation: 'I won't send the proposal yet.' produces no commitment", () => {
    const result = detect({ conversations: [makeConversation(["I won't send the proposal yet."])] });
    expect(result.items).toHaveLength(0);
  });

  it("todo deduplication: matching conversation commitment and Bee Todo merge into one item with multiple evidence", () => {
    const result = detect({
      conversations: [makeConversation(["I'll send the estimate tomorrow."])],
      todos: [makeTodo("Send the estimate tomorrow")],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.evidence).toHaveLength(2);
    expect(result.items[0]?.evidence.map((e) => e.type).sort()).toEqual(["todo", "utterance"]);
  });

  it("noise: weather, small talk, greetings, and filler produce no Loop items", () => {
    // Deliberately no "How's it going?"-style social question here — a
    // bare "?" is structurally indistinguishable from an open question
    // without deeper rhetorical analysis, which is out of Phase 1A scope
    // (see docs/LOOP-DETECTION.md, "Limitations").
    const result = detect({
      conversations: [
        makeConversation([
          "The weather has been really nice lately.",
          "Good morning everyone, thanks for joining.",
          "So, yeah, anyway.",
        ]),
      ],
    });

    expect(result.items).toHaveLength(0);
  });
});

describe("detectLoopItems — Bee Todos as evidence", () => {
  it("an open Bee Todo produces a commitment item on its own", () => {
    const result = detect({ todos: [makeTodo("Send the estimate to the client")] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("commitment");
    expect(result.items[0]?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("a completed Bee Todo does not produce a Loop item", () => {
    const result = detect({ todos: [makeTodo("Send the estimate to the client", { status: "completed" })] });
    expect(result.items).toHaveLength(0);
  });

  it("prefers Bee's own resolved dueAt over re-parsing todo text", () => {
    const result = detect({
      todos: [makeTodo("Send the estimate tomorrow", { dueAt: "2026-02-01T00:00:00.000Z" })],
    });
    expect(result.items[0]?.dueAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("classifies a follow-up-shaped todo as follow_up", () => {
    const result = detect({ todos: [makeTodo("Follow up with the vendor about pricing")] });
    expect(result.items[0]?.type).toBe("follow_up");
  });
});

describe("detectLoopItems — Bee Facts are conservative", () => {
  it("a purely descriptive fact produces no Loop item", () => {
    const result = detect({ facts: [makeFact("Prefers morning meetings.")] });
    expect(result.items).toHaveLength(0);
  });

  it("a fact phrased as an explicit open question does produce a Loop item", () => {
    const result = detect({ facts: [makeFact("Open question: who owns deployment?")] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("open_question");
  });
});

describe("detectLoopItems — confidence and suppression", () => {
  it("never emits an item below the suppression threshold", () => {
    const result = detect({
      conversations: [makeConversation(["I'll send the revised proposal tomorrow.", "Who owns the deployment?"])],
    });
    for (const item of result.items) {
      expect(item.confidence).toBeGreaterThanOrEqual(SUPPRESSION_THRESHOLD);
    }
  });
});

describe("detectLoopItems — provenance and evidence", () => {
  it("every item carries source and evidence traceable to the originating record", () => {
    const conversation = makeConversation(["Just chatting.", "I'll send the revised proposal tomorrow."]);
    const result = detect({ conversations: [conversation] });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item?.source.provider).toBe("bee");
    expect(item?.source.conversationId).toBe(conversation.id);
    expect(item?.source.utteranceIndexes).toEqual([1]); // the commitment is the second utterance (index 1)
    expect(item?.evidence).toHaveLength(1);
    expect(item?.evidence[0]).toEqual({
      type: "utterance",
      sourceId: conversation.id,
      text: "I'll send the revised proposal tomorrow.",
    });
  });

  it("a fact-derived item carries the fact id in source and evidence", () => {
    const fact = makeFact("Who owns deployment?");
    const result = detect({ facts: [fact] });

    expect(result.items[0]?.source.factId).toBe(fact.id);
    expect(result.items[0]?.evidence[0]).toEqual({ type: "fact", sourceId: fact.id, text: "Who owns deployment?" });
  });

  it("a todo-derived item carries the todo id in source and evidence", () => {
    const todo = makeTodo("Send the estimate to the client");
    const result = detect({ todos: [todo] });

    expect(result.items[0]?.source.todoId).toBe(todo.id);
    expect(result.items[0]?.evidence[0]?.sourceId).toBe(todo.id);
  });
});

describe("detectLoopItems — malformed/missing input", () => {
  it("skips an empty utterance without throwing, and warns", () => {
    const result = detect({ conversations: [makeConversation(["", "I'll send the revised proposal tomorrow."])] });

    expect(result.items).toHaveLength(1);
    expect(result.warnings.some((w) => w.field === "utterance")).toBe(true);
  });

  it("skips an empty fact without throwing, and warns", () => {
    const result = detect({ facts: [makeFact("")] });
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => w.field === "fact")).toBe(true);
  });

  it("skips an empty todo without throwing, and warns", () => {
    const result = detect({ todos: [makeTodo("")] });
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => w.field === "todo")).toBe(true);
  });

  it("handles a completely empty snapshot without throwing", () => {
    expect(() => detect()).not.toThrow();
    expect(detect().items).toEqual([]);
  });
});

describe("detectLoopItems — no cross-conversation correlation (Phase 1A scope)", () => {
  it("does not merge similar candidates across two different conversations", () => {
    const result = detect({
      conversations: [
        makeConversation(["I'll send the estimate tomorrow."], { id: "conv_a" }),
        makeConversation(["I'll send the estimate tomorrow."], { id: "conv_b" }),
      ],
    });

    // Within-snapshot dedup only merges same-source-shaped evidence; two
    // distinct conversations saying the same thing are NOT the same
    // action for Phase 1A purposes (that's Phase 1B's job) — so this must
    // produce two separate items, not one merged item.
    expect(result.items).toHaveLength(2);
  });
});
