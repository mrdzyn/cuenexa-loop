import { describe, expect, it } from "vitest";
import type { NotificationPlan } from "@cuenexa-loop/loop-store";
import { renderNotifications } from "../notification-presenter.js";

const title = `Email alice@example.com or call +1 555 123 4567 ${"with private detail ".repeat(8)}`;
const plan: NotificationPlan = {
  generatedAt: "2026-07-01T12:00:00.000Z",
  candidates: [{
    id: "notification_synthetic", type: "due_within_24h", triggerKey: "due:2026-07-02T00:00:00.000Z",
    thread: {
      id: "thread_synthetic", state: "open", title, dueAt: "2026-07-02T00:00:00.000Z",
      createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
      lastObservedAt: "2026-07-01T00:00:00.000Z", resolvedAt: null,
      memberIdentities: ["member_a", "member_b"], snapshotLoopIds: ["loop_a"],
    },
  }],
};

describe("renderNotifications", () => {
  it("does not read or print titles by default", () => {
    const throwingThread = { ...plan.candidates[0]!.thread, get title(): string { throw new Error("title accessed"); } };
    const output = renderNotifications({ ...plan, candidates: [{ ...plan.candidates[0]!, thread: throwingThread }] }, false);
    expect(output).toContain("Eligible: 1");
    expect(output).toContain("Private content printed: NO");
  });

  it("redacts then truncates an explicitly included derived title", () => {
    const output = renderNotifications(plan, true);
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("[redacted-number]");
    expect(output).not.toContain("alice@example.com");
    expect(output).not.toContain("+1 555 123 4567");
    const renderedTitle = output.split(" — ").at(-1)!.split("\n")[0]!;
    expect(renderedTitle.length).toBeLessThanOrEqual(80);
    expect(renderedTitle.endsWith("…")).toBe(true);
  });
});
