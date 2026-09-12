import type { ProvisionalSignal } from "@cuenexa-loop/loop-engine";
import { previewText } from "./presenter.js";

export function renderProvisionalSignal(signal: ProvisionalSignal, includeContent: boolean): string {
  const lines = [
    `PROVISIONAL — ${signal.type.replaceAll("_", " ")} detected`,
    `Confidence: ${signal.confidence}`,
    `Conversation/session: ${signal.conversationId || signal.sessionId ? "available" : "unavailable"}`,
  ];
  if (includeContent) lines.push(`Preview: ${previewText(signal.ephemeralText, 80)}`);
  lines.push(`Content printed: ${includeContent ? "YES (redacted and truncated)" : "NO"}`);
  lines.push("Waiting for processed Bee history before creating a persistent Loop.");
  return lines.join("\n");
}
