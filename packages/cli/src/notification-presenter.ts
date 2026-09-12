import type { NotificationPlan } from "@cuenexa-loop/loop-store";
import { previewText } from "./presenter.js";

export function renderNotifications(plan: NotificationPlan, includeContent: boolean): string {
  const lines = ["CueNexa Loop — Notifications", "", `Eligible: ${plan.candidates.length}`, ""];
  for (const candidate of plan.candidates) {
    const title = includeContent && candidate.thread.title ? ` — ${previewText(candidate.thread.title, 80)}` : "";
    lines.push(`- ${candidate.thread.id} ${candidate.type}${title}`);
  }
  lines.push("", `Private content printed: ${includeContent ? "YES (redacted derived titles only)" : "NO"}`);
  return lines.join("\n");
}
