import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import { correlateLoopItems } from "@cuenexa-loop/loop-engine";
import { LoopItemSchema } from "@cuenexa-loop/loop-engine";
import type { LoopDetectionResult, LoopItem } from "@cuenexa-loop/loop-engine";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { renderCorrelationConnectivityReport, renderCorrelationContentReport } from "../correlation-presenter.js";

const NOW = "2026-02-10T12:00:00.000Z";
const SENTINELS = ["secret.project@example.com", "+63 917 555 1234", "Project Nightingale", "Jane Confidential", "14.5995", "120.9842"];

function item(id: string, conversationId: string, text: string): LoopItem {
  return LoopItemSchema.parse({
    id, type: "commitment", text, state: "open", confidence: 0.9,
    owner: { label: "Jane Confidential" }, counterparties: [{ label: "Project Nightingale" }],
    dueAt: "2026-02-20T00:00:00.000Z", dueAtPhrase: "tomorrow",
    source: { provider: "bee", conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text: `Sensitive evidence ${text}` }],
    createdAt: NOW, resolvedAt: null,
  });
}

function fixture() {
  const items = [
    item("a", "conv-a", `Send the security assessment to secret.project@example.com ${"detail ".repeat(30)}`),
    item("b", "conv-b", "Review the security assessment and call +63 917 555 1234"),
  ];
  const conversations = items.map((value, index) => ({
    id: value.source.conversationId!,
    provenance: { source: "bee" as const, sourceId: value.source.conversationId!, retrievedAt: NOW },
    startedAt: `2026-02-0${index + 1}T10:00:00.000Z`, endedAt: null,
    summary: "Project Nightingale", detailedSummary: "Jane Confidential", location: { label: "Private", latitude: 14.5995, longitude: 120.9842 },
    deviceType: null, utterances: [{ speaker: "Jane Confidential", text: value.text, spokenAt: `2026-02-0${index + 1}T10:00:00.000Z` }],
  }));
  const snapshot: BeeSnapshot = {
    conversations, facts: [], todos: [],
    warnings: [{ field: "private", message: "Project Nightingale warning" }],
    pagination: { conversations: { nextCursor: null }, facts: { nextCursor: null }, todos: { nextCursor: null } },
  };
  const detection: LoopDetectionResult = { items, warnings: [{ field: "private", message: "Jane Confidential warning" }] };
  const correlation = correlateLoopItems({
    items, conversations, facts: [], todos: [], now: NOW,
    snapshot: { observedAt: NOW, completeness: "partial" },
  });
  return { snapshot, detection, correlation };
}

describe("correlation presenter privacy", () => {
  it("default output is structural and contains no private sentinel or warning content", () => {
    const { snapshot, detection, correlation } = fixture();
    const report = renderCorrelationConnectivityReport(snapshot, detection, correlation);
    for (const sentinel of SENTINELS) expect(report).not.toContain(sentinel);
    expect(report).not.toContain("Project Nightingale warning");
    expect(report).not.toContain("Jane Confidential warning");
    expect(report).toContain("Private content printed: NO");
    expect(report).toContain("Correlation completeness: PARTIAL");
  });

  it("default rendering never reads private Loop fields", () => {
    const { snapshot, detection, correlation } = fixture();
    Object.defineProperty(correlation.loops[0], "title", { get: () => { throw new Error("private title accessed"); } });
    Object.defineProperty(correlation.loops[0], "members", { get: () => { throw new Error("private members accessed"); } });
    expect(() => renderCorrelationConnectivityReport(snapshot, detection, correlation)).not.toThrow();
  });

  it("opt-in output redacts before truncation and never displays coordinates, evidence, or raw anchors", () => {
    const { snapshot, detection, correlation } = fixture();
    const report = renderCorrelationContentReport(snapshot, detection, correlation, loadConfig({ LOOP_MAX_ITEMS: "5" }));
    expect(report).toContain("[redacted-email]");
    expect(report).toContain("[redacted-number]");
    expect(report).toContain("…");
    expect(report).not.toContain("secret.project@example.com");
    expect(report).not.toContain("+63 917 555 1234");
    expect(report).not.toContain("14.5995");
    expect(report).not.toContain("120.9842");
    expect(report).not.toContain("Sensitive evidence");
    expect(report).not.toContain("specificPhrases");
  });
});
