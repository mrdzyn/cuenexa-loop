/**
 * Splits a block of text into sentence-like segments on `.`/`!`/`?`
 * boundaries. Deliberately naive (no real abbreviation handling) — Bee
 * utterances are typically already a single spoken turn, so this mostly
 * exists to handle the occasional multi-sentence utterance or fact/todo
 * text without pulling in a full sentence-boundary library. A terminator
 * only counts as a boundary when followed by whitespace or end-of-string
 * — specifically so a period inside an email address or domain
 * ("jordan@example.com") is never treated as ending a sentence, which
 * would otherwise split the address across two fragments and silently
 * defeat email redaction downstream (see docs/LOOP-DETECTION.md,
 * "Limitations").
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  const boundaryPattern = /[.!?]+(?=\s|$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = boundaryPattern.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const sentence = text.slice(cursor, end).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    cursor = end;
  }

  const remainder = text.slice(cursor).trim();
  if (remainder.length > 0) {
    sentences.push(remainder);
  }

  return sentences;
}

/** Lowercases, strips punctuation, and collapses whitespace — for token-overlap comparison, not display. */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["a", "an", "the", "to", "of", "for", "and", "or", "is", "are", "will", "i", "we"]);

/** Tokenizes for similarity comparison, dropping stopwords so two paraphrases of the same action still overlap well. */
export function tokenize(text: string): string[] {
  return normalizeForComparison(text)
    .split(" ")
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

export function capitalizeFirst(text: string): string {
  if (text.length === 0) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Strips a trailing sentence terminator, used before re-capitalizing a derived action phrase. */
export function stripTrailingPunctuation(text: string): string {
  return text.replace(/[.!?]+\s*$/, "").trim();
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LEADING_FIRST_PERSON_TRIGGER_PATTERN = /^i(?:'ll|\s+will|\s+can)\s+/i;

/**
 * Strips a leading "I'll"/"I will"/"I can" and trailing punctuation, then
 * capitalizes — turns "I'll send the revised proposal tomorrow." into
 * "Send the revised proposal tomorrow" (deadline-phrase stripping, if
 * any, happens separately in the candidate builder).
 */
export function deriveFirstPersonActionText(sentence: string): string {
  const withoutPunctuation = stripTrailingPunctuation(sentence);
  const withoutTrigger = withoutPunctuation.replace(LEADING_FIRST_PERSON_TRIGGER_PATTERN, "");
  return capitalizeFirst(withoutTrigger.trim());
}
