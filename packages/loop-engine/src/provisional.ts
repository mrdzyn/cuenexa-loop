import { createHash } from "node:crypto";
import type { EphemeralRealtimeUtterance } from "@cuenexa-loop/contracts";
import { extractDeadline } from "./deadline.js";
import { detectCommitment } from "./detectors/commitment.js";
import { detectDelegation } from "./detectors/delegation.js";
import { detectFollowUp } from "./detectors/follow-up.js";
import { splitSentences } from "./text-utils.js";
import type { ProvisionalIngestResult, ProvisionalSignal, ProvisionalSignalType } from "./provisional-types.js";

export const PROVISIONAL_BUFFER_LIMIT = 128;
export const PROVISIONAL_EVENT_DEDUPE_LIMIT = 512;
export const PROVISIONAL_TTL_MS = 10 * 60 * 1_000;

const TYPE_ORDER: readonly ProvisionalSignalType[] = [
  "possible_commitment",
  "possible_follow_up",
  "possible_delegation",
  "possible_deadline",
];
const ACTIONABLE_DEADLINE_CONTEXT = /\b(?:i(?:'ll|\s+will|\s+can)|please|can\s+you|could\s+you|will\s+(?:send|review|prepare|finish|complete|deliver)|send|review|prepare|finish|complete|deliver|follow\s+up|check\s+(?:back|in|with))\b/i;

export interface ProvisionalAwarenessOptions {
  readonly maxUtterances?: number;
  readonly dedupeLimit?: number;
  readonly ttlMs?: number;
}

/** Stateful only for one foreground process; it has no I/O or persistence dependency. */
export class ProvisionalAwareness {
  private readonly groups = new Map<string, Map<ProvisionalSignalType, ProvisionalSignal>>();
  private readonly seenEventIds = new Set<string>();
  private readonly eventOrder: string[] = [];
  private readonly maxUtterances: number;
  private readonly dedupeLimit: number;
  private readonly ttlMs: number;

  constructor(options: ProvisionalAwarenessOptions = {}) {
    this.maxUtterances = bounded(options.maxUtterances, PROVISIONAL_BUFFER_LIMIT, 1, 512);
    this.dedupeLimit = bounded(options.dedupeLimit, PROVISIONAL_EVENT_DEDUPE_LIMIT, 1, 2_048);
    this.ttlMs = bounded(options.ttlMs, PROVISIONAL_TTL_MS, 1_000, 60 * 60 * 1_000);
  }

  ingest(event: EphemeralRealtimeUtterance, timeZone: string): ProvisionalIngestResult {
    this.pruneExpired(event.observedAt);
    if (this.seenEventIds.has(event.id)) return { emitted: [], active: this.list() };
    this.rememberEvent(event.id);

    const key = sourceKey(event);
    const previous = this.groups.get(key) ?? new Map<ProvisionalSignalType, ProvisionalSignal>();
    const next = detectSignals(event, key, timeZone, this.ttlMs);
    const emitted = next.filter((signal) => !previous.has(signal.type));

    // Identifiable fragments/final corrections replace their utterance slot.
    this.groups.delete(key);
    if (next.length > 0) this.groups.set(key, new Map(next.map((signal) => [signal.type, signal])));
    while (this.groups.size > this.maxUtterances) {
      const oldest = this.groups.keys().next().value as string | undefined;
      if (!oldest) break;
      this.groups.delete(oldest);
    }
    return { emitted: sortSignals(emitted), active: this.list() };
  }

  list(): ProvisionalSignal[] {
    return sortSignals([...this.groups.values()].flatMap((signals) => [...signals.values()]));
  }

  pruneExpired(now: string): number {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) return 0;
    let removed = 0;
    for (const [key, signals] of this.groups) {
      if ([...signals.values()].every((signal) => Date.parse(signal.expiresAt) <= nowMs)) {
        removed += signals.size;
        this.groups.delete(key);
      }
    }
    return removed;
  }

  retireConversations(conversationIds: ReadonlySet<string>): number {
    let removed = 0;
    for (const [key, signals] of this.groups) {
      const first = signals.values().next().value as ProvisionalSignal | undefined;
      if (first?.conversationId && conversationIds.has(first.conversationId)) {
        removed += signals.size;
        this.groups.delete(key);
      }
    }
    return removed;
  }

  /** Applies only an explicit provider-observed session/authoritative-ID pair. */
  resolveConversationIdentity(sessionId: string, conversationId: string): number {
    let updated = 0;
    for (const signals of this.groups.values()) {
      for (const [type, signal] of signals) {
        if (signal.sessionId === sessionId && signal.conversationId === null) {
          signals.set(type, { ...signal, conversationId });
          updated += 1;
        }
      }
    }
    return updated;
  }

  private rememberEvent(id: string): void {
    this.seenEventIds.add(id);
    this.eventOrder.push(id);
    if (this.eventOrder.length > this.dedupeLimit) {
      const expired = this.eventOrder.shift();
      if (expired) this.seenEventIds.delete(expired);
    }
  }
}

function detectSignals(
  event: EphemeralRealtimeUtterance,
  key: string,
  timeZone: string,
  ttlMs: number,
): ProvisionalSignal[] {
  const found = new Map<ProvisionalSignalType, "strong" | "tentative">();
  for (const sentence of splitSentences(event.text)) {
    if (detectCommitment(sentence)) found.set("possible_commitment", "strong");
    const followUp = detectFollowUp(sentence);
    if (followUp) found.set("possible_follow_up", followUp.confidence >= 0.8 ? "strong" : "tentative");
    if (detectDelegation(sentence)) found.set("possible_delegation", "strong");
    if (ACTIONABLE_DEADLINE_CONTEXT.test(sentence) && extractDeadline(sentence, event.observedAt, timeZone)) {
      found.set("possible_deadline", "tentative");
    }
  }
  const expiresAt = new Date(Date.parse(event.observedAt) + ttlMs).toISOString();
  return TYPE_ORDER.filter((type) => found.has(type)).map((type) => ({
    id: stableSignalId(key, type),
    type,
    observedAt: event.observedAt,
    expiresAt,
    sessionId: event.sessionId,
    conversationId: event.conversationId,
    confidence: found.get(type)!,
    sourceEventIds: [event.id],
    ephemeralText: event.text,
  }));
}

function sourceKey(event: EphemeralRealtimeUtterance): string {
  // Realtime UUID is stable across the explicit later numeric-ID upgrade.
  return [event.provider, event.sessionId ?? event.conversationId ?? "unknown", event.utteranceId ?? event.id].join(":");
}

function stableSignalId(key: string, type: ProvisionalSignalType): string {
  return `provisional_${createHash("sha256").update(`${key}\u0000${type}`).digest("hex").slice(0, 24)}`;
}

function sortSignals(signals: ProvisionalSignal[]): ProvisionalSignal[] {
  return signals.sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt)
    || TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type)
    || left.id.localeCompare(right.id));
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Number.isInteger(value) ? Math.max(minimum, Math.min(maximum, value!)) : fallback;
}
