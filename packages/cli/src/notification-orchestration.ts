import { planNotifications, type LoopStore, type NotificationPlan } from "@cuenexa-loop/loop-store";

export function loadNotificationPlan(store: LoopStore, now: string): NotificationPlan {
  const plan = planNotifications(store.listThreads(), store.listEvents(500), store.listThreadUserStates(), [], now);
  return {
    ...plan,
    candidates: plan.candidates.filter(
      (candidate) => !store.hasNotificationDelivery(candidate.thread.id, candidate.type, candidate.triggerKey),
    ),
  };
}
