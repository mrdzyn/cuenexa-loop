import { planNotifications, type LoopStore, type NotificationPlan } from "@cuenexa-loop/loop-store";

export function loadNotificationPlan(store: LoopStore, now: string): NotificationPlan {
  return planNotifications(
    store.listThreads(), store.listEvents(500), store.listThreadUserStates(), store.listNotificationDeliveries(5_000), now,
  );
}
