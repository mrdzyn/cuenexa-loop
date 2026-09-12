import type { ReviewItem, ReviewModel } from "@cuenexa-loop/loop-store";
import { previewText } from "./presenter.js";

export function renderReview(model: ReviewModel, includeContent: boolean): string {
  return [
    "CueNexa Loop — Follow Through", "",
    renderSection("DUE NOW", model.dueNow, includeContent), "",
    renderSection("NEEDS ATTENTION", model.needsAttention, includeContent), "",
    renderSection("WAITING", model.waiting, includeContent), "",
    renderSection("SNOOZED", model.snoozed, includeContent), "",
    renderSection("RECENTLY RESOLVED", model.recentlyResolved, includeContent), "",
    `Private content printed: ${includeContent ? "YES (redacted derived titles only)" : "NO"}`,
  ].join("\n");
}

function renderSection(name: string, items: readonly ReviewItem[], includeContent: boolean): string {
  const lines = [`${name} (${items.length})`];
  for (const item of items) {
    const metadata = [
      item.thread.state,
      `${item.thread.memberIdentities.length} persistent members`,
      item.reasonCodes.length > 0 ? item.reasonCodes.join(",") : "no_active_reason",
      item.thread.dueAt ? `due ${item.thread.dueAt}` : null,
      item.userState.pinned ? "pinned" : null,
      item.userState.acknowledgedAt ? "acknowledged" : null,
      item.userState.snoozedUntil ? `snoozed until ${item.userState.snoozedUntil}` : null,
    ].filter((value): value is string => value !== null).join(" · ");
    const title = includeContent && item.thread.title ? ` — ${previewText(item.thread.title, 80)}` : "";
    lines.push(`- ${item.thread.id} [${metadata}]${title}`);
  }
  return lines.join("\n");
}
