import type { LoopConversation, LoopFact, LoopTodo } from "@cuenexa-loop/contracts";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { previewText, redact, renderSnapshot, truncate } from "../presenter.js";

const RETRIEVED_AT = "2026-01-05T09:15:00.000Z";

function makeConversation(overrides: Partial<LoopConversation> = {}): LoopConversation {
  return {
    id: "conv_synthetic_001",
    provenance: { source: "bee", sourceId: "conv_synthetic_001", retrievedAt: RETRIEVED_AT },
    startedAt: "2026-01-05T09:00:00.000Z",
    endedAt: "2026-01-05T09:12:00.000Z",
    summary: "Planning a team offsite and dividing prep tasks.",
    detailedSummary: null,
    location: { label: "123 Fictional Ave, Sampletown", latitude: 37.001, longitude: -122.001 },
    deviceType: "ios",
    utterances: [{ speaker: "Speaker A", text: "Reach me at jordan@example.com anytime.", spokenAt: null }],
    ...overrides,
  };
}

function makeFact(overrides: Partial<LoopFact> = {}): LoopFact {
  return {
    id: "fact_synthetic_001",
    provenance: { source: "bee", sourceId: "fact_synthetic_001", retrievedAt: RETRIEVED_AT },
    text: "Prefers async written updates over live status meetings.",
    tags: ["work-style"],
    status: "confirmed",
    capturedAt: "2026-01-04T18:30:00.000Z",
    ...overrides,
  };
}

function makeTodo(overrides: Partial<LoopTodo> = {}): LoopTodo {
  return {
    id: "todo_synthetic_001",
    provenance: { source: "bee", sourceId: "todo_synthetic_001", retrievedAt: RETRIEVED_AT },
    text: "Follow up with the offsite venue about catering options.",
    status: "open",
    createdAt: "2026-01-05T09:12:10.000Z",
    dueAt: "2026-01-09T15:00:00.000Z",
    ...overrides,
  };
}

describe("redact", () => {
  it("masks email addresses and phone-number-like sequences", () => {
    const input = "Call me at 555-123-4567 or email jordan.sample@example.com.";
    const output = redact(input);

    expect(output).not.toContain("jordan.sample@example.com");
    expect(output).not.toContain("555-123-4567");
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("[redacted-number]");
  });
});

describe("truncate", () => {
  it("leaves short text untouched", () => {
    expect(truncate("short text", 120)).toBe("short text");
  });

  it("truncates long text with an ellipsis", () => {
    const long = "a".repeat(200);
    const result = truncate(long, 50);

    expect(result.length).toBe(50);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("previewText", () => {
  it("redacts before truncating so a split never exposes half of a PII match", () => {
    const input = `${"filler ".repeat(20)}jordan.sample@example.com`;
    const result = previewText(input, 40);

    expect(result).not.toContain("jordan.sample@example.com");
  });
});

describe("renderSnapshot", () => {
  it("never prints raw utterance text or location coordinates", () => {
    const config = loadConfig({});
    const report = renderSnapshot(
      { conversations: [makeConversation()], facts: [], todos: [], warnings: [] },
      config,
    );

    expect(report).not.toContain("Reach me at jordan@example.com");
    expect(report).not.toContain("37.001");
    expect(report).not.toContain("-122.001");
    expect(report).toContain("1 utterance(s) captured (not printed)");
    expect(report).toContain("location: on file (not printed)");
  });

  it("redacts and truncates fact and todo text", () => {
    const config = loadConfig({});
    const report = renderSnapshot(
      {
        conversations: [],
        facts: [makeFact({ text: "Email me at jordan@example.com about this." })],
        todos: [makeTodo()],
        warnings: [],
      },
      config,
    );

    expect(report).not.toContain("jordan@example.com");
    expect(report).toContain("[redacted-email]");
    expect(report).toContain("Follow up with the offsite venue about catering options.");
  });

  it("caps items per category at the configured limit and notes the remainder", () => {
    const config = loadConfig({ LOOP_MAX_ITEMS: "1" });
    const todos = [makeTodo({ id: "todo_1" }), makeTodo({ id: "todo_2" }), makeTodo({ id: "todo_3" })];

    const report = renderSnapshot({ conversations: [], facts: [], todos, warnings: [] }, config);

    expect(report).toContain("Todos (1 of 3 shown)");
    expect(report).toContain("... and 2 more");
  });

  it("surfaces normalization warnings without leaking source text", () => {
    const config = loadConfig({});
    const report = renderSnapshot(
      { conversations: [], facts: [], todos: [], warnings: [{ field: "summary", message: "No summary text found." }] },
      config,
    );

    expect(report).toContain("Normalization warnings (1)");
    expect(report).toContain("[summary] No summary text found.");
  });

  it("states plainly that nothing was persisted", () => {
    const config = loadConfig({});
    const report = renderSnapshot({ conversations: [], facts: [], todos: [], warnings: [] }, config);

    expect(report.toLowerCase()).toContain("not persisted");
  });
});
