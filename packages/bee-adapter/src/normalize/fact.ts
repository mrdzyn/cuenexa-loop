import type {
  LoopFact,
  LoopFactStatus,
  NormalizationResult,
  NormalizationWarning,
} from "@cuenexa-loop/contracts";
import type { BeeFact } from "../raw-types.js";
import { coerceId, coerceText, coerceTimestamp, warnAndPlaceholder } from "./util.js";

export function normalizeFact(raw: BeeFact, retrievedAt: string): NormalizationResult<LoopFact> {
  const warnings: NormalizationWarning[] = [];

  const id = coerceId(raw.id) ?? warnAndPlaceholder(warnings, "fact");

  const text = coerceText(raw.text);
  if (!text) {
    warnings.push({ field: "text", message: "Fact has no text content." });
  }

  const record: LoopFact = {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt },
    text: text ?? "",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    status: normalizeStatus(raw.confirmation_status, warnings),
    capturedAt: coerceTimestamp(raw.timestamp),
  };

  return { record, warnings };
}

function normalizeStatus(
  value: string | null | undefined,
  warnings: NormalizationWarning[],
): LoopFactStatus {
  if (value === "confirmed" || value === "pending") {
    return value;
  }
  if (value != null) {
    warnings.push({ field: "status", message: `Unrecognized confirmation_status "${value}".` });
  }
  return "unknown";
}
