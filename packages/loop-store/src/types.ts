import type { LoopState } from "@cuenexa-loop/loop-engine";

export type PersistentLoopState = LoopState;

export type LoopChangeEventType =
  | "thread_created"
  | "member_added"
  | "state_changed"
  | "due_date_changed"
  | "reopened"
  | "resolved"
  | "new_activity";

/**
 * A local thread is deliberately distinct from the snapshot-local Phase 1B
 * Loop id. It contains only derived structural state and hashed member ids.
 */
export interface LoopThread {
  readonly id: string;
  readonly state: PersistentLoopState;
  /** Derived deterministic title only; never source text or evidence. */
  readonly title: string | null;
  /** Normalized ISO due instant only; natural-language due phrases are never stored. */
  readonly dueAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastObservedAt: string;
  readonly resolvedAt: string | null;
  readonly memberIdentities: readonly string[];
  readonly snapshotLoopIds: readonly string[];
}

export interface LoopChangeEvent {
  readonly id: string;
  readonly threadId: string;
  readonly type: LoopChangeEventType;
  readonly observedAt: string;
  /** Structural, content-free details (states, normalized dates, hashes, snapshot ids). */
  readonly details: Readonly<Record<string, string | null>>;
}

/** Local preference state; never changes the source-derived Loop lifecycle. */
export interface LoopThreadUserState {
  readonly threadId: string;
  readonly acknowledgedAt: string | null;
  readonly snoozedUntil: string | null;
  readonly pinned: boolean;
  readonly dismissedAt: string | null;
  readonly updatedAt: string | null;
}

export interface UserStateMutationResult {
  readonly changed: boolean;
  readonly state: LoopThreadUserState;
}

export interface ReconcileInput {
  readonly loops: readonly import("@cuenexa-loop/loop-engine").Loop[];
  readonly observedAt: string;
  /** False means the source may be incomplete; absence is never used to resolve. */
  readonly complete: boolean;
}

export interface ReconcileResult {
  readonly threads: readonly LoopThread[];
  readonly events: readonly LoopChangeEvent[];
  readonly warnings: readonly string[];
  readonly complete: boolean;
}

export interface AttentionItem {
  readonly thread: LoopThread;
  readonly priority: number;
  readonly reasonCodes: readonly AttentionReasonCode[];
}

export type AttentionReasonCode =
  | "overdue_open"
  | "due_within_24h"
  | "reopened"
  | "new_activity"
  | "new_member"
  | "newly_created"
  | "due_within_3d"
  | "stale_open"
  | "waiting_too_long";
