import { createHash } from "node:crypto";
import { mkdirSync, chmodSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createStableMemberIdentity } from "@cuenexa-loop/loop-engine";
import type { Loop } from "@cuenexa-loop/loop-engine";
import type {
  LoopChangeEvent,
  LoopChangeEventType,
  LoopThread,
  LoopThreadUserState,
  LoopNotificationType,
  NotificationDelivery,
  NotificationDeliveryInput,
  ReconcileInput,
  ReconcileResult,
  UserStateMutationResult,
} from "./types.js";
import { parseIsoInstant } from "./time.js";

const SCHEMA_VERSION = 2;
const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;
const MIN_SHARED_MEMBERS = 2;
const MIN_OVERLAP_RATIO = 0.6;

interface ThreadRow {
  thread_id: string;
  state: "open" | "waiting" | "resolved";
  title: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  last_observed_at: string;
  resolved_at: string | null;
}

interface EventRow {
  event_id: string;
  thread_id: string;
  event_type: LoopChangeEventType;
  observed_at: string;
  details_json: string;
}

interface UserStateRow {
  thread_id: string;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  pinned: number;
  dismissed_at: string | null;
  updated_at: string;
}

interface NotificationDeliveryRow {
  notification_id: string;
  thread_id: string;
  notification_type: LoopNotificationType;
  trigger_key: string;
  delivered_at: string;
}

export interface LoopStoreOptions {
  /** `:memory:` is intended for tests only. */
  readonly path?: string;
  readonly retentionDays?: number;
}

export class LoopStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoopStoreError";
  }
}

/** Resolves the only supported persistent location, with an explicit testable override. */
export function resolveLoopStorePath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.CUENEXA_LOOP_DB_PATH;
  if (configured && configured.trim().length > 0) {
    return resolve(configured);
  }
  return join(homedir(), ".cuenexa-loop", "cuenexa-loop.sqlite");
}

export function resolveRetentionDays(environment: NodeJS.ProcessEnv = process.env): number {
  const value = environment.CUENEXA_LOOP_RETENTION_DAYS;
  if (!value) return DEFAULT_RETENTION_DAYS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_RETENTION_DAYS || parsed > MAX_RETENTION_DAYS) {
    throw new LoopStoreError(
      `CUENEXA_LOOP_RETENTION_DAYS must be an integer from ${MIN_RETENTION_DAYS} to ${MAX_RETENTION_DAYS}.`,
    );
  }
  return parsed;
}

/**
 * SQLite-backed local state. It never receives Bee records: only a Phase 1B
 * Loop's derived title/state/due date, snapshot id, and SHA-256 member ids.
 */
export class LoopStore {
  private readonly database: DatabaseSync;
  private readonly path: string;
  private readonly retentionDays: number;

  constructor(options: LoopStoreOptions = {}) {
    this.path = options.path ?? resolveLoopStorePath();
    this.retentionDays = options.retentionDays ?? resolveRetentionDays();
    preparePrivatePath(this.path);
    try {
      this.database = new DatabaseSync(this.path, { timeout: 5_000 });
      if (this.path !== ":memory:") {
        try {
          chmodSync(this.path, 0o600);
        } catch {
          // Best effort: platforms without POSIX permissions remain supported.
        }
      }
      this.database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      this.initialize();
    } catch (error) {
      throw new LoopStoreError(
        `Could not open CueNexa Loop local state. Preserve the database and repair or replace it manually. ${safeError(error)}`,
      );
    }
  }

  close(): void {
    this.database.close();
  }

  listThreads(): LoopThread[] {
    const rows = this.database
      .prepare("SELECT thread_id, state, title, due_at, created_at, updated_at, last_observed_at, resolved_at FROM loop_threads ORDER BY thread_id")
      .all() as unknown as ThreadRow[];
    return rows.map((row) => this.readThread(row));
  }

  getThread(threadId: string): LoopThread | null {
    const row = this.database
      .prepare("SELECT thread_id, state, title, due_at, created_at, updated_at, last_observed_at, resolved_at FROM loop_threads WHERE thread_id = ?")
      .get(threadId) as unknown as ThreadRow | undefined;
    return row ? this.readThread(row) : null;
  }

  listEvents(limit = 100): LoopChangeEvent[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = this.database
      .prepare("SELECT event_id, thread_id, event_type, observed_at, details_json FROM loop_events ORDER BY observed_at DESC, event_id DESC LIMIT ?")
      .all(boundedLimit) as unknown as EventRow[];
    return rows.map(eventFromRow);
  }

  getThreadUserState(threadId: string): LoopThreadUserState {
    this.requireThread(threadId);
    const row = this.database
      .prepare("SELECT thread_id, acknowledged_at, snoozed_until, pinned, dismissed_at, updated_at FROM loop_thread_user_state WHERE thread_id = ?")
      .get(threadId) as unknown as UserStateRow | undefined;
    return row ? userStateFromRow(row) : emptyUserState(threadId);
  }

  listThreadUserStates(): LoopThreadUserState[] {
    const rows = this.database
      .prepare("SELECT thread_id, acknowledged_at, snoozed_until, pinned, dismissed_at, updated_at FROM loop_thread_user_state ORDER BY thread_id")
      .all() as unknown as UserStateRow[];
    return rows.map(userStateFromRow);
  }

  listNotificationDeliveries(limit = 500): NotificationDelivery[] {
    const boundedLimit = Math.max(1, Math.min(5_000, Math.floor(limit)));
    const rows = this.database.prepare(`
      SELECT notification_id, thread_id, notification_type, trigger_key, delivered_at
      FROM loop_notification_deliveries
      ORDER BY delivered_at DESC, notification_id DESC
      LIMIT ?
    `).all(boundedLimit) as unknown as NotificationDeliveryRow[];
    return rows.map((row) => ({
      id: row.notification_id,
      threadId: row.thread_id,
      type: row.notification_type,
      triggerKey: row.trigger_key,
      deliveredAt: row.delivered_at,
    }));
  }

  recordNotificationDeliveries(inputs: readonly NotificationDeliveryInput[], deliveredAt: string): number {
    requireIsoInstant(deliveredAt, "notification delivery timestamp");
    let recorded = 0;
    this.transaction(() => {
      const statement = this.database.prepare(`
        INSERT OR IGNORE INTO loop_notification_deliveries
          (notification_id, thread_id, notification_type, trigger_key, delivered_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const input of [...inputs].sort((left, right) => left.id.localeCompare(right.id))) {
        this.requireThread(input.threadId);
        const result = statement.run(input.id, input.threadId, input.type, input.triggerKey, deliveredAt) as unknown as { changes: number };
        recorded += result.changes;
      }
    });
    return recorded;
  }

  acknowledgeThread(threadId: string, acknowledgedAt: string): UserStateMutationResult {
    requireIsoInstant(acknowledgedAt, "acknowledgement timestamp");
    return this.mutateUserState(threadId, acknowledgedAt, (current) => ({ ...current, acknowledgedAt }));
  }

  snoozeThread(threadId: string, snoozedUntil: string, now: string): UserStateMutationResult {
    const untilMs = requireIsoInstant(snoozedUntil, "snooze timestamp");
    const nowMs = requireIsoInstant(now, "current timestamp");
    const duration = untilMs - nowMs;
    if (duration < 60_000 || duration > 365 * 24 * 60 * 60 * 1000) {
      throw new LoopStoreError("Snooze must be between 1 minute and 365 days in the future.");
    }
    const normalizedUntil = new Date(untilMs).toISOString();
    return this.mutateUserState(threadId, now, (current) => ({ ...current, snoozedUntil: normalizedUntil }));
  }

  unsnoozeThread(threadId: string, updatedAt: string): UserStateMutationResult {
    requireIsoInstant(updatedAt, "update timestamp");
    return this.mutateUserState(threadId, updatedAt, (current) => ({ ...current, snoozedUntil: null }));
  }

  pinThread(threadId: string, updatedAt: string): UserStateMutationResult {
    requireIsoInstant(updatedAt, "update timestamp");
    return this.mutateUserState(threadId, updatedAt, (current) => ({ ...current, pinned: true }));
  }

  unpinThread(threadId: string, updatedAt: string): UserStateMutationResult {
    requireIsoInstant(updatedAt, "update timestamp");
    return this.mutateUserState(threadId, updatedAt, (current) => ({ ...current, pinned: false }));
  }

  dismissThread(threadId: string, dismissedAt: string): UserStateMutationResult {
    requireIsoInstant(dismissedAt, "dismissal timestamp");
    return this.mutateUserState(threadId, dismissedAt, (current) => ({ ...current, dismissedAt }));
  }

  restoreThread(threadId: string, updatedAt: string): UserStateMutationResult {
    requireIsoInstant(updatedAt, "update timestamp");
    return this.mutateUserState(threadId, updatedAt, (current) => ({ ...current, dismissedAt: null }));
  }

  /**
   * Atomically applies a processed Phase 1B snapshot. Re-running the same
   * snapshot is a no-op: it does not add events or change thread timestamps.
   */
  reconcile(input: ReconcileInput): ReconcileResult {
    const loops = [...input.loops].sort((left, right) => left.id.localeCompare(right.id));
    const events: LoopChangeEvent[] = [];
    const warnings: string[] = input.complete ? [] : ["Source snapshot is partial; absence is not used for reconciliation."];

    this.transaction(() => {
      // Expired resolved history must not be revived by the same sync.
      this.purgeResolvedInternal(input.observedAt);
      for (const loop of loops) {
        const result = this.reconcileLoop(loop, input.observedAt, events, warnings);
        void result;
      }
    });

    const threadIds = new Set<string>();
    for (const loop of loops) {
      const row = this.database.prepare("SELECT thread_id FROM loop_snapshot_loops WHERE snapshot_loop_id = ?").get(loop.id) as
        | { thread_id: string }
        | undefined;
      if (row) threadIds.add(row.thread_id);
    }
    const threads = [...threadIds]
      .map((threadId) => this.getThread(threadId))
      .filter((thread): thread is LoopThread => thread !== null)
      .sort((left, right) => left.id.localeCompare(right.id));
    return { threads, events, warnings, complete: input.complete };
  }

  /** Removes only resolved local records older than the bounded retention interval. */
  purgeResolved(now: string): number {
    let removed = 0;
    this.transaction(() => {
      removed = this.purgeResolvedInternal(now);
    });
    return removed;
  }

  private initialize(): void {
    const version = (this.database.prepare("PRAGMA user_version").get() as { user_version?: number }).user_version ?? 0;
    if (version > SCHEMA_VERSION) {
      throw new LoopStoreError("The local state database uses a newer unsupported schema version.");
    }
    if (version === 0) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS loop_threads (
            thread_id TEXT PRIMARY KEY,
            state TEXT NOT NULL CHECK (state IN ('open', 'waiting', 'resolved')),
            title TEXT,
            due_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_observed_at TEXT NOT NULL,
            resolved_at TEXT
          );
          CREATE TABLE IF NOT EXISTS loop_snapshot_loops (
            snapshot_loop_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
            first_observed_at TEXT NOT NULL,
            last_observed_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS loop_thread_members (
            thread_id TEXT NOT NULL REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
            member_identity TEXT NOT NULL,
            first_observed_at TEXT NOT NULL,
            last_observed_at TEXT NOT NULL,
            PRIMARY KEY (thread_id, member_identity)
          );
          CREATE TABLE IF NOT EXISTS loop_events (
            event_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            details_json TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS loop_events_thread_observed ON loop_events(thread_id, observed_at DESC);
          ${phaseThreeTablesSql()}
          PRAGMA user_version = ${SCHEMA_VERSION};
        `);
      });
    } else if (version === 1) {
      this.transaction(() => {
        this.database.exec(`${phaseThreeTablesSql()} PRAGMA user_version = ${SCHEMA_VERSION};`);
      });
    }
  }

  private mutateUserState(
    threadId: string,
    updatedAt: string,
    mutation: (current: LoopThreadUserState) => LoopThreadUserState,
  ): UserStateMutationResult {
    let result: UserStateMutationResult | undefined;
    this.transaction(() => {
      this.requireThread(threadId);
      const current = this.readUserState(threadId);
      const next = mutation(current);
      const changed =
        current.acknowledgedAt !== next.acknowledgedAt ||
        current.snoozedUntil !== next.snoozedUntil ||
        current.pinned !== next.pinned ||
        current.dismissedAt !== next.dismissedAt;
      if (changed) {
        this.database.prepare(`
          INSERT INTO loop_thread_user_state
            (thread_id, acknowledged_at, snoozed_until, pinned, dismissed_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(thread_id) DO UPDATE SET
            acknowledged_at = excluded.acknowledged_at,
            snoozed_until = excluded.snoozed_until,
            pinned = excluded.pinned,
            dismissed_at = excluded.dismissed_at,
            updated_at = excluded.updated_at
        `).run(threadId, next.acknowledgedAt, next.snoozedUntil, next.pinned ? 1 : 0, next.dismissedAt, updatedAt);
      }
      result = { changed, state: changed ? { ...next, updatedAt } : current };
    });
    if (!result) throw new LoopStoreError("Local user-state update did not complete.");
    return result;
  }

  private readUserState(threadId: string): LoopThreadUserState {
    const row = this.database
      .prepare("SELECT thread_id, acknowledged_at, snoozed_until, pinned, dismissed_at, updated_at FROM loop_thread_user_state WHERE thread_id = ?")
      .get(threadId) as unknown as UserStateRow | undefined;
    return row ? userStateFromRow(row) : emptyUserState(threadId);
  }

  private requireThread(threadId: string): void {
    const found = this.database.prepare("SELECT 1 AS found FROM loop_threads WHERE thread_id = ?").get(threadId);
    if (!found) throw new LoopStoreError("Unknown local Loop thread ID.");
  }

  private reconcileLoop(loop: Loop, observedAt: string, events: LoopChangeEvent[], warnings: string[]): string {
    const memberIdentities = loop.members.map((member) => createStableMemberIdentity(member.item)).sort();
    const mapped = this.database.prepare("SELECT thread_id FROM loop_snapshot_loops WHERE snapshot_loop_id = ?").get(loop.id) as
      | { thread_id: string }
      | undefined;
    const matchedThreadId = mapped?.thread_id ?? this.matchByMembers(memberIdentities, warnings, loop.id);
    const threadId = matchedThreadId ?? createThreadId(loop.id);
    const existing = this.getThread(threadId);
    const dueAt = deriveLoopDueAt(loop);

    if (!existing) {
      this.database
        .prepare("INSERT INTO loop_threads (thread_id, state, title, due_at, created_at, updated_at, last_observed_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(threadId, loop.state, loop.title, dueAt, observedAt, observedAt, observedAt, loop.state === "resolved" ? observedAt : null);
      this.addSnapshotLoop(loop.id, threadId, observedAt);
      for (const identity of memberIdentities) this.addMember(threadId, identity, observedAt);
      this.addEvent(events, threadId, "thread_created", observedAt, { snapshotLoopId: loop.id, state: loop.state, dueAt });
      if (loop.state === "resolved") this.addEvent(events, threadId, "resolved", observedAt, { state: "resolved" });
      return threadId;
    }

    const isNewSnapshot = !mapped;
    if (isNewSnapshot) this.addSnapshotLoop(loop.id, threadId, observedAt);
    const priorMembers = new Set(existing.memberIdentities);
    const addedMembers = memberIdentities.filter((identity) => !priorMembers.has(identity));
    for (const identity of memberIdentities) this.addMember(threadId, identity, observedAt);

    const changed =
      isNewSnapshot || addedMembers.length > 0 || existing.state !== loop.state || existing.dueAt !== dueAt || existing.title !== loop.title;
    if (!changed) return threadId;

    if (existing.state !== loop.state) {
      this.addEvent(events, threadId, "state_changed", observedAt, { from: existing.state, to: loop.state });
      if (existing.state === "resolved" && loop.state !== "resolved") {
        this.addEvent(events, threadId, "reopened", observedAt, { from: "resolved", to: loop.state });
      }
      if (loop.state === "resolved") this.addEvent(events, threadId, "resolved", observedAt, { state: "resolved" });
    }
    if (existing.dueAt !== dueAt) this.addEvent(events, threadId, "due_date_changed", observedAt, { from: existing.dueAt, to: dueAt });
    for (const identity of addedMembers) this.addEvent(events, threadId, "member_added", observedAt, { memberIdentity: identity });
    if (isNewSnapshot) this.addEvent(events, threadId, "new_activity", observedAt, { snapshotLoopId: loop.id });

    this.database
      .prepare("UPDATE loop_threads SET state = ?, title = ?, due_at = ?, updated_at = ?, last_observed_at = ?, resolved_at = ? WHERE thread_id = ?")
      .run(loop.state, loop.title, dueAt, observedAt, observedAt, loop.state === "resolved" ? observedAt : null, threadId);
    return threadId;
  }

  private matchByMembers(memberIdentities: readonly string[], warnings: string[], snapshotLoopId: string): string | null {
    const candidates = this.database
      .prepare("SELECT thread_id FROM loop_threads WHERE state IN ('open', 'waiting', 'resolved') ORDER BY thread_id")
      .all() as unknown as Array<{ thread_id: string }>;
    const scored = candidates
      .map(({ thread_id }) => {
        const identities = new Set(this.memberIdentities(thread_id));
        const shared = memberIdentities.filter((identity) => identities.has(identity)).length;
        return { threadId: thread_id, shared, ratio: shared / memberIdentities.length };
      })
      .filter((candidate) => candidate.shared >= MIN_SHARED_MEMBERS && candidate.ratio >= MIN_OVERLAP_RATIO)
      .sort((left, right) => right.ratio - left.ratio || right.shared - left.shared || left.threadId.localeCompare(right.threadId));
    if (scored.length === 0) return null;
    const winner = scored[0];
    if (!winner) return null;
    const tied = scored.filter((candidate) => candidate.ratio === winner.ratio && candidate.shared === winner.shared);
    if (tied.length > 1) {
      warnings.push(`Ambiguous member overlap for snapshot Loop ${snapshotLoopId}; created a separate local thread.`);
      return null;
    }
    return winner.threadId;
  }

  private addSnapshotLoop(snapshotLoopId: string, threadId: string, observedAt: string): void {
    this.database
      .prepare("INSERT INTO loop_snapshot_loops (snapshot_loop_id, thread_id, first_observed_at, last_observed_at) VALUES (?, ?, ?, ?)")
      .run(snapshotLoopId, threadId, observedAt, observedAt);
  }

  private addMember(threadId: string, memberIdentity: string, observedAt: string): void {
    this.database
      .prepare("INSERT OR IGNORE INTO loop_thread_members (thread_id, member_identity, first_observed_at, last_observed_at) VALUES (?, ?, ?, ?)")
      .run(threadId, memberIdentity, observedAt, observedAt);
  }

  private addEvent(
    events: LoopChangeEvent[],
    threadId: string,
    type: LoopChangeEventType,
    observedAt: string,
    details: Record<string, string | null>,
  ): void {
    const detailsJson = stableJson(details);
    const eventId = `event_${digest(`${threadId}:${type}:${observedAt}:${detailsJson}`).slice(0, 24)}`;
    const result = this.database
      .prepare("INSERT OR IGNORE INTO loop_events (event_id, thread_id, event_type, observed_at, details_json) VALUES (?, ?, ?, ?, ?)")
      .run(eventId, threadId, type, observedAt, detailsJson) as unknown as { changes: number };
    if (result.changes > 0) events.push({ id: eventId, threadId, type, observedAt, details });
  }

  private memberIdentities(threadId: string): string[] {
    const rows = this.database
      .prepare("SELECT member_identity FROM loop_thread_members WHERE thread_id = ? ORDER BY member_identity")
      .all(threadId) as unknown as Array<{ member_identity: string }>;
    return rows.map((row) => row.member_identity);
  }

  private readThread(row: ThreadRow): LoopThread {
    const snapshotRows = this.database
      .prepare("SELECT snapshot_loop_id FROM loop_snapshot_loops WHERE thread_id = ? ORDER BY snapshot_loop_id")
      .all(row.thread_id) as unknown as Array<{ snapshot_loop_id: string }>;
    return {
      id: row.thread_id,
      state: row.state,
      title: row.title,
      dueAt: row.due_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastObservedAt: row.last_observed_at,
      resolvedAt: row.resolved_at,
      memberIdentities: this.memberIdentities(row.thread_id),
      snapshotLoopIds: snapshotRows.map((entry) => entry.snapshot_loop_id),
    };
  }

  private purgeResolvedInternal(now: string): number {
    const cutoff = new Date(new Date(now).getTime() - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.database
      .prepare("DELETE FROM loop_threads WHERE state = 'resolved' AND resolved_at IS NOT NULL AND resolved_at < ?")
      .run(cutoff) as unknown as { changes: number };
    return result.changes;
  }

  private transaction(callback: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      callback();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

export function resetLoopStore(path = resolveLoopStorePath()): boolean {
  if (path === ":memory:") return false;
  if (!existsSync(path)) return false;
  rmSync(path);
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  return true;
}

function phaseThreeTablesSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS loop_thread_user_state (
      thread_id TEXT PRIMARY KEY REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
      acknowledged_at TEXT,
      snoozed_until TEXT,
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
      dismissed_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loop_notification_deliveries (
      notification_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
      notification_type TEXT NOT NULL,
      trigger_key TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      UNIQUE (thread_id, notification_type, trigger_key)
    );
    CREATE INDEX IF NOT EXISTS loop_notification_thread_delivered
      ON loop_notification_deliveries(thread_id, delivered_at DESC);
  `;
}

function emptyUserState(threadId: string): LoopThreadUserState {
  return {
    threadId,
    acknowledgedAt: null,
    snoozedUntil: null,
    pinned: false,
    dismissedAt: null,
    updatedAt: null,
  };
}

function userStateFromRow(row: UserStateRow): LoopThreadUserState {
  return {
    threadId: row.thread_id,
    acknowledgedAt: row.acknowledged_at,
    snoozedUntil: row.snoozed_until,
    pinned: row.pinned === 1,
    dismissedAt: row.dismissed_at,
    updatedAt: row.updated_at,
  };
}

function requireIsoInstant(value: string, label: string): number {
  const parsed = parseIsoInstant(value);
  if (parsed === null) {
    throw new LoopStoreError(`Invalid ${label}; expected a real absolute ISO-8601 UTC timestamp.`);
  }
  return parsed;
}

function preparePrivatePath(path: string): void {
  if (path === ":memory:") return;
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    chmodSync(directory, 0o700);
  } catch {
    // Best effort: platforms without POSIX permissions remain supported.
  }
}

function createThreadId(snapshotLoopId: string): string {
  return `thread_${digest(`snapshot:${snapshotLoopId}`).slice(0, 24)}`;
}

function deriveLoopDueAt(loop: Loop): string | null {
  const dueDates = loop.members.map((member) => member.item.dueAt).filter((dueAt): dueAt is string => dueAt !== null).sort();
  return dueDates[0] ?? null;
}

function eventFromRow(row: EventRow): LoopChangeEvent {
  return {
    id: row.event_id,
    threadId: row.thread_id,
    type: row.event_type,
    observedAt: row.observed_at,
    details: JSON.parse(row.details_json) as Record<string, string | null>,
  };
}

function stableJson(details: Record<string, string | null>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(details).sort(([left], [right]) => left.localeCompare(right))));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, " ") : "Unknown local database error.";
}
