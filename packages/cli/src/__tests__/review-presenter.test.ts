import { describe, expect, it } from "vitest";
import type { ReviewItem, ReviewModel } from "@cuenexa-loop/loop-store";
import { renderReview } from "../review-presenter.js";

const privateTitle = `Contact alice@example.com or +1 555 123 4567 about ${"private details ".repeat(8)}`;
const item: ReviewItem = {
  thread: {
    id: "thread_synthetic", state: "open", title: privateTitle, dueAt: "2026-06-10T13:00:00.000Z",
    createdAt: "2026-06-10T10:00:00.000Z", updatedAt: "2026-06-10T10:00:00.000Z",
    lastObservedAt: "2026-06-10T10:00:00.000Z", resolvedAt: null,
    memberIdentities: ["member_a", "member_b"], snapshotLoopIds: ["loop_a"],
  },
  userState: { threadId: "thread_synthetic", acknowledgedAt: null, snoozedUntil: null, pinned: false, dismissedAt: null, updatedAt: null },
  priority: 90, reasonCodes: ["due_within_24h"],
};
const model: ReviewModel = {
  generatedAt: "2026-06-10T12:00:00.000Z", dueNow: [item], needsAttention: [], waiting: [], snoozed: [], recentlyResolved: [],
};

describe("renderReview", () => {
  it("renders all structural sections without reading a title by default", () => {
    const throwing = { ...item.thread, get title(): string { throw new Error("title accessed"); } };
    const output = renderReview({ ...model, dueNow: [{ ...item, thread: throwing }] }, false);
    expect(output).toContain("DUE NOW (1)");
    expect(output).toContain("NEEDS ATTENTION (0)");
    expect(output).toContain("WAITING (0)");
    expect(output).toContain("SNOOZED (0)");
    expect(output).toContain("RECENTLY RESOLVED (0)");
    expect(output).toContain("Private content printed: NO");
  });

  it("redacts email and phone before truncating an opted-in derived title", () => {
    const output = renderReview(model, true);
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("[redacted-number]");
    expect(output).not.toContain("alice@example.com");
    expect(output).not.toContain("+1 555 123 4567");
    const renderedTitle = output.split(" — ").at(-1)!.split("\n")[0]!;
    expect(renderedTitle.length).toBeLessThanOrEqual(80);
    expect(renderedTitle.endsWith("…")).toBe(true);
  });
});
