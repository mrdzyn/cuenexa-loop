import type {
  LoopTodo,
  LoopTodoStatus,
  NormalizationResult,
  NormalizationWarning,
} from "@cuenexa-loop/contracts";
import type { BeeTodo } from "../raw-types.js";
import { coerceId, coerceText, coerceTimestamp, warnAndPlaceholder } from "./util.js";

export function normalizeTodo(raw: BeeTodo, retrievedAt: string): NormalizationResult<LoopTodo> {
  const warnings: NormalizationWarning[] = [];

  const id = coerceId(raw.id) ?? warnAndPlaceholder(warnings, "todo");

  const text = coerceText(raw.text);
  if (!text) {
    warnings.push({ field: "text", message: "Todo has no text content." });
  }

  const record: LoopTodo = {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt },
    text: text ?? "",
    status: normalizeStatus(raw, warnings),
    createdAt: coerceTimestamp(raw.created),
    dueAt: coerceTimestamp(raw.alarm_at ?? raw.alarm),
  };

  return { record, warnings };
}

function normalizeStatus(raw: BeeTodo, warnings: NormalizationWarning[]): LoopTodoStatus {
  if (raw.completion_status === "open" || raw.completion_status === "completed") {
    return raw.completion_status;
  }
  if (typeof raw.completed === "boolean") {
    return raw.completed ? "completed" : "open";
  }
  if (raw.completion_status != null) {
    warnings.push({
      field: "status",
      message: `Unrecognized completion_status "${raw.completion_status}".`,
    });
  }
  return "unknown";
}
