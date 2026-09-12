import { describe, expect, it } from "vitest";
import { buildReviewModel } from "../review.js";
import type { LoopChangeEvent, LoopThread, LoopThreadUserState } from "../types.js";

const NOW = "2026-06-10T12:00:00.000Z";

function thread(id: string, state: LoopThread["state"] = "open", dueAt: string | null = null): LoopThread {
  return {
    id, state, title: "Synthetic", dueAt,
    createdAt: "2026-06-10T10:00:00.000Z", updatedAt: "2026-06-10T10:00:00.000Z",
    lastObservedAt: "2026-06-10T10:00:00.000Z", resolvedAt: state === "resolved" ? "2026-06-09T12:00:00.000Z" : null,
    memberIdentities: ["member_a", "member_b"], snapshotLoopIds: ["loop_a"],
  };
}

function event(threadId: string, type: LoopChangeEvent["type"], observedAt = "2026-06-10T10:00:00.000Z"): LoopChangeEvent {
  return { id: `event_${threadId}_${type}_${observedAt}`, threadId, type, observedAt, details: {} };
}

function state(threadId: string, overrides: Partial<LoopThreadUserState> = {}): LoopThreadUserState {
  return { threadId, acknowledgedAt: null, snoozedUntil: null, pinned: false, dismissedAt: null, updatedAt: null, ...overrides };
}

describe("buildReviewModel", () => {
  it("acknowledgement suppresses reviewed activity but never deadline reasons", () => {
    const due = thread("due", "open", "2026-06-10T18:00:00.000Z");
    const model = buildReviewModel(
      [due], [event("due", "thread_created"), event("due", "new_activity")],
      [state("due", { acknowledgedAt: "2026-06-10T11:00:00.000Z" })], NOW,
    );
    expect(model.dueNow[0]?.reasonCodes).toContain("due_within_24h");
    expect(model.dueNow[0]?.reasonCodes).not.toContain("newly_created");
    expect(model.dueNow[0]?.reasonCodes).not.toContain("new_activity");
  });

  it("new structural activity after acknowledgement becomes visible again", () => {
    const candidate = thread("candidate");
    const model = buildReviewModel(
      [candidate], [event("candidate", "new_activity", "2026-06-10T11:30:00.000Z")],
      [state("candidate", { acknowledgedAt: "2026-06-10T11:00:00.000Z" })], NOW,
    );
    expect(model.needsAttention[0]?.reasonCodes).toContain("new_activity");
  });

  it("active snooze overrides pin while an expired snooze becomes eligible", () => {
    const sleeping = thread("sleeping"); const awake = thread("awake");
    const model = buildReviewModel(
      [sleeping, awake], [],
      [
        state("sleeping", { pinned: true, snoozedUntil: "2026-06-10T13:00:00.000Z" }),
        state("awake", { pinned: true, snoozedUntil: "2026-06-10T11:00:00.000Z" }),
      ], NOW,
    );
    expect(model.snoozed.map((item) => item.thread.id)).toEqual(["sleeping"]);
    expect(model.needsAttention.map((item) => item.thread.id)).toEqual(["awake"]);
    expect(model.snoozed[0]?.reasonCodes).toContain("pinned");
  });

  it("dismissal hides unchanged non-urgent activity, while newer activity, urgent due, and pin bypass it", () => {
    const hidden = thread("hidden"); const changed = thread("changed");
    const urgent = thread("urgent", "open", "2026-06-10T13:00:00.000Z"); const pinned = thread("pinned");
    const dismissedAt = "2026-06-10T11:00:00.000Z";
    const model = buildReviewModel(
      [hidden, changed, urgent, pinned],
      [
        event("hidden", "new_activity", "2026-06-10T10:00:00.000Z"),
        event("changed", "new_activity", "2026-06-10T11:30:00.000Z"),
      ],
      [
        state("hidden", { dismissedAt }), state("changed", { dismissedAt }),
        state("urgent", { dismissedAt }), state("pinned", { dismissedAt, pinned: true }),
      ], NOW,
    );
    expect(model.needsAttention.map((item) => item.thread.id)).toEqual(["pinned", "changed"]);
    expect(model.dueNow.map((item) => item.thread.id)).toEqual(["urgent"]);
    expect(JSON.stringify(model)).not.toContain("hidden");
  });

  it("classifies every section, excludes old resolutions, and uses stable ties", () => {
    const due = thread("due", "open", "2026-06-10T11:00:00.000Z");
    const attentionB = thread("b"); const attentionA = thread("a");
    const waiting = thread("waiting", "waiting"); const snoozed = thread("snoozed");
    const resolved = thread("resolved", "resolved");
    const oldResolved = { ...thread("old-resolved", "resolved"), resolvedAt: "2026-05-01T00:00:00.000Z" };
    const model = buildReviewModel(
      [due, attentionB, attentionA, waiting, snoozed, resolved, oldResolved],
      [event("a", "new_activity"), event("b", "new_activity")],
      [state("snoozed", { snoozedUntil: "2026-06-11T12:00:00.000Z" })], NOW,
    );
    expect(model.dueNow.map((item) => item.thread.id)).toEqual(["due"]);
    expect(model.needsAttention.map((item) => item.thread.id)).toEqual(["a", "b"]);
    expect(model.waiting.map((item) => item.thread.id)).toEqual(["waiting"]);
    expect(model.snoozed.map((item) => item.thread.id)).toEqual(["snoozed"]);
    expect(model.recentlyResolved.map((item) => item.thread.id)).toEqual(["resolved"]);
  });
});
