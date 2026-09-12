import type { LoopItem } from "../types.js";
import { extractCorrelationAnchors } from "./anchors.js";

const MAXIMUM_LOOP_TITLE_LENGTH = 80;

interface TitleCandidate {
  readonly value: string;
  readonly memberCount: number;
  readonly isPhrase: boolean;
  readonly tokenCount: number;
}

/** Chooses a concise shared anchor using stable structural ranking only. */
export function deriveLoopTitle(items: readonly LoopItem[]): string {
  const coverage = new Map<string, { memberCount: number; isPhrase: boolean }>();

  for (const item of items) {
    const anchors = extractCorrelationAnchors(item);
    for (const phrase of new Set(anchors.specificPhrases)) {
      const key = `phrase:${phrase}`;
      coverage.set(key, { memberCount: (coverage.get(key)?.memberCount ?? 0) + 1, isPhrase: true });
    }
    for (const token of new Set(anchors.specificTokens)) {
      const key = `token:${token}`;
      coverage.set(key, { memberCount: (coverage.get(key)?.memberCount ?? 0) + 1, isPhrase: false });
    }
  }

  const candidates: TitleCandidate[] = [...coverage.entries()]
    .filter(([, value]) => value.memberCount >= 2)
    .map(([key, value]) => {
      const anchor = key.slice(key.indexOf(":") + 1);
      return {
        value: anchor,
        memberCount: value.memberCount,
        isPhrase: value.isPhrase,
        tokenCount: anchor.split(" ").length,
      };
    });
  candidates.sort(
    (a, b) =>
      b.memberCount - a.memberCount ||
      Number(b.isPhrase) - Number(a.isPhrase) ||
      b.tokenCount - a.tokenCount ||
      b.value.length - a.value.length ||
      a.value.localeCompare(b.value),
  );

  const title = candidates[0]?.value ?? "untitled loop";
  return titleCase(title).slice(0, MAXIMUM_LOOP_TITLE_LENGTH).trim();
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((token) => token.length > 0 ? `${token[0]?.toUpperCase() ?? ""}${token.slice(1)}` : token)
    .join(" ");
}
