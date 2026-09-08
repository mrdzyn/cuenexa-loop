import type { LoopConversation, LoopFact, LoopTodo, NormalizationWarning } from "@cuenexa-loop/contracts";
import type { BeeProxyClient } from "./client.js";
import { normalizeConversation, normalizeFact, normalizeTodo } from "./normalize/index.js";

export interface BeeSnapshot {
  conversations: LoopConversation[];
  facts: LoopFact[];
  todos: LoopTodo[];
  warnings: NormalizationWarning[];
}

/**
 * Fetches recent conversations, facts, and todos from the Bee proxy and
 * normalizes each into CueNexa Loop contracts in one pass. This is the
 * whole "Bee -> Bee Adapter -> Normalized Contracts" pipeline described in
 * the Phase 0 objective, exposed as a single call for the CLI to consume.
 */
export async function fetchBeeSnapshot(client: BeeProxyClient): Promise<BeeSnapshot> {
  const retrievedAt = new Date().toISOString();

  const [rawConversations, rawFacts, rawTodos] = await Promise.all([
    client.listConversations(),
    client.listFacts(),
    client.listTodos(),
  ]);

  const warnings: NormalizationWarning[] = [];

  const conversations = rawConversations.map((raw) => {
    const result = normalizeConversation(raw, retrievedAt);
    warnings.push(...result.warnings);
    return result.record;
  });

  const facts = rawFacts.map((raw) => {
    const result = normalizeFact(raw, retrievedAt);
    warnings.push(...result.warnings);
    return result.record;
  });

  const todos = rawTodos.map((raw) => {
    const result = normalizeTodo(raw, retrievedAt);
    warnings.push(...result.warnings);
    return result.record;
  });

  return { conversations, facts, todos, warnings };
}
