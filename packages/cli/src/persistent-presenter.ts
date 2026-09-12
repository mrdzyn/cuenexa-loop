import type { AttentionItem, LoopChangeEvent, LoopThread, ReconcileResult } from "@cuenexa-loop/loop-store";
import { previewText } from "./presenter.js";

/** Default output remains structural. Derived titles require deliberate opt-in. */
export function renderSyncReport(result: ReconcileResult): string {
  return [
    "CueNexa Loop local sync complete.",
    `Threads observed: ${result.threads.length}`,
    `Changes recorded: ${result.events.length}`,
    `Snapshot completeness: ${result.complete ? "complete" : "partial"}`,
    result.warnings.length > 0 ? `Warnings: ${result.warnings.length}` : null,
  ].filter((line): line is string => line !== null).join("\n");
}

export function renderToday(items: readonly AttentionItem[], includeContent: boolean): string {
  const lines = ["CueNexa Loop attention.", `Needs attention: ${items.length}`];
  for (const item of items) {
    const structural = `- ${item.thread.id} [${item.thread.state}] ${item.reasonCodes.join(",")}`;
    lines.push(includeContent ? `${structural}${item.thread.title ? ` — ${previewText(item.thread.title, 80)}` : ""}` : structural);
  }
  return lines.join("\n");
}

export function renderHistory(events: readonly LoopChangeEvent[], threads: readonly LoopThread[], includeContent: boolean): string {
  const titles = new Map(threads.map((thread) => [thread.id, thread.title]));
  const lines = ["CueNexa Loop local history.", `Events: ${events.length}`];
  for (const event of events) {
    const base = `- ${event.observedAt} ${event.threadId} ${event.type}`;
    const title = titles.get(event.threadId);
    lines.push(includeContent && title ? `${base} — ${previewText(title, 80)}` : base);
  }
  return lines.join("\n");
}
