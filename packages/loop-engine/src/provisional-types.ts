export type ProvisionalSignalType =
  | "possible_commitment"
  | "possible_follow_up"
  | "possible_delegation"
  | "possible_deadline";

/**
 * Memory-only awareness. This is deliberately not a LoopItem, Loop, or
 * LoopThread and must never be passed to persistent reconciliation.
 */
export interface ProvisionalSignal {
  readonly id: string;
  readonly type: ProvisionalSignalType;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly sessionId: string | null;
  readonly conversationId: string | null;
  readonly confidence: "strong" | "tentative";
  readonly sourceEventIds: readonly string[];
  /** Raw ephemeral source text, memory-only and opt-in-rendered through previewText(). */
  readonly ephemeralText: string;
}

export interface ProvisionalIngestResult {
  /** Newly surfaced signal types only; fragment corrections update state without re-alerting. */
  readonly emitted: readonly ProvisionalSignal[];
  readonly active: readonly ProvisionalSignal[];
}
