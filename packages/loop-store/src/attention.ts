import type { AttentionItem, AttentionReasonCode, LoopChangeEvent, LoopThread } from "./types.js";

export const ATTENTION_PRIORITY = {
  overdue_open: 100,
  due_within_24h: 90,
  reopened: 80,
  new_activity: 70,
  new_member: 65,
  newly_created: 60,
  due_within_3d: 50,
  stale_open: 40,
  waiting_too_long: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_OPEN_DAYS = 7;
const WAITING_DAYS = 14;

/** Pure, deterministic local ranking. It never mutates Loop state. */
export function rankAttention(threads: readonly LoopThread[], events: readonly LoopChangeEvent[], now: string): AttentionItem[] {
  const nowMs = new Date(now).getTime();
  const recentEvents = new Map<string, Set<LoopChangeEvent["type"]>>();
  for (const event of events) {
    if (nowMs - new Date(event.observedAt).getTime() <= DAY_MS) {
      const kinds = recentEvents.get(event.threadId) ?? new Set<LoopChangeEvent["type"]>();
      kinds.add(event.type);
      recentEvents.set(event.threadId, kinds);
    }
  }
  return threads
    .filter((thread) => thread.state !== "resolved")
    .map((thread) => {
      const reasons = new Set<AttentionReasonCode>();
      const dueMs = thread.dueAt ? new Date(thread.dueAt).getTime() : null;
      const ageMs = nowMs - new Date(thread.lastObservedAt).getTime();
      if (thread.state === "open" && dueMs !== null && dueMs < nowMs) reasons.add("overdue_open");
      else if (dueMs !== null && dueMs - nowMs <= DAY_MS) reasons.add("due_within_24h");
      else if (dueMs !== null && dueMs - nowMs <= 3 * DAY_MS) reasons.add("due_within_3d");
      const kinds = recentEvents.get(thread.id) ?? new Set<LoopChangeEvent["type"]>();
      if (kinds.has("reopened")) reasons.add("reopened");
      if (kinds.has("new_activity")) reasons.add("new_activity");
      if (kinds.has("member_added")) reasons.add("new_member");
      if (kinds.has("thread_created")) reasons.add("newly_created");
      if (thread.state === "open" && ageMs >= STALE_OPEN_DAYS * DAY_MS) reasons.add("stale_open");
      if (thread.state === "waiting" && ageMs >= WAITING_DAYS * DAY_MS) reasons.add("waiting_too_long");
      const reasonCodes = [...reasons].sort((left, right) => ATTENTION_PRIORITY[right] - ATTENTION_PRIORITY[left] || left.localeCompare(right));
      return { thread, priority: reasonCodes.length === 0 ? 0 : ATTENTION_PRIORITY[reasonCodes[0]], reasonCodes };
    })
    .filter((item) => item.reasonCodes.length > 0)
    .sort((left, right) => right.priority - left.priority || left.thread.id.localeCompare(right.thread.id));
}
