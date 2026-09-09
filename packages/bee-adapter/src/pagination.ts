import type { Page } from "@cuenexa-loop/contracts";

/**
 * Bee's list responses may be a bare array, or an object wrapping the
 * array under one of a few plausible keys alongside a pagination cursor.
 * This never throws on an unrecognized shape — an unrecognized wrapper is
 * treated as an empty page rather than crashing the pipeline, consistent
 * with the rest of this adapter's defensive normalization.
 */
export function extractPage<T>(body: unknown, itemKeys: string[]): Page<T> {
  if (Array.isArray(body)) {
    return { items: body as T[], nextCursor: null };
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of itemKeys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return { items: value as T[], nextCursor: extractCursor(record) };
      }
    }
  }

  return { items: [], nextCursor: null };
}

function extractCursor(record: Record<string, unknown>): string | null {
  const cursor = record.next_cursor ?? record.nextCursor ?? record.cursor;
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}
