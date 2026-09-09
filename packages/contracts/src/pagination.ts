/**
 * A single page of results from a cursor-paginated upstream list endpoint.
 * `nextCursor` is `null` when the page is known to be the last one, and a
 * cursor string when more results exist. Phase 0 adapters may only ever
 * fetch the first page, but callers must still be able to tell — from this
 * type alone — that more data could exist, rather than a flat array
 * silently implying completeness.
 */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
