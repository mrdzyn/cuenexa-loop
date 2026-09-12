import { ATTENTION_PRIORITY, rankAttention } from "./attention.js";
import type {
  AttentionReasonCode,
  LoopChangeEvent,
  LoopThread,
  LoopThreadUserState,
  ReviewItem,
  ReviewModel,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECENTLY_RESOLVED_DAYS = 7;

const REVIEWABLE_EVENT_BY_REASON: Partial<Record<AttentionReasonCode, LoopChangeEvent["type"]>> = {
  newly_created: "thread_created",
  new_activity: "new_activity",
  new_member: "member_added",
  reopened: "reopened",
};

const MEANINGFUL_EVENT_TYPES = new Set<LoopChangeEvent["type"]>([
  "thread_created", "member_added", "state_changed", "due_date_changed", "reopened", "new_activity",
]);

/** Combines source state, attention, and local preferences without mutating any layer. */
export function buildReviewModel(
  threads: readonly LoopThread[],
  events: readonly LoopChangeEvent[],
  userStates: readonly LoopThreadUserState[],
  now: string,
): ReviewModel {
  const nowMs = Date.parse(now);
  const states = new Map(userStates.map((state) => [state.threadId, state]));
  const baseAttention = new Map(rankAttention(threads, events, now).map((item) => [item.thread.id, item]));
  const dueNow: ReviewItem[] = [];
  const needsAttention: ReviewItem[] = [];
  const waiting: ReviewItem[] = [];
  const snoozed: ReviewItem[] = [];
  const recentlyResolved: ReviewItem[] = [];

  for (const thread of [...threads].sort((left, right) => left.id.localeCompare(right.id))) {
    const userState = states.get(thread.id) ?? emptyState(thread.id);
    let reasonCodes = [...(baseAttention.get(thread.id)?.reasonCodes ?? [])];
    reasonCodes = reasonCodes.filter((reason) => !isAcknowledgedReason(thread.id, reason, userState.acknowledgedAt, events));
    if (userState.pinned && thread.state !== "resolved") reasonCodes.push("pinned");
    reasonCodes = [...new Set(reasonCodes)].sort(compareReasons);
    const firstReason = reasonCodes[0];
    const item: ReviewItem = {
      thread,
      userState,
      priority: firstReason ? ATTENTION_PRIORITY[firstReason] : 0,
      reasonCodes,
    };

    if (thread.state === "resolved") {
      if (thread.resolvedAt && nowMs - Date.parse(thread.resolvedAt) <= RECENTLY_RESOLVED_DAYS * DAY_MS) recentlyResolved.push(item);
      continue;
    }
    if (userState.snoozedUntil && Date.parse(userState.snoozedUntil) > nowMs) {
      snoozed.push(item);
      continue;
    }
    const urgent = reasonCodes.includes("overdue_open") || reasonCodes.includes("due_within_24h");
    const hasNewerActivity = hasMeaningfulEventAfter(thread.id, userState.dismissedAt, events);
    if (userState.dismissedAt && !urgent && !userState.pinned && !hasNewerActivity) continue;
    if (urgent) dueNow.push(item);
    else if (thread.state === "waiting") waiting.push(item);
    else if (reasonCodes.length > 0) needsAttention.push(item);
  }

  for (const section of [dueNow, needsAttention, waiting, snoozed, recentlyResolved]) section.sort(compareReviewItems);
  return { generatedAt: now, dueNow, needsAttention, waiting, snoozed, recentlyResolved };
}

function isAcknowledgedReason(
  threadId: string,
  reason: AttentionReasonCode,
  acknowledgedAt: string | null,
  events: readonly LoopChangeEvent[],
): boolean {
  const eventType = REVIEWABLE_EVENT_BY_REASON[reason];
  if (!acknowledgedAt || !eventType) return false;
  return !events.some(
    (event) => event.threadId === threadId && event.type === eventType && Date.parse(event.observedAt) > Date.parse(acknowledgedAt),
  );
}

function hasMeaningfulEventAfter(threadId: string, dismissedAt: string | null, events: readonly LoopChangeEvent[]): boolean {
  if (!dismissedAt) return false;
  const dismissedMs = Date.parse(dismissedAt);
  return events.some(
    (event) => event.threadId === threadId && MEANINGFUL_EVENT_TYPES.has(event.type) && Date.parse(event.observedAt) > dismissedMs,
  );
}

function compareReasons(left: AttentionReasonCode, right: AttentionReasonCode): number {
  return ATTENTION_PRIORITY[right] - ATTENTION_PRIORITY[left] || left.localeCompare(right);
}

function compareReviewItems(left: ReviewItem, right: ReviewItem): number {
  return right.priority - left.priority || left.thread.id.localeCompare(right.thread.id);
}

function emptyState(threadId: string): LoopThreadUserState {
  return { threadId, acknowledgedAt: null, snoozedUntil: null, pinned: false, dismissedAt: null, updatedAt: null };
}
