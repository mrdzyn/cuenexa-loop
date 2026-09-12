import type { LoopUtterance } from "@cuenexa-loop/contracts";
import { jaccardSimilarity, splitSentences } from "./text-utils.js";
import type { DetectionCandidate } from "./types.js";

/** How many utterances forward, within the same conversation, to look for an answer — deliberately local/bounded, not "the rest of the conversation". */
const RESOLUTION_WINDOW = 5;

/**
 * Lower than dedup/completion's 0.7: a question and its answer share
 * fewer words by nature ("who owns deployment" → "Alex owns deployment"
 * replaces the interrogative with a name, so a real answer still won't
 * overlap as heavily as two restatements of the same sentence do). Tuned
 * against both required cases in the audit remediation — "Alex owns
 * deployment." resolves (~0.5 overlap), "No one knows yet." does not (0
 * overlap) — with a wide margin on both sides. See __tests__/
 * question-resolution.test.ts.
 */
const RESOLUTION_SIMILARITY_THRESHOLD = 0.4;

/**
 * Conservative same-conversation question-resolution pass: an
 * `open_question` candidate is suppressed only when a *later, non-
 * question* utterance in the same conversation, within a small window,
 * shares enough vocabulary with the question to plausibly be answering
 * it. This is not cross-conversation correlation (Phase 1B) — it never
 * looks outside the single conversation the question came from, and the
 * window is small and local. Precision over recall: when in doubt, the
 * question stays open. See docs/LOOP-DETECTION.md
 * ("Open-question reconciliation").
 */
export function suppressResolvedOpenQuestions(
  candidates: DetectionCandidate[],
  utterances: LoopUtterance[],
): DetectionCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.type !== "open_question") {
      return true;
    }

    const questionIndex = candidate.source.utteranceIndexes[0];
    if (questionIndex === undefined) {
      return true;
    }

    const questionText = candidate.evidence[0]?.text ?? candidate.text;
    const questionSentenceIndex = candidate.sentenceIndex;
    const sameUtterance = utterances[questionIndex];
    if (sameUtterance?.text && questionSentenceIndex !== undefined) {
      const sentences = splitSentences(sameUtterance.text);
      for (const laterSentence of sentences.slice(questionSentenceIndex + 1)) {
        if (!laterSentence.trim().endsWith("?") && jaccardSimilarity(questionText, laterSentence) >= RESOLUTION_SIMILARITY_THRESHOLD) {
          return false;
        }
      }
    }
    const windowEnd = Math.min(questionIndex + RESOLUTION_WINDOW, utterances.length - 1);

    for (let index = questionIndex + 1; index <= windowEnd; index += 1) {
      const laterUtterance = utterances[index];
      if (!laterUtterance?.text) {
        continue;
      }

      for (const laterSentence of splitSentences(laterUtterance.text)) {
        if (laterSentence.trim().endsWith("?")) {
          continue; // another question is not an answer
        }
        if (jaccardSimilarity(questionText, laterSentence) >= RESOLUTION_SIMILARITY_THRESHOLD) {
          return false; // resolved: suppress
        }
      }
    }

    return true;
  });
}
