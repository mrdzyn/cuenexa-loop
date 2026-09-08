import type { NormalizationWarning } from "@cuenexa-loop/contracts";

export function coerceId(value: string | number | null | undefined): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** Bee timestamps show up as either ISO 8601 strings or epoch milliseconds. */
export function coerceTimestamp(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function coerceText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

let placeholderCounter = 0;

/** Deterministic-enough placeholder id for records missing one, so a batch never silently drops a record. */
function placeholderId(prefix: string): string {
  placeholderCounter += 1;
  return `${prefix}-unknown-${Date.now().toString(36)}-${placeholderCounter}`;
}

/** Records a warning for a missing id and returns a placeholder so the record is never silently dropped. */
export function warnAndPlaceholder(warnings: NormalizationWarning[], kind: string): string {
  warnings.push({ field: "id", message: `Missing or invalid ${kind} id; generated a placeholder.` });
  return placeholderId(kind);
}
