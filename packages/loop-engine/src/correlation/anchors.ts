import { tokenize } from "../text-utils.js";
import type { LoopItem } from "../types.js";

/**
 * Action, timing, and courtesy words that can never strengthen an adjacent
 * phrase. For example, "send revised" is an instruction fragment, not a
 * subject anchor. Keep this explicit and conservative to favor precision.
 */
export const NON_STRENGTHENING_PHRASE_TOKENS = new Set([
  "send",
  "check",
  "review",
  "follow",
  "up",
  "back",
  "in",
  "revisit",
  "update",
  "tomorrow",
  "today",
  "email",
  "call",
  "next",
  "week",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "please",
]);

/**
 * Generic business-context words cannot stand as single-token anchors, but
 * may remain in a phrase with a specific subject/object ("vendor contract").
 */
export const GENERIC_BUSINESS_CONTEXT_TOKENS = new Set([
  "with",
  "vendor",
  "client",
  "customer",
  "report",
  "meeting",
]);

/** Common words excluded from single-token correlation anchors. */
export const GENERIC_CORRELATION_TOKENS = new Set([
  ...NON_STRENGTHENING_PHRASE_TOKENS,
  ...GENERIC_BUSINESS_CONTEXT_TOKENS,
]);

/** Transient anchor data for deterministic comparison; never stored in a Loop contract or identifier. */
export interface CorrelationAnchors {
  readonly specificTokens: readonly string[];
  readonly specificPhrases: readonly string[];
}

/**
 * Extracts conservative single-token and adjacent two-token anchors from
 * Phase 1A display/evidence text. Punctuation and case normalize through
 * existing text utilities; no NLP, network, or mutation is involved.
 */
export function extractCorrelationAnchors(item: LoopItem): CorrelationAnchors {
  const specificTokens = new Set<string>();
  const specificPhrases = new Set<string>();
  const texts = [item.text, ...item.evidence.map((evidence) => evidence.text)];

  for (const text of texts) {
    const comparisonTokens = tokenize(text);
    for (const token of comparisonTokens) {
      if (isSpecificToken(token)) {
        specificTokens.add(token);
      }
    }

    for (const phrase of adjacentMeaningfulPhrases(text)) {
      specificPhrases.add(phrase);
    }
  }

  return {
    specificTokens: [...specificTokens].sort(),
    specificPhrases: [...specificPhrases].sort(),
  };
}

function adjacentMeaningfulPhrases(text: string): string[] {
  const normalizedTokens = tokenize(text);
  const phrases: string[] = [];

  for (let index = 0; index < normalizedTokens.length - 1; index += 1) {
    const first = normalizedTokens[index];
    const second = normalizedTokens[index + 1];
    if (!first || !second || first.length < 3 || second.length < 3) {
      continue;
    }
    // Action, timing, and courtesy fragments never become phrase anchors just
    // because an adjacent modifier is specific (for example, "send revised").
    if (NON_STRENGTHENING_PHRASE_TOKENS.has(first) || NON_STRENGTHENING_PHRASE_TOKENS.has(second)) {
      continue;
    }
    // Generic business context may pair with a specific subject/object, such
    // as "vendor contract", but cannot stand as a single-token anchor.
    if (isSpecificToken(first) || isSpecificToken(second)) {
      phrases.push(`${first} ${second}`);
    }
  }

  return phrases;
}

function isSpecificToken(token: string): boolean {
  return token.length >= 3 && !GENERIC_CORRELATION_TOKENS.has(token);
}
