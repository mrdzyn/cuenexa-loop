import { describe, expect, it } from "vitest";
import { renderHistory, renderToday } from "../persistent-presenter.js";
import type { AttentionItem, LoopChangeEvent } from "@cuenexa-loop/loop-store";

const item: AttentionItem = {
  priority: 100, reasonCodes: ["overdue_open"],
  thread: {
    id: "thread_123", state: "open", title: "Derived pricing deck", dueAt: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-01-01T00:00:00.000Z", resolvedAt: null,
    memberIdentities: ["member_hash"], snapshotLoopIds: ["loop_hash"],
  },
};

describe("persistent CLI output", () => {
  it("keeps derived titles out of default attention and history output", () => {
    const event: LoopChangeEvent = { id: "event", threadId: item.thread.id, type: "thread_created", observedAt: item.thread.createdAt, details: {} };
    expect(renderToday([item], false)).not.toContain("Derived pricing deck");
    expect(renderHistory([event], [item.thread], false)).not.toContain("Derived pricing deck");
  });

  it("shows only a truncated derived title after explicit opt-in", () => {
    expect(renderToday([item], true)).toContain("Derived pricing deck");
  });
});
