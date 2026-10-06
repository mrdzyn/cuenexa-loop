import {
  BeeAdapterClient,
  BeeAuthenticationError,
  BeeCliUnavailableError,
  fetchCompleteDetectionSnapshot,
  type CompleteDetectionSnapshot,
} from "@cuenexa-loop/bee-adapter";
import { correlateLoopItems, detectLoopItems } from "@cuenexa-loop/loop-engine";
import type { LoopCorrelationResult, LoopDetectionInput, LoopDetectionResult } from "@cuenexa-loop/loop-engine";
import { LoopStore, buildReviewModel } from "@cuenexa-loop/loop-store";
import {
  SANITIZED_ERROR_MESSAGES,
  type AppErrorCode,
  type ConnectionStatusDto,
  type ReviewSnapshotDto,
} from "../shared/ipc-contract.js";
import { emptyReviewSnapshot, toReviewSnapshotDto } from "./dto.js";
import { resolveHostTimeZone } from "./timezone.js";

export type SnapshotFetcher = (
  client: BeeAdapterClient,
) => Promise<CompleteDetectionSnapshot>;

export type DetectFn = (input: LoopDetectionInput) => LoopDetectionResult;
export type CorrelateFn = (input: Parameters<typeof correlateLoopItems>[0]) => LoopCorrelationResult;

export interface CueNexaServiceDependencies {
  readonly client: BeeAdapterClient;
  readonly store: LoopStore;
  readonly fetchSnapshot?: SnapshotFetcher;
  readonly detect?: DetectFn;
  readonly correlate?: CorrelateFn;
  readonly now?: () => string;
  readonly env?: NodeJS.ProcessEnv;
  readonly systemTimeZone?: () => string;
}

export class CueNexaService {
  private readonly client: BeeAdapterClient;
  private readonly store: LoopStore;
  private readonly fetchSnapshot: SnapshotFetcher;
  private readonly detect: DetectFn;
  private readonly correlate: CorrelateFn;
  private readonly now: () => string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly systemTimeZone: () => string;
  private lastSnapshot: ReviewSnapshotDto | null = null;
  private lastTimeZone: string | null = null;
  private lastComplete: boolean | null = null;
  private lastSyncedAt: string | null = null;
  private lastError: { code: AppErrorCode; message: string } | null = null;
  private pipelineCalls: string[] = [];

  constructor(dependencies: CueNexaServiceDependencies) {
    this.client = dependencies.client;
    this.store = dependencies.store;
    this.fetchSnapshot = dependencies.fetchSnapshot ?? fetchCompleteDetectionSnapshot;
    this.detect = dependencies.detect ?? detectLoopItems;
    this.correlate = dependencies.correlate ?? correlateLoopItems;
    this.now = dependencies.now ?? (() => new Date().toISOString());
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
      return snapshot;
    } catch (error) {
      const mapped = classifyHostError(error);
      this.lastError = mapped;
      const timeZone = this.lastTimeZone ?? this.systemTimeZone();
      return {
        ...emptyReviewSnapshot(now, timeZone),
        errorCode: mapped.code,
        errorMessage: mapped.message,
      };
    }
  }

  getReview(): ReviewSnapshotDto {
    if (this.lastSnapshot) {
      return this.lastSnapshot;
    }
    const timeZone = this.lastTimeZone ?? this.systemTimeZone();
    const snapshot = emptyReviewSnapshot(this.now(), timeZone);
    if (this.lastError) {
      return { ...snapshot, errorCode: this.lastError.code, errorMessage: this.lastError.message };
    }
    return snapshot;
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
