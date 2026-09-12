import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import type { LoopDetectionResult, LoopEvidence, LoopItem, LoopItemType } from "@cuenexa-loop/loop-engine";
import type { LoopConfig } from "./config.js";
import { previewText, renderSection, renderWarnings } from "./presenter.js";

function countByType(items: LoopItem[], type: LoopItemType): number {
  return items.filter((item) => item.type === type).length;
}

/** Cross-cutting count: items with a resolved due date, regardless of type — see docs/LOOP-DETECTION.md. */
function countWithDeadline(items: LoopItem[]): number {
  return items.filter((item) => item.dueAt !== null).length;
}

/**
 * The default `loops:check` report: structural counts only, no
 * commitment/decision/etc. text, no evidence quotes — the same
 * privacy-by-default guarantee as `renderConnectivityReport` in
 * presenter.ts. See docs/PRIVACY.md and docs/LOOP-DETECTION.md.
 */
export function renderLoopConnectivityReport(snapshot: BeeSnapshot, result: LoopDetectionResult): string {
  return [
    "CueNexa Loop — Detection Check",
    "",
    "Bee connection: OK",
    "",
    `Conversations processed: ${snapshot.conversations.length}`,
    `Facts processed: ${snapshot.facts.length}`,
    `Todos processed: ${snapshot.todos.length}`,
    "",
    `Commitments: ${countByType(result.items, "commitment")}`,
    `Decisions: ${countByType(result.items, "decision")}`,
    `Delegations: ${countByType(result.items, "delegation")}`,
    `Follow-ups: ${countByType(result.items, "follow_up")}`,
    `Deadlines: ${countWithDeadline(result.items)}`,
    `Open questions: ${countByType(result.items, "open_question")}`,
    "",
    `Total Loop items: ${result.items.length}`,
    "",
    `Source warnings: ${snapshot.warnings.length}`,
    `Detection warnings: ${result.warnings.length}`,
    `Detection completeness: ${snapshot.warnings.length === 0 ? "COMPLETE" : "PARTIAL"}`,
    "Private content printed: NO",
  ].join("\n");
}

function renderEvidenceLine(evidence: LoopEvidence): string {
  return `${evidence.type} "${previewText(evidence.text)}"`;
}

function renderLoopItemLine(item: LoopItem): string {
  const owner = item.owner ? ` · owner: ${previewText(item.owner.label, 40)}` : "";
  const due = item.dueAt ? ` · due ${item.dueAt}` : item.dueAtPhrase ? ` · due phrase: "${item.dueAtPhrase}" (unresolved)` : "";
  const evidenceLines = item.evidence.map((evidence) => `      - ${renderEvidenceLine(evidence)}`).join("\n");

  return [
    `  - [${item.id}] "${previewText(item.text)}" (confidence ${item.confidence.toFixed(2)})${owner}${due}`,
    "    evidence:",
    evidenceLines,
  ].join("\n");
}

const SECTION_TYPES: Array<{ title: string; type: LoopItemType }> = [
  { title: "Commitments", type: "commitment" },
  { title: "Decisions", type: "decision" },
  { title: "Delegations", type: "delegation" },
  { title: "Follow-ups", type: "follow_up" },
  { title: "Open questions", type: "open_question" },
];

/**
 * The explicit-opt-in `loops:check -- --include-content` report. Reuses
 * the same redact-then-truncate presenter used by `--include-content`
 * for `bee:check` (see presenter.ts) — this is deliberate content
 * inspection, not raw output.
 */
export function renderLoopContentReport(snapshot: BeeSnapshot, result: LoopDetectionResult, config: LoopConfig): string {
  const sections = [
    "CueNexa Loop — Detection Check (--include-content: redacted and truncated, not raw)",
  ];

  for (const { title, type } of SECTION_TYPES) {
    const items = result.items.filter((item) => item.type === type);
    sections.push("", renderSection(title, items, renderLoopItemLine, config.maxItemsPerCategory));
  }

  const warningsBlock = renderWarnings(result.warnings, "Detection warnings");
  if (warningsBlock) {
    sections.push("", warningsBlock);
  }

  // Source-warning messages are not printed here: normalizers may include
  // provider values in them. The structural count still makes partial input
  // visible without widening the explicit-content report's privacy scope.
  sections.push("", `Source warnings: ${snapshot.warnings.length}`, `Detection completeness: ${snapshot.warnings.length === 0 ? "COMPLETE" : "PARTIAL"}`);

  sections.push(
    "",
    `Total Loop items: ${result.items.length}`,
    "",
    "Nothing above was written to disk or sent anywhere else — it was not persisted; this process held it only in memory.",
  );

  return sections.join("\n");
}
