import type { LoopConversation, LoopFact, LoopTodo, LoopUtterance } from "@cuenexa-loop/contracts";

/**
 * Factories for entirely synthetic `LoopConversation`/`LoopFact`/
 * `LoopTodo` records, for tests only. No real Bee data, names, or IDs —
 * every value here is invented for this repository, following the same
 * "Speaker A / Speaker B", "123 Fictional Avenue" convention used by
 * packages/bee-adapter's fixtures.
 */

const RETRIEVED_AT = "2026-01-05T09:15:00.000Z";

let conversationCounter = 0;
let factCounter = 0;
let todoCounter = 0;

export function makeUtterance(overrides: Partial<LoopUtterance> = {}): LoopUtterance {
  return {
    speaker: "Speaker A",
    text: "",
    spokenAt: null,
    ...overrides,
  };
}

export function makeConversation(
  utteranceTexts: string[],
  overrides: Partial<LoopConversation> = {},
): LoopConversation {
  conversationCounter += 1;
  const id = overrides.id ?? `conv_synthetic_${String(conversationCounter).padStart(3, "0")}`;
  return {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt: RETRIEVED_AT },
    startedAt: "2026-01-05T09:00:00.000Z",
    endedAt: "2026-01-05T09:12:00.000Z",
    summary: "Synthetic test conversation.",
    detailedSummary: null,
    location: null,
    deviceType: "ios",
    utterances: utteranceTexts.map((text, index) =>
      makeUtterance({ text, speaker: index % 2 === 0 ? "Speaker A" : "Speaker B" }),
    ),
    ...overrides,
  };
}

export function makeFact(text: string, overrides: Partial<LoopFact> = {}): LoopFact {
  factCounter += 1;
  const id = overrides.id ?? `fact_synthetic_${String(factCounter).padStart(3, "0")}`;
  return {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt: RETRIEVED_AT },
    text,
    tags: [],
    status: "confirmed",
    capturedAt: "2026-01-04T18:30:00.000Z",
    ...overrides,
  };
}

export function makeTodo(text: string, overrides: Partial<LoopTodo> = {}): LoopTodo {
  todoCounter += 1;
  const id = overrides.id ?? `todo_synthetic_${String(todoCounter).padStart(3, "0")}`;
  return {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt: RETRIEVED_AT },
    text,
    status: "open",
    createdAt: "2026-01-05T09:12:10.000Z",
    dueAt: null,
    ...overrides,
  };
}

export const NOW = "2026-01-05T09:15:00.000Z";
