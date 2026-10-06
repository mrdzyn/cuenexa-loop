export const IPC_CHANNELS = {
  getStatus: "cuenexa:get-status",
  sync: "cuenexa:sync",
  getReview: "cuenexa:get-review",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const PRELOAD_API_METHODS = ["getStatus", "sync", "getReview"] as const;

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

export interface CueNexaPreloadApi {
  getStatus(): Promise<ConnectionStatusDto>;
  sync(): Promise<ReviewSnapshotDto>;
  getReview(): Promise<ReviewSnapshotDto>;
}

export const SANITIZED_ERROR_MESSAGES: Record<AppErrorCode, string> = {
  bee_unavailable: "Bee CLI is not available.",
  unauthenticated: "Bee is not authenticated. Run bee login.",
  sync_failed: "Authoritative sync failed.",
};
