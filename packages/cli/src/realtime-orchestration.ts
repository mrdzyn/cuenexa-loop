import type { EphemeralRealtimeEvent } from "@cuenexa-loop/contracts";
import {
  ProvisionalAwareness,
  type ProvisionalIngestResult,
  type ProvisionalSignal,
} from "@cuenexa-loop/loop-engine";
import type { AuthoritativeSyncResult } from "./persistent-orchestration.js";

export const REALTIME_IDLE_REFRESH_MS = 30_000;
export const REALTIME_MIN_REFRESH_INTERVAL_MS = 60_000;

export type AuthoritativeRefreshTrigger = "conversation_processed" | "idle" | "realtime_gap" | "manual";

export interface AuthoritativeRefreshOutcome {
  readonly attempted: boolean;
  readonly trigger: AuthoritativeRefreshTrigger;
  readonly result: AuthoritativeSyncResult | null;
}

export type AuthoritativeRefresh = (now: string) => Promise<AuthoritativeSyncResult>;

/**
 * Coordinates ephemeral observations with, but never converts them into,
 * authoritative history. The injected refresh is the only persistence-capable
 * boundary and must call syncPersistentLoopsWithDetails().
 */
export class RealtimeHandoffCoordinator {
  private lastActivityAt: string | null = null;
  private activityRevision = 0;
  private refreshedRevision = 0;
  private lastRefreshAttemptMs: number | null = null;
  private refreshInFlight = false;

  constructor(
    private readonly awareness: ProvisionalAwareness,
    private readonly authoritativeRefresh: AuthoritativeRefresh,
    lastAuthoritativeRefreshAt: string | null = null,
  ) {
    const parsed = lastAuthoritativeRefreshAt === null ? NaN : Date.parse(lastAuthoritativeRefreshAt);
    this.lastRefreshAttemptMs = Number.isFinite(parsed) ? parsed : null;
  }

  observe(event: EphemeralRealtimeEvent, timeZone: string): ProvisionalIngestResult {
    if (event.kind !== "utterance") return { emitted: [], active: this.awareness.list() };
    this.lastActivityAt = event.observedAt;
    this.activityRevision += 1;
    return this.awareness.ingest(event, timeZone);
  }

  signals(): readonly ProvisionalSignal[] {
    return this.awareness.list();
  }

  expire(now: string): number {
    return this.awareness.pruneExpired(now);
  }

  idleRefreshDue(now: string): boolean {
    if (!this.lastActivityAt || this.activityRevision <= this.refreshedRevision) return false;
    return Date.parse(now) - Date.parse(this.lastActivityAt) >= REALTIME_IDLE_REFRESH_MS
      && this.rateLimitAllows(now);
  }

  async refresh(trigger: AuthoritativeRefreshTrigger, now: string): Promise<AuthoritativeRefreshOutcome> {
    if (this.refreshInFlight || !this.rateLimitAllows(now)) return { attempted: false, trigger, result: null };
    this.refreshInFlight = true;
    this.lastRefreshAttemptMs = Date.parse(now);
    try {
      const result = await this.authoritativeRefresh(now);
      this.refreshedRevision = this.activityRevision;
      this.awareness.retireConversations(result.detectedConversationIds);
      return { attempted: true, trigger, result };
    } finally {
      this.refreshInFlight = false;
    }
  }

  private rateLimitAllows(now: string): boolean {
    const nowMs = Date.parse(now);
    return Number.isFinite(nowMs)
      && (this.lastRefreshAttemptMs === null || nowMs - this.lastRefreshAttemptMs >= REALTIME_MIN_REFRESH_INTERVAL_MS);
  }
}
