import type { LoopConversation, LoopFact, LoopTodo } from "@cuenexa-loop/contracts";
import { CONFIDENCE } from "./confidence.js";
import { extractDeadline } from "./deadline.js";
import { detectSentence } from "./detectors/index.js";
import { FOLLOW_UP_VERB_PATTERN } from "./detectors/patterns.js";
import type { DetectorMatch } from "./detectors/types.js";
import { capitalizeFirst, escapeRegExp, splitSentences, stripTrailingPunctuation } from "./text-utils.js";
import type { DetectionCandidate, DetectionWarning, LoopItemType, LoopSource } from "./types.js";

/** Text-derived types get their trailing deadline phrase stripped from the display text (see attachDeadline). */
const DEADLINE_STRIPPABLE_TYPES = new Set<LoopItemType>(["commitment", "follow_up"]);

export function candidatesFromConversation(
  conversation: LoopConversation,
  now: string,
  warnings: DetectionWarning[],
): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];

  conversation.utterances.forEach((utterance, index) => {
    if (!utterance.text || utterance.text.trim().length === 0) {
      warnings.push({
        field: "utterance",
        message: `Skipped empty utterance at index ${index} in conversation ${conversation.id}.`,
      });
      return;
    }

    for (const sentence of splitSentences(utterance.text)) {
      const match = detectSentence(sentence);
      if (!match) {
        continue;
      }

      const source: LoopSource = {
        provider: conversation.provenance.source,
        conversationId: conversation.id,
        factId: null,
        todoId: null,
        utteranceIndexes: [index],
      };

      candidates.push(
        finalizeCandidate(match, sentence, now, source, {
          type: "utterance",
          sourceId: conversation.id,
          text: sentence,
        }),
      );
    }
  });

  return candidates;
}

export function candidatesFromFact(fact: LoopFact, now: string, warnings: DetectionWarning[]): DetectionCandidate[] {
  if (!fact.text || fact.text.trim().length === 0) {
    warnings.push({ field: "fact", message: `Skipped empty fact text for fact ${fact.id}.` });
    return [];
  }

  const candidates: DetectionCandidate[] = [];

  for (const sentence of splitSentences(fact.text)) {
    const match = detectSentence(sentence);
    if (!match) {
      continue;
    }

    const source: LoopSource = {
      provider: fact.provenance.source,
      conversationId: null,
      factId: fact.id,
      todoId: null,
      utteranceIndexes: [],
    };

    candidates.push(finalizeCandidate(match, sentence, now, source, { type: "fact", sourceId: fact.id, text: sentence }));
  }

  return candidates;
}

/**
 * Bee Todos are treated as high-confidence actionable evidence and
 * (almost) always produce a candidate, rather than being subject to the
 * same pattern-matching gate as conversation/fact text — a todo is
 * inherently action-shaped by construction. Only genuinely empty text or
 * a non-open status (completed/unknown) suppresses one, since Phase 1A's
 * purpose is surfacing what remains *unfinished*.
 */
export function candidateFromTodo(todo: LoopTodo, now: string, warnings: DetectionWarning[]): DetectionCandidate | null {
  if (!todo.text || todo.text.trim().length === 0) {
    warnings.push({ field: "todo", message: `Skipped empty todo text for todo ${todo.id}.` });
    return null;
  }
  if (todo.status !== "open") {
    return null;
  }

  const sentence = stripTrailingPunctuation(todo.text).trim();
  const isFollowUp = FOLLOW_UP_VERB_PATTERN.test(sentence);
  const type: LoopItemType = isFollowUp ? "follow_up" : "commitment";

  // Bee's own `dueAt` (already resolved during Phase 0 normalization) is preferred over re-parsing the todo text.
  const textExtraction = extractDeadline(sentence, now);
  const dueAt = todo.dueAt ?? textExtraction?.dueAt ?? null;
  const dueAtPhrase = textExtraction?.phrase ?? null;
  const text = dueAtPhrase && DEADLINE_STRIPPABLE_TYPES.has(type) ? stripDeadlinePhrase(sentence, dueAtPhrase) : sentence;

  return {
    type,
    text: capitalizeFirst(text),
    confidence: CONFIDENCE.BEE_TODO_OPEN,
    owner: null,
    counterparties: [],
    dueAt,
    dueAtPhrase,
    source: { provider: todo.provenance.source, conversationId: null, factId: null, todoId: todo.id, utteranceIndexes: [] },
    evidence: [{ type: "todo", sourceId: todo.id, text: todo.text }],
  };
}

function finalizeCandidate(
  match: DetectorMatch,
  sentence: string,
  now: string,
  source: LoopSource,
  evidence: { type: "utterance" | "fact" | "todo"; sourceId: string | null; text: string },
): DetectionCandidate {
  const extraction = extractDeadline(sentence, now);
  const dueAt = extraction?.dueAt ?? null;
  const dueAtPhrase = extraction?.phrase ?? null;
  const text = dueAtPhrase && DEADLINE_STRIPPABLE_TYPES.has(match.type) ? stripDeadlinePhrase(match.text, dueAtPhrase) : match.text;

  return {
    type: match.type,
    text,
    confidence: match.confidence,
    owner: match.owner,
    counterparties: match.counterparties,
    dueAt,
    dueAtPhrase,
    source,
    evidence: [evidence],
  };
}

function stripDeadlinePhrase(text: string, phrase: string): string {
  const pattern = new RegExp(`\\s*\\b(?:by|on|before)?\\s*${escapeRegExp(phrase)}\\b`, "i");
  const stripped = text.replace(pattern, "").replace(/\s+/g, " ").trim();
  return stripped.length > 0 ? stripped : text;
}
