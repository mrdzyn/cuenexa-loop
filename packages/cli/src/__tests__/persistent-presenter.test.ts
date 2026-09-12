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

  it("redacts email and phone content before truncating Phase 2 included titles", () => {
    const sensitiveTitle = `Contact alice@example.com or +1 555 123 4567 about ${"the private follow-through details ".repeat(4)}`;
    const sensitiveItem: AttentionItem = { ...item, thread: { ...item.thread, title: sensitiveTitle } };
    const event: LoopChangeEvent = {
      id: "event-sensitive", threadId: sensitiveItem.thread.id, type: "thread_created",
      observedAt: sensitiveItem.thread.createdAt, details: {},
    };

    for (const output of [renderToday([sensitiveItem], true), renderHistory([event], [sensitiveItem.thread], true)]) {
      expect(output).toContain("[redacted-email]");
      expect(output).toContain("[redacted-number]");
      expect(output).not.toContain("alice@example.com");
      expect(output).not.toContain("+1 555 123 4567");
      const renderedTitle = output.split(" — ")[1];
      expect(renderedTitle).toBeDefined();
      expect(renderedTitle!.length).toBeLessThanOrEqual(80);
      expect(renderedTitle!.endsWith("…")).toBe(true);
    }
  });
});
