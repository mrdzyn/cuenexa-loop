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

/**
 * Values below this magnitude are treated as epoch *seconds*, not
 * milliseconds. Current epoch milliseconds are ~1.7e12; current epoch
 * seconds are ~1.7e9 — 1e12 sits comfortably between the two, so a
 * realistic Bee timestamp never lands ambiguously close to the boundary.
 */
const EPOCH_SECONDS_THRESHOLD = 1e12;

const NUMERIC_STRING_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Bee timestamps show up as ISO 8601 strings, epoch milliseconds, epoch
 * seconds, or a numeric-looking string of either. `new Date(numericString)`
 * does not reliably parse a bare numeric string as an epoch value (it's
 * parsed as a date string, which for most digit sequences is invalid) —
 * numeric strings are parsed as numbers first so they get the same
 * seconds-vs-milliseconds handling as an actual number.
 */
export function coerceTimestamp(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return isoFromEpochNumber(value);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (NUMERIC_STRING_PATTERN.test(trimmed)) {
    return isoFromEpochNumber(Number(trimmed));
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoFromEpochNumber(value: number): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const milliseconds = Math.abs(value) < EPOCH_SECONDS_THRESHOLD ? value * 1000 : value;
  const date = new Date(milliseconds);
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
