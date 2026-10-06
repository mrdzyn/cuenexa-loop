export const IPC_CHANNELS = {
  getStatus: "cuenexa:get-status",
  sync: "cuenexa:sync",
  getReview: "cuenexa:get-review",
  startRealtime: "cuenexa:start-realtime",
  stopRealtime: "cuenexa:stop-realtime",
  getProvisional: "cuenexa:get-provisional",
  provisionalUpdated: "cuenexa:provisional-updated",
} as const;

export const IPC_INVOKE_CHANNELS = [
  IPC_CHANNELS.getStatus,
  IPC_CHANNELS.sync,
  IPC_CHANNELS.getReview,
  IPC_CHANNELS.startRealtime,
  IPC_CHANNELS.stopRealtime,
  IPC_CHANNELS.getProvisional,
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const PRELOAD_API_METHODS = [
  "getStatus",
  "sync",
  "getReview",
  "startRealtime",
  "stopRealtime",
  "getProvisional",
  "onProvisionalUpdate",
] as const;

export type PreloadApiMethod = (typeof PRELOAD_API_METHODS)[number];

export type AppErrorCode = "bee_unavailable" | "unauthenticated" | "sync_failed";

export type ReviewSection = "dueNow" | "needsAttention" | "waiting" | "snoozed" | "recentlyResolved";

export interface ConnectionStatusDto {
  readonly beeAvailable: boolean;
  readonly authenticated: boolean;
  readonly timeZone: string | null;
  readonly lastSyncedAt: string | null;
  readonly complete: boolean | null;
  readonly errorCode: AppErrorCode | null;
  readonly errorMessage: string | null;
}

export interface LoopCardDto {
  readonly id: string;
  readonly title: string | null;
  readonly state: "open" | "waiting" | "resolved";
  readonly dueAt: string | null;
  readonly section: ReviewSection;
  readonly attentionReasons: readonly string[];
  readonly memberCount: number;
  readonly pinned: boolean;
  readonly snoozedUntil: string | null;
  readonly lastObservedAt: string;
}

export interface ReviewSnapshotDto {
  readonly generatedAt: string;
  readonly complete: boolean;
  readonly timeZone: string;
  readonly changeCount: number;
  readonly sections: {
    readonly dueNow: readonly LoopCardDto[];
    readonly needsAttention: readonly LoopCardDto[];
    readonly waiting: readonly LoopCardDto[];
    readonly snoozed: readonly LoopCardDto[];
    readonly recentlyResolved: readonly LoopCardDto[];
  };
  readonly errorCode: AppErrorCode | null;
  readonly errorMessage: string | null;
}

export type ProvisionalHealth = "off" | "connecting" | "active" | "disconnected";

export interface ProvisionalSignalDto {
  readonly id: string;
  readonly kind: string;
  readonly observedAt: string;
  readonly state: "active";
  readonly label: "PROVISIONAL";
  readonly confidence: "strong" | "tentative";
}

export interface ProvisionalSnapshotDto {
  readonly health: ProvisionalHealth;
  readonly warningCode: string | null;
  readonly warningMessage: string | null;
  readonly signals: readonly ProvisionalSignalDto[];
}

export interface CueNexaPreloadApi {
  getStatus(): Promise<ConnectionStatusDto>;
  sync(): Promise<ReviewSnapshotDto>;
  getReview(): Promise<ReviewSnapshotDto>;
  startRealtime(): Promise<ProvisionalSnapshotDto>;
  stopRealtime(): Promise<ProvisionalSnapshotDto>;
  getProvisional(): Promise<ProvisionalSnapshotDto>;
  onProvisionalUpdate(listener: (snapshot: ProvisionalSnapshotDto) => void): () => void;
}

export const SANITIZED_ERROR_MESSAGES: Record<AppErrorCode, string> = {
  bee_unavailable: "Bee CLI is not available.",
  unauthenticated: "Bee is not authenticated. Run bee login.",
  sync_failed: "Authoritative sync failed.",
};
