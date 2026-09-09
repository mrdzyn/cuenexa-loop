import {
  LoopTodoSchema,
  type LoopTodo,
  type LoopTodoStatus,
  type NormalizationResult,
  type NormalizationWarning,
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
    // created_at/alarm_at are the current, authoritative fields; created/alarm are legacy fallbacks.
    createdAt: coerceTimestamp(raw.created_at ?? raw.created),
    dueAt: coerceTimestamp(raw.alarm_at ?? raw.alarm),
  };

  return { record: LoopTodoSchema.parse(record), warnings };
}

/**
 * `completed` (boolean) is the current, authoritative Bee field.
 * `completion_status` (string) is a legacy fallback for older Bee
 * versions, used only when `completed` itself is absent.
 */
function normalizeStatus(raw: BeeTodo, warnings: NormalizationWarning[]): LoopTodoStatus {
  if (typeof raw.completed === "boolean") {
    return raw.completed ? "completed" : "open";
  }

  if (raw.completion_status === "open" || raw.completion_status === "completed") {
    warnings.push({
      field: "status",
      message: "Used legacy completion_status fallback; current Bee todo field is `completed`.",
    });
    return raw.completion_status;
  }

  if (raw.completion_status != null) {
    warnings.push({ field: "status", message: `Unrecognized completion_status "${raw.completion_status}".` });
  } else {
    warnings.push({ field: "status", message: "No `completed` field found on the raw todo." });
  }
  return "unknown";
}
