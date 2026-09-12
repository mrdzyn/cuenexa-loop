import { tokenize } from "../text-utils.js";
import type { LoopItem } from "../types.js";

/**
 * Common action, timing, and generic business-context words. They remain
 * explicit so Phase 1B favors false negatives over unsafe correlations.
 */
export const GENERIC_CORRELATION_TOKENS = new Set([
  "send",
  "check",
  "review",
  "follow",
  "up",
  "back",
  "in",
  "revisit",
  "with",
  "vendor",
  "client",
  "customer",
  "report",
  "update",
  "tomorrow",
  "today",
  "meeting",
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
    // Retain a phrase such as "vendor contract" when it includes a specific
    // noun, while rejecting entirely generic pairs such as "send report".
    if (isSpecificToken(first) || isSpecificToken(second)) {
      phrases.push(`${first} ${second}`);
    }
  }

  return phrases;
}

function isSpecificToken(token: string): boolean {
  return token.length >= 3 && !GENERIC_CORRELATION_TOKENS.has(token);
}
