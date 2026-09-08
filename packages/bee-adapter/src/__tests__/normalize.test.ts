import { describe, expect, it } from "vitest";
import {
  syntheticConversation,
  syntheticConversationMissingFields,
  syntheticFact,
  syntheticFactMissingFields,
  syntheticTodo,
  syntheticTodoMissingFields,
} from "../fixtures/synthetic-bee-data.js";
import { normalizeConversation } from "../normalize/conversation.js";
import { normalizeFact } from "../normalize/fact.js";
import { normalizeTodo } from "../normalize/todo.js";

const RETRIEVED_AT = "2026-01-05T09:15:00.000Z";

describe("normalizeConversation", () => {
  it("maps a well-formed Bee conversation onto the LoopConversation contract", () => {
    const { record, warnings } = normalizeConversation(syntheticConversation, RETRIEVED_AT);

    expect(warnings).toEqual([]);
    expect(record.id).toBe("conv_synthetic_001");
    expect(record.provenance).toEqual({
      source: "bee",
      sourceId: "conv_synthetic_001",
      retrievedAt: RETRIEVED_AT,
    });
    expect(record.summary).toBe("Planning a team offsite and dividing prep tasks.");
    expect(record.detailedSummary).toContain("follow up with the venue by Friday");
    expect(record.startedAt).toBe("2026-01-05T09:00:00.000Z");
    expect(record.location).toEqual({
      label: "123 Fictional Ave, Sampletown",
      latitude: 37.001,
      longitude: -122.001,
    });
    expect(record.utterances).toHaveLength(2);
    expect(record.utterances[0]).toEqual({
      speaker: "Speaker A",
      text: "I think we should confirm the venue by Friday.",
      spokenAt: "2026-01-05T09:00:15.000Z",
    });
  });

  it("degrades gracefully when fields are missing, without throwing", () => {
    const { record, warnings } = normalizeConversation(syntheticConversationMissingFields, RETRIEVED_AT);

    expect(record.id).toMatch(/^conversation-unknown-/);
    expect(record.summary).toBe("");
    expect(record.location).toBeNull();
    expect(record.startedAt).toBeNull();
    expect(record.utterances).toHaveLength(1);
    expect(warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["id", "summary"]));
  });
});

describe("normalizeFact", () => {
  it("maps a well-formed Bee fact onto the LoopFact contract", () => {
    const { record, warnings } = normalizeFact(syntheticFact, RETRIEVED_AT);

    expect(warnings).toEqual([]);
    expect(record).toEqual({
      id: "fact_synthetic_001",
      provenance: { source: "bee", sourceId: "fact_synthetic_001", retrievedAt: RETRIEVED_AT },
      text: "Prefers async written updates over live status meetings.",
      tags: ["work-style"],
      status: "confirmed",
      capturedAt: "2026-01-04T18:30:00.000Z",
    });
  });

  it("falls back to placeholders and warns instead of throwing on missing data", () => {
    const { record, warnings } = normalizeFact(syntheticFactMissingFields, RETRIEVED_AT);

    expect(record.id).toMatch(/^fact-unknown-/);
    expect(record.text).toBe("");
    expect(record.status).toBe("unknown");
    expect(warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["id", "text", "status"]));
  });
});

describe("normalizeTodo", () => {
  it("maps a well-formed Bee todo onto the LoopTodo contract", () => {
    const { record, warnings } = normalizeTodo(syntheticTodo, RETRIEVED_AT);

    expect(warnings).toEqual([]);
    expect(record).toEqual({
      id: "todo_synthetic_001",
      provenance: { source: "bee", sourceId: "todo_synthetic_001", retrievedAt: RETRIEVED_AT },
      text: "Follow up with the offsite venue about catering options.",
      status: "open",
      createdAt: "2026-01-05T09:12:10.000Z",
      dueAt: "2026-01-09T15:00:00.000Z",
    });
  });

  it("falls back to placeholders and warns instead of throwing on missing data", () => {
    const { record, warnings } = normalizeTodo(syntheticTodoMissingFields, RETRIEVED_AT);

    expect(record.id).toMatch(/^todo-unknown-/);
    expect(record.text).toBe("");
    expect(record.status).toBe("unknown");
    expect(warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["id", "text", "status"]));
  });
});
