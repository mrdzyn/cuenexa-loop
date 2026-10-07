import {
  BeeAdapterClient,
  BeeAuthenticationError,
  BeeCliUnavailableError,
  fetchCompleteDetectionSnapshot,
  type BeeRealtimeSubscribeOptions,
  type BeeRealtimeSubscription,
  type BeeRealtimeWarning,
  type CompleteDetectionSnapshot,
} from "@cuenexa-loop/bee-adapter";
import type { EphemeralRealtimeEvent } from "@cuenexa-loop/contracts";
import { correlateLoopItems, detectLoopItems, ProvisionalAwareness } from "@cuenexa-loop/loop-engine";
import type { LoopCorrelationResult, LoopDetectionInput, LoopDetectionResult } from "@cuenexa-loop/loop-engine";
import { LoopStore, buildReviewModel } from "@cuenexa-loop/loop-store";
import {
  SANITIZED_ERROR_MESSAGES,
  type AppErrorCode,
  type ConnectionStatusDto,
  type ProvisionalSnapshotDto,
  type ReviewSnapshotDto,
} from "../shared/ipc-contract.js";
import { emptyProvisionalSnapshot, emptyReviewSnapshot, toProvisionalSnapshotDto, toReviewSnapshotDto } from "./dto.js";
import { resolveHostTimeZone } from "./timezone.js";

export type SnapshotFetcher = (
  client: BeeAdapterClient,
) => Promise<CompleteDetectionSnapshot>;

export type DetectFn = (input: LoopDetectionInput) => LoopDetectionResult;
export type CorrelateFn = (input: Parameters<typeof correlateLoopItems>[0]) => LoopCorrelationResult;
export type SubscribeRealtimeFn = (options?: BeeRealtimeSubscribeOptions) => BeeRealtimeSubscription;

export interface CueNexaServiceDependencies {
  readonly client: BeeAdapterClient;
  readonly store: LoopStore;
  readonly fetchSnapshot?: SnapshotFetcher;
  readonly detect?: DetectFn;
  readonly correlate?: CorrelateFn;
  readonly subscribeRealtime?: SubscribeRealtimeFn;
  readonly awareness?: ProvisionalAwareness;
  readonly onProvisionalChange?: (snapshot: ProvisionalSnapshotDto) => void;
  readonly now?: () => string;
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly cancelSchedule?: (handle: unknown) => void;
  readonly env?: NodeJS.ProcessEnv;
  readonly systemTimeZone?: () => string;
}

export class CueNexaService {
  private readonly client: BeeAdapterClient;
  private readonly store: LoopStore;
  private readonly fetchSnapshot: SnapshotFetcher;
  private readonly detect: DetectFn;
  private readonly correlate: CorrelateFn;
  private readonly subscribeRealtimeFn: SubscribeRealtimeFn;
  private readonly injectedAwareness: boolean;
  private readonly onProvisionalChange?: (snapshot: ProvisionalSnapshotDto) => void;
  private readonly now: () => string;
  private readonly schedule: (callback: () => void, delayMs: number) => unknown;
  private readonly cancelSchedule: (handle: unknown) => void;
  private readonly env: NodeJS.ProcessEnv;
  private readonly systemTimeZone: () => string;
  private lastSnapshot: ReviewSnapshotDto | null = null;
  private lastTimeZone: string | null = null;
  private lastComplete: boolean | null = null;
  private lastSyncedAt: string | null = null;
  private lastError: { code: AppErrorCode; message: string } | null = null;
  private pipelineCalls: string[] = [];
  private awareness: ProvisionalAwareness;
  private subscription: BeeRealtimeSubscription | null = null;
  private pumpGeneration = 0;
  private realtimeStarting = false;
  private expiryTimer: unknown = null;
  private provisionalHealth: ProvisionalSnapshotDto["health"] = "off";
  private provisionalWarning: BeeRealtimeWarning | null = null;

  constructor(dependencies: CueNexaServiceDependencies) {
    this.client = dependencies.client;
    this.store = dependencies.store;
    this.fetchSnapshot = dependencies.fetchSnapshot ?? fetchCompleteDetectionSnapshot;
    this.detect = dependencies.detect ?? detectLoopItems;
    this.correlate = dependencies.correlate ?? correlateLoopItems;
    this.subscribeRealtimeFn = dependencies.subscribeRealtime ?? ((options) => this.client.subscribeRealtime(options));
    this.injectedAwareness = Boolean(dependencies.awareness);
    this.awareness = dependencies.awareness ?? new ProvisionalAwareness();
    this.onProvisionalChange = dependencies.onProvisionalChange;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.schedule = dependencies.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelSchedule = dependencies.cancelSchedule ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
    this.env = dependencies.env ?? process.env;
    this.systemTimeZone = dependencies.systemTimeZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  getPipelineCalls(): readonly string[] {
    return this.pipelineCalls;
  }

  async getStatus(): Promise<ConnectionStatusDto> {
    try {
      const auth = await this.client.ensureAuthenticated();
      const timeZone = resolveHostTimeZone({
        beeTimeZone: auth.timeZone,
        env: this.env,
        systemTimeZone: this.systemTimeZone,
      });
      this.lastTimeZone = timeZone;
      this.lastError = null;
      return this.statusDto({
        beeAvailable: true,
        authenticated: true,
        timeZone,
        errorCode: null,
        errorMessage: null,
      });
    } catch (error) {
      return this.statusFromError(error);
    }
  }

  async sync(): Promise<ReviewSnapshotDto> {
    this.pipelineCalls = [];
    const now = this.now();
    try {
      this.pipelineCalls.push("ensureAuthenticated");
      const auth = await this.client.ensureAuthenticated();
      const timeZone = resolveHostTimeZone({
        beeTimeZone: auth.timeZone,
        env: this.env,
        systemTimeZone: this.systemTimeZone,
      });
      this.pipelineCalls.push("fetchCompleteDetectionSnapshot");
      const completeSnapshot = await this.fetchSnapshot(this.client);
      this.pipelineCalls.push("detectLoopItems");
      const detection = this.detect({
        conversations: completeSnapshot.snapshot.conversations,
        facts: completeSnapshot.snapshot.facts,
        todos: completeSnapshot.snapshot.todos,
        now,
        timeZone,
      });
      const completeness =
        completeSnapshot.snapshot.warnings.length > 0 || detection.warnings.length > 0 ? "partial" : "complete";
      this.pipelineCalls.push("correlateLoopItems");
      const correlation = this.correlate({
        items: detection.items,
        conversations: completeSnapshot.snapshot.conversations,
        facts: completeSnapshot.snapshot.facts,
        todos: completeSnapshot.snapshot.todos,
        now,
        snapshot: { observedAt: now, completeness },
      });
      const complete = completeSnapshot.complete && correlation.snapshot.completeness === "complete";
      this.pipelineCalls.push("reconcile");
      const reconcile = this.store.reconcile({
        loops: correlation.loops,
        observedAt: now,
        complete,
      });
      this.pipelineCalls.push("buildReviewModel");
      const review = buildReviewModel(
        this.store.listThreads(),
        this.store.listEvents(),
        this.store.listThreadUserStates(),
        now,
      );
      const snapshot = toReviewSnapshotDto({
        review,
        complete,
        timeZone,
        changeCount: reconcile.events.length,
      });
      this.lastSnapshot = snapshot;
      this.lastTimeZone = timeZone;
      this.lastComplete = complete;
      this.lastSyncedAt = now;
      this.lastError = null;
      const detectedIds = new Set(
        detection.items
          .map((item) => item.source.conversationId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      this.awareness.retireConversations(detectedIds);
      this.awareness.pruneExpired(now);
      this.emitProvisional();
      return snapshot;
    } catch (error) {
      const mapped = classifyHostError(error);
      this.lastError = mapped;
      this.lastComplete = false;
      const degraded = this.degradedReview(now, mapped);
      this.lastSnapshot = degraded;
      return degraded;
    }
  }

  getReview(): ReviewSnapshotDto {
    if (this.lastError) {
      return this.degradedReview(this.now(), this.lastError);
    }
    if (this.lastSnapshot) {
      return this.lastSnapshot;
    }
    return emptyReviewSnapshot(this.now(), this.lastTimeZone ?? this.systemTimeZone());
  }

  async startRealtime(): Promise<ProvisionalSnapshotDto> {
    if (this.subscription || this.realtimeStarting) {
      return this.getProvisional();
    }
    this.realtimeStarting = true;
    const generation = ++this.pumpGeneration;
    this.provisionalHealth = "connecting";
    this.provisionalWarning = null;
    if (!this.injectedAwareness) {
      this.awareness = new ProvisionalAwareness();
    }
    this.emitProvisional();
    try {
      const auth = await this.client.ensureAuthenticated();
      if (generation !== this.pumpGeneration) {
        return this.getProvisional();
      }
      const timeZone = resolveHostTimeZone({
        beeTimeZone: auth.timeZone,
        env: this.env,
        systemTimeZone: this.systemTimeZone,
      });
      this.lastTimeZone = timeZone;
      const subscription = this.subscribeRealtimeFn({
        now: this.now,
        onWarning: (warning) => {
          if (generation !== this.pumpGeneration) return;
          this.provisionalWarning = warning;
          this.emitProvisional();
        },
      });
      if (generation !== this.pumpGeneration) {
        subscription.close();
        return this.getProvisional();
      }
      this.subscription = subscription;
      this.realtimeStarting = false;
      this.provisionalHealth = "active";
      this.emitProvisional();
      void this.pumpRealtime(generation, timeZone, subscription);
      return this.getProvisional();
    } catch {
      if (generation !== this.pumpGeneration) {
        return this.getProvisional();
      }
      this.realtimeStarting = false;
      this.provisionalHealth = "disconnected";
      this.subscription = null;
      this.emitProvisional();
      return this.getProvisional();
    }
  }

  stopRealtime(): ProvisionalSnapshotDto {
    this.realtimeStarting = false;
    this.closeSubscription();
    this.clearExpiryTimer();
    this.provisionalHealth = "off";
    this.provisionalWarning = null;
    if (!this.injectedAwareness) {
      this.awareness = new ProvisionalAwareness();
    }
    this.emitProvisional();
    return this.getProvisional();
  }

  getProvisional(): ProvisionalSnapshotDto {
    this.awareness.pruneExpired(this.now());
    return toProvisionalSnapshotDto({
      health: this.provisionalHealth,
      warningCode: this.provisionalWarning?.code ?? null,
      warningMessage: this.provisionalWarning?.message ?? null,
      signals: this.awareness.list(),
    });
  }

  shutdown(): void {
    this.stopRealtime();
  }

  private async pumpRealtime(
    generation: number,
    timeZone: string,
    subscription: BeeRealtimeSubscription,
  ): Promise<void> {
    try {
      for await (const event of subscription.events) {
        if (generation !== this.pumpGeneration) return;
        this.handleRealtimeEvent(event, timeZone);
      }
      this.terminateCurrentStream(generation, subscription);
    } catch {
      this.terminateCurrentStream(generation, subscription);
    }
  }

  private terminateCurrentStream(generation: number, subscription: BeeRealtimeSubscription): void {
    if (generation !== this.pumpGeneration) return;
    if (this.subscription !== subscription) return;
    subscription.close();
    this.subscription = null;
    this.realtimeStarting = false;
    this.provisionalHealth = "disconnected";
    this.emitProvisional();
  }

  private handleRealtimeEvent(event: EphemeralRealtimeEvent, timeZone: string): void {
    if (event.kind === "conversation_state") {
      if (event.sessionId && event.conversationId) {
        this.awareness.resolveConversationIdentity(event.sessionId, event.conversationId);
      }
      this.emitProvisional();
      return;
    }
    this.awareness.ingest(event, timeZone);
    this.emitProvisional();
  }

  private closeSubscription(): void {
    this.pumpGeneration += 1;
    this.subscription?.close();
    this.subscription = null;
    this.realtimeStarting = false;
  }

  private emitProvisional(): void {
    this.onProvisionalChange?.(this.getProvisional());
    this.scheduleExpiry();
  }

  private scheduleExpiry(): void {
    this.clearExpiryTimer();
    if (this.provisionalHealth === "off") return;
    const signals = this.awareness.list();
    if (signals.length === 0) return;
    const nowMs = Date.parse(this.now());
    if (!Number.isFinite(nowMs)) return;
    let earliest = Number.POSITIVE_INFINITY;
    for (const signal of signals) {
      const expiresAt = Date.parse(signal.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt < earliest) earliest = expiresAt;
    }
    if (!Number.isFinite(earliest)) return;
    const delayMs = Math.max(0, earliest - nowMs);
    const generation = this.pumpGeneration;
    this.expiryTimer = this.schedule(() => {
      if (generation !== this.pumpGeneration) return;
      this.expiryTimer = null;
      const removed = this.awareness.pruneExpired(this.now());
      if (removed > 0) {
        this.emitProvisional();
        return;
      }
      this.scheduleExpiry();
    }, delayMs);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer === null) return;
    this.cancelSchedule(this.expiryTimer);
    this.expiryTimer = null;
  }

  private degradedReview(
    now: string,
    error: { code: AppErrorCode; message: string },
  ): ReviewSnapshotDto {
    const timeZone = this.lastTimeZone ?? this.systemTimeZone();
    const previous = this.lastSnapshot ?? emptyReviewSnapshot(now, timeZone);
    return {
      ...previous,
      generatedAt: now,
      complete: false,
      changeCount: 0,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  private statusDto(partial: {
    beeAvailable: boolean;
    authenticated: boolean;
    timeZone: string | null;
    errorCode: AppErrorCode | null;
    errorMessage: string | null;
  }): ConnectionStatusDto {
    return {
      beeAvailable: partial.beeAvailable,
      authenticated: partial.authenticated,
      timeZone: partial.timeZone,
      lastSyncedAt: this.lastSyncedAt,
      complete: this.lastComplete,
      errorCode: partial.errorCode,
      errorMessage: partial.errorMessage,
    };
  }

  private statusFromError(error: unknown): ConnectionStatusDto {
    const mapped = classifyHostError(error);
    this.lastError = mapped;
    return this.statusDto({
      beeAvailable: mapped.code !== "bee_unavailable",
      authenticated: false,
      timeZone: this.lastTimeZone,
      errorCode: mapped.code,
      errorMessage: mapped.message,
    });
  }
}

export function classifyHostError(error: unknown): { code: AppErrorCode; message: string } {
  if (error instanceof BeeCliUnavailableError) {
    return { code: "bee_unavailable", message: SANITIZED_ERROR_MESSAGES.bee_unavailable };
  }
  if (error instanceof BeeAuthenticationError) {
    return { code: "unauthenticated", message: SANITIZED_ERROR_MESSAGES.unauthenticated };
  }
  return { code: "sync_failed", message: SANITIZED_ERROR_MESSAGES.sync_failed };
}

export function resolveElectronStorePath(options: {
  readonly userDataPath: string;
  readonly env?: NodeJS.ProcessEnv;
}): string {
  const override = options.env?.CUENEXA_LOOP_ELECTRON_DB_PATH?.trim();
  if (override) {
    return override;
  }
  return `${options.userDataPath.replace(/\/$/, "")}/cuenexa-loop-electron-reference.sqlite`;
}
