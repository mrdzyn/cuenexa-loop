import type { Page } from "@cuenexa-loop/contracts";
import { BeeMalformedResponseError } from "./errors.js";

/**
 * Bee's list responses may be a bare array, or an object wrapping the
 * array under one of a few plausible keys alongside a pagination cursor.
 *
 * A recognized wrapper whose array is empty (e.g. `{ facts: [] }`) is a
 * legitimate, successful empty page — "zero items" is a real answer Bee
 * can give. An *unrecognized* shape (none of `itemKeys` present as an
 * array, or a non-object/non-array body) is not the same thing: silently
 * treating it as "zero items" would mask a broken response or an API
 * change as an empty-but-successful result. So this throws
 * BeeMalformedResponseError instead of returning an empty page — the
 * distinction between "genuinely empty" and "shape we don't recognize"
 * must not be lost.
 */
export function extractPage<T>(body: unknown, itemKeys: string[], action: string): Page<T> {
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

  throw new BeeMalformedResponseError(`Bee CLI returned an unrecognized response shape while ${action}.`);
}

function extractCursor(record: Record<string, unknown>): string | null {
  const cursor = record.next_cursor ?? record.nextCursor ?? record.cursor;
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}
