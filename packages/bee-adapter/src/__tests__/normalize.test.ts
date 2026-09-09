import { describe, expect, it } from "vitest";
import {
  syntheticConversation,
  syntheticConversationMalformedTranscriptions,
  syntheticConversationMissingFields,
  syntheticFact,
  syntheticFactLegacyFields,
  syntheticFactMalformedStatus,
  syntheticFactMissingFields,
  syntheticPendingFact,
  syntheticTodo,
  syntheticTodoLegacyFields,
  syntheticTodoMalformedStatus,
  syntheticTodoMissingFields,
  syntheticCompletedTodo,
} from "../fixtures/synthetic-bee-data.js";
import { normalizeConversation } from "../normalize/conversation.js";
import { normalizeFact } from "../normalize/fact.js";
import { normalizeTodo } from "../normalize/todo.js";

const RETRIEVED_AT = "2026-01-05T09:15:00.000Z";

describe("normalizeConversation", () => {
  it("flattens transcriptions[].utterances[] into a single utterances array", () => {
    const { record, warnings } = normalizeConversation(syntheticConversation, RETRIEVED_AT);

    expect(warnings).toEqual([]);
    expect(record.id).toBe("conv_synthetic_001");
    expect(record.summary).toBe("Planning a team offsite and dividing prep tasks.");
    expect(record.detailedSummary).toContain("follow up with the venue by Friday");
    expect(record.location).toEqual({
      label: "123 Fictional Avenue, Sampletown",
      latitude: 37.001,
      longitude: -122.001,
    });

    // Two transcriptions (2 utterances + 1 utterance) must flatten to 3, not 2 "transcriptions".
    expect(record.utterances).toHaveLength(3);
    expect(record.utterances[0]).toEqual({
      speaker: "Speaker A",
      text: "I think we should confirm the venue by Friday.",
      spokenAt: "2026-01-05T09:00:15.000Z",
    });
    expect(record.utterances[1]?.speaker).toBe("Speaker B");
  });

  it("prefers spoken_at but falls back to start when spoken_at is absent", () => {
    const { record } = normalizeConversation(syntheticConversation, RETRIEVED_AT);

    const thirdUtterance = record.utterances[2];
    expect(thirdUtterance?.text).toBe("Let's also check catering options.");
    // This fixture utterance has no spoken_at, only start.
    expect(thirdUtterance?.spokenAt).toBe("2026-01-05T09:05:00.000Z");
  });

  it("degrades gracefully when fields are missing, without throwing", () => {
    const { record, warnings } = normalizeConversation(syntheticConversationMissingFields, RETRIEVED_AT);

    expect(record.id).toMatch(/^conversation-unknown-/);
    expect(record.summary).toBe("");
    expect(record.location).toBeNull();
    expect(record.startedAt).toBeNull();
    expect(record.utterances).toEqual([]);
    expect(warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["id", "summary"]));
  });

  it("never throws on malformed nested transcription/utterance data", () => {
    expect(() => normalizeConversation(syntheticConversationMalformedTranscriptions, RETRIEVED_AT)).not.toThrow();

    const { record } = normalizeConversation(syntheticConversationMalformedTranscriptions, RETRIEVED_AT);
    expect(record.utterances).toEqual([]);
  });
});

describe("normalizeFact", () => {
  it("maps created_at -> capturedAt and confirmed: true -> status: confirmed", () => {
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

  it("maps confirmed: false -> status: pending", () => {
    const { record, warnings } = normalizeFact(syntheticPendingFact, RETRIEVED_AT);

    expect(warnings).toEqual([]);
    expect(record.status).toBe("pending");
  });

  it("a valid confirmed fact never normalizes to unknown", () => {
    const { record } = normalizeFact(syntheticFact, RETRIEVED_AT);
    expect(record.status).not.toBe("unknown");
  });

  it("falls back to legacy confirmation_status only when confirmed is absent", () => {
    const { record, warnings } = normalizeFact(syntheticFactLegacyFields, RETRIEVED_AT);

    expect(record.status).toBe("confirmed");
    expect(record.capturedAt).toBe("2026-01-03T10:00:00.000Z");
    expect(warnings.some((w) => w.message.includes("legacy confirmation_status fallback"))).toBe(true);
  });

  it("falls back to placeholders and warns instead of throwing on missing data", () => {
    const { record, warnings } = normalizeFact(syntheticFactMissingFields, RETRIEVED_AT);

    expect(record.id).toMatch(/^fact-unknown-/);
    expect(record.text).toBe("");
    expect(record.status).toBe("unknown");
    expect(warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["id", "text", "status"]));
  });

  it("warns and reports unknown on an unrecognized status value", () => {
    const { record, warnings } = normalizeFact(syntheticFactMalformedStatus, RETRIEVED_AT);

    expect(record.status).toBe("unknown");
    expect(warnings.some((w) => w.message.includes("Unrecognized confirmation_status"))).toBe(true);
  });
});

describe("normalizeTodo", () => {
  it("maps created_at/alarm_at -> createdAt/dueAt and completed: false -> status: open", () => {
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

  it("maps completed: true -> status: completed", () => {
    const { record, warnings } = normalizeTodo(syntheticCompletedTodo, RETRIEVED_AT);

    expect(warnings).toEqual([]);
    expect(record.status).toBe("completed");
  });

  it("falls back to legacy created/alarm/completion_status only when current fields are absent", () => {
    const { record, warnings } = normalizeTodo(syntheticTodoLegacyFields, RETRIEVED_AT);

    expect(record.createdAt).toBe("2026-01-01T09:00:00.000Z");
    expect(record.dueAt).toBe("2026-01-08T09:00:00.000Z");
    expect(record.status).toBe("open");
    expect(warnings.some((w) => w.message.includes("legacy completion_status fallback"))).toBe(true);
  });

  it("falls back to placeholders and warns instead of throwing on missing data", () => {
    const { record, warnings } = normalizeTodo(syntheticTodoMissingFields, RETRIEVED_AT);

    expect(record.id).toMatch(/^todo-unknown-/);
    expect(record.text).toBe("");
    expect(record.status).toBe("unknown");
    expect(warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["id", "text", "status"]));
  });

  it("warns and reports unknown on an unrecognized status value", () => {
    const { record, warnings } = normalizeTodo(syntheticTodoMalformedStatus, RETRIEVED_AT);

    expect(record.status).toBe("unknown");
    expect(warnings.some((w) => w.message.includes("Unrecognized completion_status"))).toBe(true);
  });
});
