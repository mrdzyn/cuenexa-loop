import { createHash } from "node:crypto";
import type {
  LoopChangeEvent,
  LoopNotificationType,
  LoopThread,
  LoopThreadUserState,
  NotificationDelivery,
  NotificationPlan,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EVENT_MS = DAY_MS;
const TYPE_PRIORITY: Record<LoopNotificationType, number> = {
  overdue: 100,
  due_within_24h: 90,
  reopened: 80,
  new_activity: 70,
};

/** Pure local notification planning. Delivery and deduplication persistence stay outside. */
export function planNotifications(
  threads: readonly LoopThread[],
  events: readonly LoopChangeEvent[],
  userStates: readonly LoopThreadUserState[],
  deliveries: readonly NotificationDelivery[],
  now: string,
): NotificationPlan {
  const nowMs = Date.parse(now);
  const states = new Map(userStates.map((state) => [state.threadId, state]));
  const delivered = new Set(deliveries.map((entry) => deliveryIdentity(entry.threadId, entry.type, entry.triggerKey)));
  const candidates: NotificationPlan["candidates"][number][] = [];

  for (const thread of threads) {
    if (thread.state === "resolved") continue;
    const userState = states.get(thread.id) ?? emptyState(thread.id);
    if (userState.snoozedUntil && Date.parse(userState.snoozedUntil) > nowMs) continue;

    const dueMs = thread.dueAt ? Date.parse(thread.dueAt) : null;
    if (dueMs !== null) {
      if (thread.state === "open" && dueMs < nowMs) addCandidate(candidates, delivered, thread, "overdue", `due:${thread.dueAt}`);
      else if (dueMs - nowMs <= DAY_MS) addCandidate(candidates, delivered, thread, "due_within_24h", `due:${thread.dueAt}`);
    }

    for (const event of events) {
      const eventMs = Date.parse(event.observedAt);
      if (event.threadId !== thread.id || eventMs > nowMs || nowMs - eventMs > RECENT_EVENT_MS) continue;
      const type = event.type === "reopened" ? "reopened" : event.type === "new_activity" ? "new_activity" : null;
      if (!type) continue;
      if (userState.acknowledgedAt && Date.parse(event.observedAt) <= Date.parse(userState.acknowledgedAt)) continue;
      if (userState.dismissedAt && Date.parse(event.observedAt) <= Date.parse(userState.dismissedAt) && !userState.pinned) continue;
      addCandidate(candidates, delivered, thread, type, `event:${event.id}`);
    }
  }
  candidates.sort(
    (left, right) => TYPE_PRIORITY[right.type] - TYPE_PRIORITY[left.type] || left.thread.id.localeCompare(right.thread.id) || left.id.localeCompare(right.id),
  );
  return { generatedAt: now, candidates };
}

function addCandidate(
  candidates: NotificationPlan["candidates"][number][],
  delivered: Set<string>,
  thread: LoopThread,
  type: LoopNotificationType,
  triggerKey: string,
): void {
  if (delivered.has(deliveryIdentity(thread.id, type, triggerKey))) return;
  const id = `notification_${digest(deliveryIdentity(thread.id, type, triggerKey)).slice(0, 24)}`;
  if (candidates.some((candidate) => candidate.id === id)) return;
  candidates.push({ id, thread, type, triggerKey });
}

function deliveryIdentity(threadId: string, type: LoopNotificationType, triggerKey: string): string {
  return `${threadId}:${type}:${triggerKey}`;
}

function emptyState(threadId: string): LoopThreadUserState {
  return { threadId, acknowledgedAt: null, snoozedUntil: null, pinned: false, dismissedAt: null, updatedAt: null };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
