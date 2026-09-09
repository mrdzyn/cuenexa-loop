import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import type { LoopConversation } from "@cuenexa-loop/contracts";
import { detectLoopItems } from "@cuenexa-loop/loop-engine";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { renderLoopConnectivityReport, renderLoopContentReport } from "../loop-presenter.js";

const RETRIEVED_AT = "2026-01-05T09:15:00.000Z";
const NOW = "2026-01-05T09:15:00.000Z";

function makeConversation(utteranceTexts: string[]): LoopConversation {
  return {
    id: "conv_synthetic_001",
    provenance: { source: "bee", sourceId: "conv_synthetic_001", retrievedAt: RETRIEVED_AT },
    startedAt: "2026-01-05T09:00:00.000Z",
    endedAt: "2026-01-05T09:12:00.000Z",
    summary: "Planning a team offsite and dividing prep tasks.",
    detailedSummary: null,
    location: { label: "123 Fictional Avenue, Sampletown", latitude: 37.001, longitude: -122.001 },
    deviceType: "ios",
    utterances: utteranceTexts.map((text, index) => ({
      speaker: index % 2 === 0 ? "Speaker A" : "Speaker B",
      text,
      spokenAt: null,
    })),
  };
}

function makeSnapshot(overrides: Partial<BeeSnapshot> = {}): BeeSnapshot {
  return {
    conversations: [],
    facts: [],
    todos: [],
    warnings: [],
    pagination: {
      conversations: { nextCursor: null },
      facts: { nextCursor: null },
      todos: { nextCursor: null },
    },
    ...overrides,
  };
}

const SENSITIVE_CONVERSATION = makeConversation([
  "I'll send the revised proposal tomorrow.",
  "Who owns the deployment?",
  "Reach me at jordan@example.com if anything changes.",
]);

describe("renderLoopConnectivityReport (default, mandatory privacy-by-default output)", () => {
  it("contains none of the source conversation's text content", () => {
    const snapshot = makeSnapshot({ conversations: [SENSITIVE_CONVERSATION] });
    const result = detectLoopItems({ conversations: [SENSITIVE_CONVERSATION], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopConnectivityReport(snapshot, result);

    expect(report).not.toContain("send the revised proposal");
    expect(report).not.toContain("Who owns the deployment");
    expect(report).not.toContain("jordan@example.com");
  });

  it("reports structural counts by type, plus a cross-cutting deadline count", () => {
    const snapshot = makeSnapshot({ conversations: [SENSITIVE_CONVERSATION] });
    const result = detectLoopItems({ conversations: [SENSITIVE_CONVERSATION], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopConnectivityReport(snapshot, result);

    expect(report).toContain("CueNexa Loop — Detection Check");
    expect(report).toContain("Bee connection: OK");
    expect(report).toContain("Conversations processed: 1");
    expect(report).toContain(`Commitments: ${result.items.filter((i) => i.type === "commitment").length}`);
    expect(report).toContain(`Open questions: ${result.items.filter((i) => i.type === "open_question").length}`);
    expect(report).toContain(`Total Loop items: ${result.items.length}`);
    expect(report).toContain("Private content printed: NO");
  });

  it("reports zero counts for an empty snapshot without throwing", () => {
    const snapshot = makeSnapshot();
    const result = detectLoopItems({ conversations: [], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopConnectivityReport(snapshot, result);

    expect(report).toContain("Total Loop items: 0");
  });
});

describe("renderLoopContentReport (--include-content, explicit opt-in)", () => {
  it("does print item text and evidence, unlike the default report", () => {
    const config = loadConfig({});
    const result = detectLoopItems({ conversations: [SENSITIVE_CONVERSATION], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopContentReport(result, config);

    expect(report).toContain("Send the revised proposal");
    expect(report).toContain("Who owns the deployment");
  });

  it("redacts an email address inside evidence text", () => {
    const config = loadConfig({});
    const conversation = makeConversation(["I'll send it to jordan@example.com tomorrow."]);
    const result = detectLoopItems({ conversations: [conversation], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopContentReport(result, config);

    expect(report).not.toContain("jordan@example.com");
    expect(report).toContain("[redacted-email]");
  });

  it("shows a resolved due date and an owner label where present", () => {
    const config = loadConfig({});
    const conversation = makeConversation(["Alex, please prepare the report by Friday."]);
    const result = detectLoopItems({ conversations: [conversation], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopContentReport(result, config);

    expect(report).toContain("owner: Alex");
    expect(report).toMatch(/due \d{4}-\d{2}-\d{2}T/);
  });

  it("caps items per category at the configured limit", () => {
    const config = loadConfig({ LOOP_MAX_ITEMS: "1" });
    const conversation = makeConversation([
      "I'll send the estimate tomorrow.",
      "I'll send the invoice tomorrow.",
      "I'll send the contract tomorrow.",
    ]);
    const result = detectLoopItems({ conversations: [conversation], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopContentReport(result, config);

    expect(report).toContain("Commitments (1 of 3 shown)");
  });

  it("surfaces detection warnings without leaking source text", () => {
    const config = loadConfig({});
    const conversation = makeConversation(["", "I'll send the revised proposal tomorrow."]);
    const result = detectLoopItems({ conversations: [conversation], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopContentReport(result, config);

    expect(report).toContain("Detection warnings (1)");
  });

  it("states plainly that nothing was persisted", () => {
    const config = loadConfig({});
    const result = detectLoopItems({ conversations: [], facts: [], todos: [], now: NOW, timeZone: "UTC" });

    const report = renderLoopContentReport(result, config);

    expect(report.toLowerCase()).toContain("not persisted");
  });
});
