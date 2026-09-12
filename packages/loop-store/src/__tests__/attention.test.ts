import { describe, expect, it } from "vitest";
import { rankAttention } from "../attention.js";
import type { LoopChangeEvent, LoopThread } from "../types.js";

const NOW = "2026-09-12T12:00:00.000Z";

function thread(id: string, state: LoopThread["state"], dueAt: string | null, lastObservedAt = NOW): LoopThread {
  return {
    id, state, title: null, dueAt, createdAt: lastObservedAt, updatedAt: lastObservedAt, lastObservedAt, resolvedAt: state === "resolved" ? lastObservedAt : null,
    memberIdentities: [], snapshotLoopIds: [],
  };
}

function event(threadId: string, type: LoopChangeEvent["type"]): LoopChangeEvent {
  return { id: `event-${threadId}-${type}`, threadId, type, observedAt: NOW, details: {} };
}

describe("rankAttention", () => {
  it("uses the fixed priority order and excludes resolved threads", () => {
    const ranked = rankAttention(
      [
        thread("due", "open", "2026-09-12T11:59:59.999Z"),
        thread("soon", "open", "2026-09-13T12:00:00.000Z"),
        thread("resolved", "resolved", "2026-09-10T00:00:00.000Z"),
      ],
      [], NOW,
    );
    expect(ranked.map((item) => item.thread.id)).toEqual(["due", "soon"]);
    expect(ranked[0]?.reasonCodes).toContain("overdue_open");
    expect(ranked[1]?.reasonCodes).toContain("due_within_24h");
  });

  it("includes recent structural activity, boundary due windows, stale open and long waiting", () => {
    const ranked = rankAttention(
      [
        thread("activity", "open", null),
        thread("three-days", "open", "2026-09-15T12:00:00.000Z"),
        thread("stale", "open", null, "2026-09-05T12:00:00.000Z"),
        thread("waiting", "waiting", null, "2026-08-29T12:00:00.000Z"),
      ],
      [event("activity", "reopened"), event("activity", "member_added"), event("activity", "new_activity")], NOW,
    );
    const activity = ranked.find((item) => item.thread.id === "activity");
    expect(activity?.reasonCodes).toEqual(["reopened", "new_activity", "new_member"]);
    expect(ranked.find((item) => item.thread.id === "three-days")?.reasonCodes).toContain("due_within_3d");
    expect(ranked.find((item) => item.thread.id === "stale")?.reasonCodes).toContain("stale_open");
    expect(ranked.find((item) => item.thread.id === "waiting")?.reasonCodes).toContain("waiting_too_long");
  });

  it("uses thread id as a stable tie breaker", () => {
    const ranked = rankAttention([thread("b", "open", "2026-09-13T00:00:00.000Z"), thread("a", "open", "2026-09-13T00:00:00.000Z")], [], NOW);
    expect(ranked.map((item) => item.thread.id)).toEqual(["a", "b"]);
  });
});
