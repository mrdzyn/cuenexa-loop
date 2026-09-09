import { z } from "zod";

/**
 * The six Phase 1A Loop item types. `"deadline"` is kept in the type union
 * for schema completeness (matching the project's stated domain model) but
 * Phase 1A's detectors never emit it directly — a deadline is represented
 * as the `dueAt`/`dueAtPhrase` attributes on any other item type instead.
 * See docs/LOOP-DETECTION.md for why.
 */
export const LoopItemTypeSchema = z.enum(["commitment", "decision", "delegation", "follow_up", "deadline", "open_question"]);
export type LoopItemType = z.infer<typeof LoopItemTypeSchema>;

/**
 * Phase 1A only ever produces `"open"` items (a suppressed/negated
 * candidate is never emitted in the first place, rather than emitted and
 * marked `"dismissed"`). The other states exist for later phases
 * (resolution tracking, cross-conversation correlation) that need a place
 * to land without another contract migration.
 */
export const LoopItemStateSchema = z.enum(["provisional", "open", "waiting", "resolved", "dismissed"]);
export type LoopItemState = z.infer<typeof LoopItemStateSchema>;

export const LoopPartySchema = z.object({
  label: z.string(),
});
export type LoopParty = z.infer<typeof LoopPartySchema>;

export const LoopEvidenceSchema = z.object({
  type: z.enum(["utterance", "fact", "todo"]),
  sourceId: z.string().nullable(),
  text: z.string(),
});
export type LoopEvidence = z.infer<typeof LoopEvidenceSchema>;

export const LoopSourceSchema = z.object({
  provider: z.string(),
  conversationId: z.string().nullable(),
  factId: z.string().nullable(),
  todoId: z.string().nullable(),
  utteranceIndexes: z.array(z.number().int().nonnegative()),
});
export type LoopSource = z.infer<typeof LoopSourceSchema>;

/**
 * A single detected, structured Loop item. Every field that identifies
 * *why* this item exists (`source`, `evidence`) is mandatory, not
 * optional, so a `LoopItem` can never be produced without an answer to
 * "why did CueNexa Loop think this was a commitment?" — see
 * docs/LOOP-DETECTION.md ("Provenance is mandatory").
 *
 * Departs from the sketch in the Phase 1A brief in one respect: `owner`/
 * `counterparties`/`dueAt` are `| null` and arrays default to `[]` rather
 * than being optional (`?:`) fields, matching this project's established
 * contracts convention (see packages/contracts) of always having a key
 * present with a possibly-null/empty value, rather than an absent key.
 */
export const LoopItemSchema = z.object({
  id: z.string().min(1),
  type: LoopItemTypeSchema,
  text: z.string().min(1),
  state: LoopItemStateSchema,
  /** Deterministic heuristic detection confidence, 0.0-1.0 — not an ML probability. See confidence.ts. */
  confidence: z.number().min(0).max(1),
  owner: LoopPartySchema.nullable(),
  counterparties: z.array(LoopPartySchema),
  dueAt: z.string().datetime().nullable(),
  /** The raw temporal phrase found in the source text, kept even when it couldn't be resolved to an absolute `dueAt`. */
  dueAtPhrase: z.string().nullable(),
  source: LoopSourceSchema,
  evidence: z.array(LoopEvidenceSchema).min(1),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type LoopItem = z.infer<typeof LoopItemSchema>;

/**
 * An unvalidated intermediate result from a detector, before
 * deduplication and confidence filtering turn it into a `LoopItem`. See
 * "Candidate vs Accepted Item" in docs/LOOP-DETECTION.md.
 */
export interface DetectionCandidate {
  type: LoopItemType;
  text: string;
  confidence: number;
  owner: LoopParty | null;
  counterparties: LoopParty[];
  dueAt: string | null;
  dueAtPhrase: string | null;
  source: LoopSource;
  evidence: LoopEvidence[];
}

/** Non-fatal issue encountered while detecting Loop items — mirrors NormalizationWarning's shape and role. */
export interface DetectionWarning {
  field: string;
  message: string;
}

/**
 * Shared reference context threaded through candidate building: the
 * instant detection is running at, and the IANA time zone calendar
 * phrases ("today", "tomorrow", weekday names) should be resolved
 * against. See docs/LOOP-DETECTION.md ("Timezone-aware deadline
 * resolution") for why this must not default to UTC.
 */
export interface DetectionContext {
  now: string;
  timeZone: string;
}
