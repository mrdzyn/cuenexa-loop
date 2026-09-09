/**
 * `@cuenexa-loop/loop-engine` is a Phase 0 architectural placeholder only.
 * It exists so the package boundary for Phase 1 Loop intelligence
 * (commitment/decision/delegation/follow-up/deadline/open-question
 * detection over `@cuenexa-loop/contracts` records) is established now,
 * without implementing any of it yet.
 *
 * Nothing in this file performs detection, matching, scoring, or
 * inference. It defines the placeholder domain shapes a later phase will
 * flesh out and produce from `LoopConversation`/`LoopFact`/`LoopTodo`.
 * Do not add keyword matching, heuristics, AI/LLM calls, embeddings, or
 * cross-conversation correlation here — that is explicitly out of scope
 * until Phase 1.
 */

export type LoopItemType = "commitment" | "decision" | "delegation" | "follow_up" | "deadline" | "open_question";

interface LoopItemPlaceholder {
  /** Discriminates which kind of Loop item this placeholder stands in for. */
  type: LoopItemType;
}

export interface Commitment extends LoopItemPlaceholder {
  type: "commitment";
}

export interface Decision extends LoopItemPlaceholder {
  type: "decision";
}

export interface Delegation extends LoopItemPlaceholder {
  type: "delegation";
}

export interface FollowUp extends LoopItemPlaceholder {
  type: "follow_up";
}

export interface Deadline extends LoopItemPlaceholder {
  type: "deadline";
}

export interface OpenQuestion extends LoopItemPlaceholder {
  type: "open_question";
}

export type Loop = Commitment | Decision | Delegation | FollowUp | Deadline | OpenQuestion;
