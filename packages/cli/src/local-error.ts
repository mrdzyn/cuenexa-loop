/** Never render SQLite errors verbatim: a malformed local database can contain private strings. */
export function renderLocalStateError(): string {
  return "CueNexa Loop could not access local state. Preserve the database and repair or reset it manually.";
}
