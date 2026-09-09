import type { LoopConversation, LoopFact, LoopTodo, NormalizationWarning } from "@cuenexa-loop/contracts";
import type { BeeAdapterClient } from "./bee-client.js";
import { normalizeConversation, normalizeFact, normalizeTodo } from "./normalize/index.js";

export interface PageInfo {
  /** Non-null when Bee reported more results than this Phase 0 snapshot fetched (first page only). */
  nextCursor: string | null;
}

export interface BeeSnapshot {
  conversations: LoopConversation[];
  facts: LoopFact[];
  todos: LoopTodo[];
  warnings: NormalizationWarning[];
  pagination: {
    conversations: PageInfo;
    facts: PageInfo;
    todos: PageInfo;
  };
}

/**
 * Fetches the first page of recent conversations, facts, and todos from
 * Bee (via the official `@beeai/cli/lib` client) and normalizes each into
 * CueNexa Loop contracts in one pass. This is the whole
 * "Bee -> Bee Adapter -> Normalized Contracts" pipeline for Phase 0.
 *
 * Only the first page of each list is fetched — see `pagination` on the
 * result for whether more exists. Phase 0 does not implement historical
 * sync; a non-null `nextCursor` is a signal for a later phase, not
 * something this function acts on.
 */
export async function fetchBeeSnapshot(client: BeeAdapterClient): Promise<BeeSnapshot> {
  const retrievedAt = new Date().toISOString();

  const [conversationsPage, factsPage, todosPage] = await Promise.all([
    client.listConversations(),
    client.listFacts(),
    client.listTodos(),
  ]);

  const warnings: NormalizationWarning[] = [];

  const conversations = conversationsPage.items.map((raw) => {
    const result = normalizeConversation(raw, retrievedAt);
    warnings.push(...result.warnings);
    return result.record;
  });

  const facts = factsPage.items.map((raw) => {
    const result = normalizeFact(raw, retrievedAt);
    warnings.push(...result.warnings);
    return result.record;
  });

  const todos = todosPage.items.map((raw) => {
    const result = normalizeTodo(raw, retrievedAt);
    warnings.push(...result.warnings);
    return result.record;
  });

  return {
    conversations,
    facts,
    todos,
    warnings,
    pagination: {
      conversations: { nextCursor: conversationsPage.nextCursor },
      facts: { nextCursor: factsPage.nextCursor },
      todos: { nextCursor: todosPage.nextCursor },
    },
  };
}
