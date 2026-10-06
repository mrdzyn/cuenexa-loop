import type { ReviewItem, ReviewModel } from "@cuenexa-loop/loop-store";
import type { LoopCardDto, ReviewSection, ReviewSnapshotDto } from "../shared/ipc-contract.js";

const ALLOWED_CARD_KEYS = [
  "id",
  "title",
  "state",
  "dueAt",
  "section",
  "attentionReasons",
  "memberCount",
  "pinned",
  "snoozedUntil",
  "lastObservedAt",
] as const;

export function toLoopCardDto(item: ReviewItem, section: ReviewSection): LoopCardDto {
  return {
    id: item.thread.id,
    title: item.thread.title,
    state: item.thread.state,
    dueAt: item.thread.dueAt,
    section,
    attentionReasons: [...item.reasonCodes],
    memberCount: item.thread.memberIdentities.length,
    pinned: item.userState.pinned,
    snoozedUntil: item.userState.snoozedUntil,
    lastObservedAt: item.thread.lastObservedAt,
  };
}

export function toReviewSnapshotDto(input: {
  readonly review: ReviewModel;
  readonly complete: boolean;
  readonly timeZone: string;
  readonly changeCount: number;
}): ReviewSnapshotDto {
  return {
    generatedAt: input.review.generatedAt,
    complete: input.complete,
    timeZone: input.timeZone,
    changeCount: input.changeCount,
    sections: {
      dueNow: input.review.dueNow.map((item) => toLoopCardDto(item, "dueNow")),
      needsAttention: input.review.needsAttention.map((item) => toLoopCardDto(item, "needsAttention")),
      waiting: input.review.waiting.map((item) => toLoopCardDto(item, "waiting")),
      snoozed: input.review.snoozed.map((item) => toLoopCardDto(item, "snoozed")),
      recentlyResolved: input.review.recentlyResolved.map((item) => toLoopCardDto(item, "recentlyResolved")),
    },
    errorCode: null,
    errorMessage: null,
  };
}

export function emptyReviewSnapshot(now: string, timeZone: string): ReviewSnapshotDto {
  return {
    generatedAt: now,
    complete: false,
    timeZone,
    changeCount: 0,
    sections: {
      dueNow: [],
      needsAttention: [],
      waiting: [],
      snoozed: [],
      recentlyResolved: [],
    },
    errorCode: null,
    errorMessage: null,
  };
}

export function assertCardIsSanitized(card: LoopCardDto): void {
  const keys = Object.keys(card);
  for (const key of keys) {
    if (!ALLOWED_CARD_KEYS.includes(key as (typeof ALLOWED_CARD_KEYS)[number])) {
      throw new Error(`Unexpected renderer DTO key: ${key}`);
    }
  }
}

const PROHIBITED_DTO_SUBSTRINGS = [
  "transcript",
  "utterance",
  "evidence",
  "summary",
  "latitude",
  "longitude",
  "conversation_uuid",
  "realtime",
];

export function dtoContainsProhibitedContent(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();
  return PROHIBITED_DTO_SUBSTRINGS.some((token) => serialized.includes(token));
}
