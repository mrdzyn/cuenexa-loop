import type { LoopConversation, LoopFact, LoopTodo, NormalizationWarning, Page } from "@cuenexa-loop/contracts";
import type { BeeAdapterClient } from "./bee-client.js";
import type { ListPageOptions } from "./bee-client.js";
import { mapWithConcurrency } from "./concurrency.js";
import { normalizeConversation, normalizeFact, normalizeTodo } from "./normalize/index.js";
import { coerceId } from "./normalize/util.js";
import type { BeeConversation, BeeFact, BeeTodo } from "./raw-types.js";

export interface PageInfo {
  /** Non-null when Bee reported more results than this snapshot fetched (first page only). */
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

const DEFAULT_HYDRATION_CONCURRENCY = 4;

export interface FetchDetectionSnapshotOptions {
  /** Max concurrent `conversations.get(id)` calls when hydrating full conversation detail. */
  concurrency?: number;
}

/** Full, bounded pagination used only by Phase 2's authoritative local sync. */
export interface FetchCompleteDetectionSnapshotOptions extends FetchDetectionSnapshotOptions {
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly maxItems?: number;
}

export interface CompleteDetectionSnapshot {
  readonly snapshot: BeeSnapshot;
  /** False means a page bound or repeated cursor prevented an authoritative scan. */
  readonly complete: boolean;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_MAX_ITEMS = 10_000;

/**
 * Fetches the first page of recent conversations, facts, and todos from
 * Bee (via the official `@beeai/cli/lib` client) and normalizes each into
 * CueNexa Loop contracts in one pass. **Conversations here are list
 * records only** — Bee's `conversations.list()` endpoint returns
 * summary data without nested `transcriptions[].utterances[]`, so
 * `LoopConversation.utterances` will always be empty from this function.
 * That's intentional for a lightweight connectivity check (`bee:check`
 * uses this) — Loop detection needs `fetchDetectionSnapshot` instead,
 * which additionally hydrates full conversation detail. See
 * docs/BEE_INTEGRATION.md ("bee:check vs. loops:check").
 */
export async function fetchBeeSnapshot(client: BeeAdapterClient): Promise<BeeSnapshot> {
  const retrievedAt = new Date().toISOString();

  const [conversationsPage, factsPage, todosPage] = await Promise.all([
    client.listConversations(),
    client.listFacts(),
    client.listTodos(),
  ]);

  return buildSnapshot(conversationsPage, factsPage, todosPage, retrievedAt);
}

/**
 * Like `fetchBeeSnapshot`, but additionally hydrates each listed
 * conversation's full detail (`conversations.get(id)`) so
 * `LoopConversation.utterances` is actually populated. Without this,
 * conversation-derived Loop detection can never fire — the list endpoint
 * alone never includes nested transcriptions, so every conversation would
 * normalize to zero utterances and detection could only ever come from
 * Bee Todos and Facts. `loops:check` uses this function; `bee:check` does
 * not (it only needs counts, not content).
 *
 * Hydration failures are per-conversation and non-fatal: a conversation
 * whose detail couldn't be fetched (missing, unreadable, or the detail
 * call itself throwing) falls back to its list-summary data (metadata
 * only, no utterances) with a warning explaining why — never dropped,
 * never aborting the whole snapshot. Detail fetches run with bounded
 * concurrency (default 4, configurable) rather than one at a time or
 * unbounded-in-parallel. No raw transcript content is ever included in a
 * warning message — only conversation ids and a generic reason.
 */
export async function fetchDetectionSnapshot(
  client: BeeAdapterClient,
  options: FetchDetectionSnapshotOptions = {},
): Promise<BeeSnapshot> {
  const retrievedAt = new Date().toISOString();
  const concurrency = options.concurrency ?? DEFAULT_HYDRATION_CONCURRENCY;

  const [conversationsPage, factsPage, todosPage] = await Promise.all([
    client.listConversations(),
    client.listFacts(),
    client.listTodos(),
  ]);

  const hydrationWarnings: NormalizationWarning[] = [];
  const hydratedItems = await mapWithConcurrency(conversationsPage.items, concurrency, (summary) =>
    hydrateConversation(client, summary, hydrationWarnings),
  );

  const snapshot = buildSnapshot(
    { items: hydratedItems, nextCursor: conversationsPage.nextCursor },
    factsPage,
    todosPage,
    retrievedAt,
  );

  return { ...snapshot, warnings: [...hydrationWarnings, ...snapshot.warnings] };
}

/**
 * Fetches all currently processable Bee pages with explicit caps and loop
 * detection, then hydrates every conversation. This is intentionally a new
 * API: Phase 1's first-page detection path remains lightweight and unchanged.
 */
export async function fetchCompleteDetectionSnapshot(
  client: BeeAdapterClient,
  options: FetchCompleteDetectionSnapshotOptions = {},
): Promise<CompleteDetectionSnapshot> {
  const retrievedAt = new Date().toISOString();
  const pageSize = positiveBound(options.pageSize, DEFAULT_PAGE_SIZE);
  const maxPages = positiveBound(options.maxPages, DEFAULT_MAX_PAGES);
  const maxItems = positiveBound(options.maxItems, DEFAULT_MAX_ITEMS);
  const concurrency = options.concurrency ?? DEFAULT_HYDRATION_CONCURRENCY;
  const [conversations, facts, todos] = await Promise.all([
    fetchAllPages((page) => client.listConversations(page), pageSize, maxPages, maxItems, "conversations"),
    fetchAllPages((page) => client.listFacts(page), pageSize, maxPages, maxItems, "facts"),
    fetchAllPages((page) => client.listTodos(page), pageSize, maxPages, maxItems, "todos"),
  ]);
  const hydrationWarnings: NormalizationWarning[] = [];
  const hydratedItems = await mapWithConcurrency(
    dedupeRaw(conversations.items),
    concurrency,
    (summary) => hydrateConversation(client, summary, hydrationWarnings),
  );
  const snapshot = buildSnapshot(
    { items: hydratedItems, nextCursor: conversations.nextCursor },
    { items: dedupeRaw(facts.items), nextCursor: facts.nextCursor },
    { items: dedupeRaw(todos.items), nextCursor: todos.nextCursor },
    retrievedAt,
  );
  const paginationWarnings = [...conversations.warnings, ...facts.warnings, ...todos.warnings];
  return {
    snapshot: { ...snapshot, warnings: [...hydrationWarnings, ...paginationWarnings, ...snapshot.warnings] },
    complete: conversations.complete && facts.complete && todos.complete,
  };
}

async function hydrateConversation(
  client: BeeAdapterClient,
  summary: BeeConversation,
  warnings: NormalizationWarning[],
): Promise<BeeConversation> {
  const id = coerceId(summary.id);
  if (id === null) {
    warnings.push({
      field: "conversation",
      message: "Skipped hydrating a listed conversation with no id; using summary-only data.",
    });
    return summary;
  }

  try {
    const detail = await client.getConversation(id);
    if (!detail) {
      warnings.push({
        field: "conversation",
        message: `Bee returned no detail for conversation ${id}; using summary-only data.`,
      });
      return summary;
    }
    return detail;
  } catch {
    warnings.push({
      field: "conversation",
      message: `Failed to fetch full detail for conversation ${id}; using summary-only data.`,
    });
    return summary;
  }
}

function buildSnapshot(
  conversationsPage: Page<BeeConversation>,
  factsPage: Page<BeeFact>,
  todosPage: Page<BeeTodo>,
  retrievedAt: string,
): BeeSnapshot {
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

interface PagedResult<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
  readonly complete: boolean;
  readonly warnings: NormalizationWarning[];
}

async function fetchAllPages<T>(
  fetch: (options: ListPageOptions) => Promise<Page<T>>,
  pageSize: number,
  maxPages: number,
  maxItems: number,
  field: string,
): Promise<PagedResult<T>> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  const warnings: NormalizationWarning[] = [];
  let cursor: string | undefined;
  for (let pageCount = 0; pageCount < maxPages; pageCount += 1) {
    if (cursor && seenCursors.has(cursor)) {
      warnings.push({ field, message: "Pagination stopped because Bee repeated a cursor; snapshot is partial." });
      return { items, nextCursor: cursor, complete: false, warnings };
    }
    if (cursor) seenCursors.add(cursor);
    const page = await fetch({ cursor, limit: pageSize });
    if (items.length + page.items.length > maxItems) {
      warnings.push({ field, message: "Pagination stopped at the configured item cap; snapshot is partial." });
      return { items, nextCursor: cursor ?? null, complete: false, warnings };
    }
    items.push(...page.items);
    if (page.nextCursor === null) return { items, nextCursor: null, complete: true, warnings };
    if (seenCursors.has(page.nextCursor)) {
      warnings.push({ field, message: "Pagination stopped because Bee returned a repeated next cursor; snapshot is partial." });
      return { items, nextCursor: page.nextCursor, complete: false, warnings };
    }
    cursor = page.nextCursor;
  }
  warnings.push({ field, message: "Pagination stopped at the configured page cap; snapshot is partial." });
  return { items, nextCursor: cursor ?? null, complete: false, warnings };
}

function dedupeRaw<T>(items: readonly T[]): T[] {
  const seenIds = new Set<string>();
  return items.filter((item) => {
    const candidate = item as { id?: string | number | null };
    const id = coerceId(candidate.id);
    if (id === null) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
}

function positiveBound(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isInteger(value) || value < 1 ? fallback : value;
}
