import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import type { Loop, LoopCorrelationResult, LoopDetectionResult } from "@cuenexa-loop/loop-engine";
import type { LoopConfig } from "./config.js";
import { previewText } from "./presenter.js";

function correlationCompleteness(
  snapshot: BeeSnapshot,
  detection: LoopDetectionResult,
  correlation: LoopCorrelationResult,
): "COMPLETE" | "PARTIAL" {
  return snapshot.warnings.length > 0 ||
    detection.warnings.length > 0 ||
    correlation.warnings.length > 0 ||
    correlation.snapshot.completeness === "partial"
    ? "PARTIAL"
    : "COMPLETE";
}

/** Content-free by construction: reads only counts, lifecycle, and completeness metadata. */
export function renderCorrelationConnectivityReport(
  snapshot: BeeSnapshot,
  detection: LoopDetectionResult,
  correlation: LoopCorrelationResult,
): string {
  return [
    "CueNexa Loop — Correlation Check",
    "",
    "Bee connection: OK",
    `Conversations processed: ${snapshot.conversations.length}`,
    `Facts processed: ${snapshot.facts.length}`,
    `Todos processed: ${snapshot.todos.length}`,
    `LoopItems considered: ${detection.items.length}`,
    `Loops emitted: ${correlation.loops.length}`,
    `Open Loops: ${correlation.loops.filter((loop) => loop.state === "open").length}`,
    `Waiting Loops: ${correlation.loops.filter((loop) => loop.state === "waiting").length}`,
    `Resolved Loops: ${correlation.loops.filter((loop) => loop.state === "resolved").length}`,
    `Source warnings: ${snapshot.warnings.length}`,
    `Detection warnings: ${detection.warnings.length}`,
    `Correlation warnings: ${correlation.warnings.length}`,
    `Correlation completeness: ${correlationCompleteness(snapshot, detection, correlation)}`,
    "Private content printed: NO",
  ].join("\n");
}

function renderLoop(loop: Loop, memberLimit: number): string {
  const memberLines = loop.members.slice(0, memberLimit).map(
    (member) => `    - ${member.item.type}: "${previewText(member.item.text)}"`,
  );
  if (loop.members.length > memberLimit) {
    memberLines.push(`    ... and ${loop.members.length - memberLimit} more`);
  }
  const timelineLines = loop.timeline.slice(0, memberLimit).map(
    (event) => `    - #${event.sequence} ${event.timestampSource}${event.occurredAt ? ` at ${event.occurredAt}` : ""}`,
  );
  return [
    `  - "${previewText(loop.title ?? "Untitled Loop", 80)}" (${loop.state}, ${loop.members.length} members, confidence ${loop.correlationConfidence.toFixed(2)})`,
    "    members:",
    ...memberLines,
    "    timeline:",
    ...timelineLines,
  ].join("\n");
}

/** Explicit opt-in content view; free text always passes through redact-before-truncate previewText. */
export function renderCorrelationContentReport(
  snapshot: BeeSnapshot,
  detection: LoopDetectionResult,
  correlation: LoopCorrelationResult,
  config: LoopConfig,
): string {
  const shown = correlation.loops.slice(0, config.maxItemsPerCategory);
  const lines = [
    "CueNexa Loop — Correlation Check (--include-content: redacted and truncated, not raw)",
    "",
    `Loops (${shown.length} of ${correlation.loops.length} shown)`,
    ...(shown.length > 0 ? shown.map((loop) => renderLoop(loop, config.maxItemsPerCategory)) : ["  (none)"]),
  ];
  if (correlation.loops.length > shown.length) {
    lines.push(`  ... and ${correlation.loops.length - shown.length} more`);
  }
  lines.push(
    "",
    `Source warnings: ${snapshot.warnings.length}`,
    `Detection warnings: ${detection.warnings.length}`,
    `Correlation warnings: ${correlation.warnings.length}`,
    `Correlation completeness: ${correlationCompleteness(snapshot, detection, correlation)}`,
    "",
    "Nothing above was written to disk or sent anywhere else — it was not persisted; this process held it only in memory.",
  );
  return lines.join("\n");
}
