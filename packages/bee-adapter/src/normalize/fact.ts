import {
  LoopFactSchema,
  type LoopFact,
  type LoopFactStatus,
  type NormalizationResult,
  type NormalizationWarning,
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
    status: normalizeStatus(raw, warnings),
    // created_at is the current, authoritative field; timestamp is a legacy fallback.
    capturedAt: coerceTimestamp(raw.created_at ?? raw.timestamp),
  };

  return { record: LoopFactSchema.parse(record), warnings };
}

/**
 * `confirmed` (boolean) is the current, authoritative Bee field.
 * `confirmation_status` (string) is a legacy fallback for older Bee
 * versions, used only when `confirmed` itself is absent — so a fact with a
 * real `confirmed: true` never normalizes to "unknown".
 */
function normalizeStatus(raw: BeeFact, warnings: NormalizationWarning[]): LoopFactStatus {
  if (typeof raw.confirmed === "boolean") {
    return raw.confirmed ? "confirmed" : "pending";
  }

  if (raw.confirmation_status === "confirmed" || raw.confirmation_status === "pending") {
    warnings.push({
      field: "status",
      message: "Used legacy confirmation_status fallback; current Bee fact field is `confirmed`.",
    });
    return raw.confirmation_status;
  }

  if (raw.confirmation_status != null) {
    warnings.push({ field: "status", message: `Unrecognized confirmation_status "${raw.confirmation_status}".` });
  } else {
    warnings.push({ field: "status", message: "No `confirmed` field found on the raw fact." });
  }
  return "unknown";
}
