import type { LoopConversation, LoopFact, LoopTodo, NormalizationWarning } from "@cuenexa-loop/contracts";
import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import type { LoopConfig } from "./config.js";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+?\d[\d\-. ]{7,}\d)/g;
const DEFAULT_PREVIEW_LENGTH = 120;

/**
 * Defense-in-depth redaction applied to any free text before it is ever
 * printed to the console. Upstream summaries are already Bee-generated
 * prose, not raw PII fields, but this catches emails/phone numbers that
 * slip into conversational text regardless.
 */
export function redact(text: string): string {
  return text.replace(EMAIL_PATTERN, "[redacted-email]").replace(PHONE_PATTERN, "[redacted-number]");
}

export function truncate(text: string, maxLength = DEFAULT_PREVIEW_LENGTH): string {
  const clean = text.trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/** Redact, then truncate — the only way free text should reach the console. */
export function previewText(text: string, maxLength = DEFAULT_PREVIEW_LENGTH): string {
  return truncate(redact(text), maxLength);
}

function renderConversationLine(conversation: LoopConversation): string {
  const when = conversation.startedAt ?? "unknown time";
  const device = conversation.deviceType ?? "unknown device";
  const summary = conversation.summary ? previewText(conversation.summary) : "(no summary provided)";
  const locationNote = conversation.location ? " · location: on file (not printed)" : "";
  const utteranceNote =
    conversation.utterances.length > 0
      ? ` · ${conversation.utterances.length} utterance(s) captured (not printed)`
      : "";
  return `  - [${conversation.id}] ${when} · ${device}${locationNote}\n    "${summary}"${utteranceNote}`;
}

function renderFactLine(fact: LoopFact): string {
  const text = fact.text ? previewText(fact.text) : "(no text provided)";
  return `  - [${fact.id}] (${fact.status}) "${text}"`;
}

function renderTodoLine(todo: LoopTodo): string {
  const box = todo.status === "completed" ? "[x]" : "[ ]";
  const text = todo.text ? previewText(todo.text) : "(no text provided)";
  const due = todo.dueAt ? ` (due ${todo.dueAt})` : "";
  return `  - ${box} [${todo.id}] "${text}"${due}`;
}

function renderSection<T>(title: string, items: T[], render: (item: T) => string, limit: number): string {
  const lines = [`${title} (${Math.min(items.length, limit)} of ${items.length} shown)`];
  if (items.length === 0) {
    lines.push("  (none)");
  } else {
    lines.push(...items.slice(0, limit).map(render));
    if (items.length > limit) {
      lines.push(`  ... and ${items.length - limit} more (increase LOOP_MAX_ITEMS to see more)`);
    }
  }
  return lines.join("\n");
}

function renderWarnings(warnings: NormalizationWarning[]): string {
  if (warnings.length === 0) {
    return "";
  }
  const lines = [`Normalization warnings (${warnings.length}):`];
  for (const warning of warnings.slice(0, 10)) {
    lines.push(`  - [${warning.field}] ${warning.message}`);
  }
  if (warnings.length > 10) {
    lines.push(`  ... and ${warnings.length - 10} more`);
  }
  return lines.join("\n");
}

/**
 * Renders a BeeSnapshot as a privacy-safe console report: summaries and
 * fact/todo text are redacted and truncated, and raw utterance transcripts
 * and location details are never printed, only acknowledged as present.
 * Nothing here writes to disk or leaves the process.
 */
export function renderSnapshot(snapshot: BeeSnapshot, config: LoopConfig): string {
  const sections = [
    "CueNexa Loop — Bee snapshot (privacy-safe console output)",
    `Retrieved via ${config.beeProxyUrl}`,
    "",
    renderSection("Conversations", snapshot.conversations, renderConversationLine, config.maxItemsPerCategory),
    "",
    renderSection("Facts", snapshot.facts, renderFactLine, config.maxItemsPerCategory),
    "",
    renderSection("Todos", snapshot.todos, renderTodoLine, config.maxItemsPerCategory),
  ];

  const warningsBlock = renderWarnings(snapshot.warnings);
  if (warningsBlock) {
    sections.push("", warningsBlock);
  }

  sections.push(
    "",
    "Nothing above was written to disk or sent anywhere else — it was not persisted; this process held it only in memory.",
  );

  return sections.join("\n");
}
