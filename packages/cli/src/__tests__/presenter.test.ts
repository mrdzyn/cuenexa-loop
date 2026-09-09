import type { LoopConversation, LoopFact, LoopTodo } from "@cuenexa-loop/contracts";
import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { previewText, redact, renderConnectivityReport, renderContentReport, truncate } from "../presenter.js";

const RETRIEVED_AT = "2026-01-05T09:15:00.000Z";

const SENSITIVE_STRINGS = {
  summary: "Planning a team offsite and dividing prep tasks.",
  detailedSummary: "Discussed venue options and who would follow up with the venue by Friday.",
  utteranceText: "Reach me at jordan@example.com anytime.",
  speaker: "Speaker A",
  locationLabel: "123 Fictional Avenue, Sampletown",
  factText: "Prefers async written updates over live status meetings.",
  todoText: "Follow up with the offsite venue about catering options.",
  latitude: "37.001",
  longitude: "-122.001",
};

function makeConversation(overrides: Partial<LoopConversation> = {}): LoopConversation {
  return {
    id: "conv_synthetic_001",
    provenance: { source: "bee", sourceId: "conv_synthetic_001", retrievedAt: RETRIEVED_AT },
    startedAt: "2026-01-05T09:00:00.000Z",
    endedAt: "2026-01-05T09:12:00.000Z",
    summary: SENSITIVE_STRINGS.summary,
    detailedSummary: SENSITIVE_STRINGS.detailedSummary,
    location: { label: SENSITIVE_STRINGS.locationLabel, latitude: 37.001, longitude: -122.001 },
    deviceType: "ios",
    utterances: [{ speaker: SENSITIVE_STRINGS.speaker, text: SENSITIVE_STRINGS.utteranceText, spokenAt: null }],
    ...overrides,
  };
}

function makeFact(overrides: Partial<LoopFact> = {}): LoopFact {
  return {
    id: "fact_synthetic_001",
    provenance: { source: "bee", sourceId: "fact_synthetic_001", retrievedAt: RETRIEVED_AT },
    text: SENSITIVE_STRINGS.factText,
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
    text: SENSITIVE_STRINGS.todoText,
    status: "open",
    createdAt: "2026-01-05T09:12:10.000Z",
    dueAt: "2026-01-09T15:00:00.000Z",
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<BeeSnapshot> = {}): BeeSnapshot {
  return {
    conversations: [makeConversation()],
    facts: [makeFact()],
    todos: [makeTodo()],
    warnings: [],
    pagination: {
      conversations: { nextCursor: null },
      facts: { nextCursor: null },
      todos: { nextCursor: null },
    },
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

describe("renderConnectivityReport (default, mandatory privacy-by-default output)", () => {
  it("contains none of the fixture's conversational content, at all", () => {
    const report = renderConnectivityReport(makeSnapshot());

    for (const [, value] of Object.entries(SENSITIVE_STRINGS)) {
      expect(report).not.toContain(value);
    }
  });

  it("is exactly the structural connectivity report shape", () => {
    const report = renderConnectivityReport(
      makeSnapshot({ warnings: [{ field: "summary", message: "No summary text found." }] }),
    );

    expect(report).toBe(
      [
        "CueNexa Loop — Bee Connectivity Check",
        "",
        "Bee connection: OK",
        "Conversations: 1",
        "Facts: 1",
        "Todos: 1",
        "Normalization warnings: 1",
        "Normalization: OK",
        "Private content printed: NO",
      ].join("\n"),
    );
  });

  it("reports zero counts for empty categories without printing anything else", () => {
    const report = renderConnectivityReport(makeSnapshot({ conversations: [], facts: [], todos: [] }));

    expect(report).toContain("Conversations: 0");
    expect(report).toContain("Facts: 0");
    expect(report).toContain("Todos: 0");
  });
});

describe("renderContentReport (--include-content, explicit opt-in)", () => {
  it("does print redacted/truncated content, unlike the default report", () => {
    const config = loadConfig({});
    const report = renderContentReport(makeSnapshot(), config);

    expect(report).toContain("Planning a team offsite");
    expect(report).toContain("Prefers async written updates");
    expect(report).toContain("Follow up with the offsite venue");
    expect(report).toContain(SENSITIVE_STRINGS.speaker);
  });

  it("redacts an email address inside utterance text", () => {
    const config = loadConfig({});
    const report = renderContentReport(makeSnapshot(), config);

    expect(report).not.toContain("jordan@example.com");
    expect(report).toContain("[redacted-email]");
  });

  it("never prints precise latitude/longitude even in content mode", () => {
    const config = loadConfig({});
    const report = renderContentReport(makeSnapshot(), config);

    expect(report).not.toContain(SENSITIVE_STRINGS.latitude);
    expect(report).not.toContain(SENSITIVE_STRINGS.longitude);
  });

  it("caps items per category at the configured limit and notes the remainder", () => {
    const config = loadConfig({ LOOP_MAX_ITEMS: "1" });
    const todos = [makeTodo({ id: "todo_1" }), makeTodo({ id: "todo_2" }), makeTodo({ id: "todo_3" })];

    const report = renderContentReport(makeSnapshot({ todos }), config);

    expect(report).toContain("Todos (1 of 3 shown)");
    expect(report).toContain("... and 2 more");
  });

  it("surfaces normalization warnings without leaking source text", () => {
    const config = loadConfig({});
    const report = renderContentReport(
      makeSnapshot({ warnings: [{ field: "summary", message: "No summary text found." }] }),
      config,
    );

    expect(report).toContain("Normalization warnings (1)");
    expect(report).toContain("[summary] No summary text found.");
  });

  it("states plainly that nothing was persisted", () => {
    const config = loadConfig({});
    const report = renderContentReport(makeSnapshot(), config);

    expect(report.toLowerCase()).toContain("not persisted");
  });
});
