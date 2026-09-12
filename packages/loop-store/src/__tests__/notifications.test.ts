import { describe, expect, it } from "vitest";
import { planNotifications } from "../notifications.js";
import type { LoopChangeEvent, LoopThread, LoopThreadUserState, NotificationDelivery } from "../types.js";

const NOW = "2026-07-01T12:00:00.000Z";

function thread(id: string, dueAt: string | null = null, state: LoopThread["state"] = "open"): LoopThread {
  return {
    id, state, title: "Synthetic", dueAt, createdAt: NOW, updatedAt: NOW, lastObservedAt: NOW,
    resolvedAt: state === "resolved" ? NOW : null, memberIdentities: ["member_a", "member_b"], snapshotLoopIds: ["loop_a"],
  };
}

function event(threadId: string, type: LoopChangeEvent["type"], observedAt = "2026-07-01T11:00:00.000Z"): LoopChangeEvent {
  return { id: `event_${threadId}_${type}_${observedAt}`, threadId, type, observedAt, details: {} };
}

function state(threadId: string, overrides: Partial<LoopThreadUserState> = {}): LoopThreadUserState {
  return { threadId, acknowledgedAt: null, snoozedUntil: null, pinned: false, dismissedAt: null, updatedAt: null, ...overrides };
}

describe("planNotifications", () => {
  it("plans only the supported meaningful triggers in fixed priority order", () => {
    const overdue = thread("overdue", "2026-07-01T10:00:00.000Z");
    const due = thread("due", "2026-07-02T12:00:00.000Z");
    const reopened = thread("reopened"); const activity = thread("activity");
    const plan = planNotifications(
      [activity, due, reopened, overdue], [event("reopened", "reopened"), event("activity", "new_activity")], [], [], NOW,
    );
    expect(plan.candidates.map((candidate) => candidate.type)).toEqual([
      "overdue", "due_within_24h", "reopened", "new_activity",
    ]);
  });

  it("respects acknowledgement, snooze, dismissal, pin, and resolved lifecycle", () => {
    const acknowledged = thread("acknowledged"); const sleeping = thread("sleeping", "2026-07-01T10:00:00.000Z");
    const dismissed = thread("dismissed"); const pinned = thread("pinned");
    const urgent = thread("urgent", "2026-07-01T13:00:00.000Z"); const resolved = thread("resolved", "2026-07-01T13:00:00.000Z", "resolved");
    const plan = planNotifications(
      [acknowledged, sleeping, dismissed, pinned, urgent, resolved],
      [event("acknowledged", "new_activity"), event("dismissed", "new_activity"), event("pinned", "new_activity")],
      [
        state("acknowledged", { acknowledgedAt: NOW }),
        state("sleeping", { snoozedUntil: "2026-07-01T13:00:00.000Z", pinned: true }),
        state("dismissed", { dismissedAt: NOW }),
        state("pinned", { dismissedAt: NOW, pinned: true }),
        state("urgent", { dismissedAt: NOW }),
      ], [], NOW,
    );
    expect(plan.candidates.map((candidate) => `${candidate.thread.id}:${candidate.type}`)).toEqual([
      "urgent:due_within_24h", "pinned:new_activity",
    ]);
  });

  it("allows new activity after acknowledgement or dismissal", () => {
    const candidate = thread("candidate");
    const plan = planNotifications(
      [candidate], [event("candidate", "new_activity", "2026-07-01T11:30:00.000Z")],
      [state("candidate", { acknowledgedAt: "2026-07-01T11:00:00.000Z", dismissedAt: "2026-07-01T11:00:00.000Z" })], [], NOW,
    );
    expect(plan.candidates.map((entry) => entry.type)).toEqual(["new_activity"]);
  });

  it("deduplicates exact triggers while due changes and due-to-overdue transitions remain eligible", () => {
    const due = thread("due", "2026-07-01T13:00:00.000Z");
    const first = planNotifications([due], [], [], [], NOW);
    const delivery: NotificationDelivery = {
      id: first.candidates[0]!.id, threadId: "due", type: "due_within_24h",
      triggerKey: first.candidates[0]!.triggerKey, deliveredAt: NOW,
    };
    expect(planNotifications([due], [], [], [delivery], NOW).candidates).toEqual([]);
    expect(planNotifications([thread("due", "2026-07-01T14:00:00.000Z")], [], [], [delivery], NOW).candidates).toHaveLength(1);
    expect(planNotifications([due], [], [], [delivery], "2026-07-01T14:00:00.000Z").candidates[0]?.type).toBe("overdue");
  });

  it("does not duplicate a source event candidate and uses stable thread ordering for ties", () => {
    const a = thread("a"); const b = thread("b"); const duplicated = event("a", "new_activity");
    const plan = planNotifications([b, a], [duplicated, duplicated, event("b", "new_activity")], [], [], NOW);
    expect(plan.candidates.map((candidate) => candidate.thread.id)).toEqual(["a", "b"]);
  });
});
