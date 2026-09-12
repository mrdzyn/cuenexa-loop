import { describe, expect, it } from "vitest";
import { deriveLoopLifecycle } from "../correlation/lifecycle.js";
import { buildLoopTimeline } from "../correlation/timeline.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem } from "../types.js";

const NOW = "2026-02-10T12:00:00.000Z";

function item(id: string, type: LoopItem["type"], state: LoopItem["state"], overrides: Partial<LoopItem> = {}): LoopItem {
  const text = "Prepare the security assessment";
  return LoopItemSchema.parse({
    id, type, text, state, confidence: 0.9, owner: null, counterparties: [], dueAt: null, dueAtPhrase: null,
    source: { provider: "bee", conversationId: `conv-${id}`, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: `conv-${id}`, text }],
    createdAt: NOW,
    resolvedAt: null,
    ...overrides,
  });
}

function lifecycle(items: LoopItem[]) {
  return deriveLoopLifecycle(items, buildLoopTimeline(items, []));
}

describe("deriveLoopLifecycle", () => {
  it.each(["commitment", "follow_up"] as const)("keeps an active %s open", (type) => {
    expect(lifecycle([item("a", type, "open")]).state).toBe("open");
  });

  it("marks the newest delegation or explicit waiting member as waiting", () => {
    expect(lifecycle([item("a", "commitment", "open"), item("b", "delegation", "open")]).state).toBe("waiting");
    expect(lifecycle([item("a", "commitment", "waiting")]).state).toBe("waiting");
  });

  it("keeps mixed resolved/open work open and ignores overdue dates", () => {
    const resolved = item("a", "commitment", "resolved", { resolvedAt: "2026-02-01T00:00:00.000Z" });
    const overdue = item("b", "commitment", "open", { dueAt: "2000-01-01T00:00:00.000Z" });
    expect(lifecycle([resolved, overdue])).toEqual({ state: "open", resolvedAt: null });
  });

  it("resolves only when every member is explicit and chooses the latest resolvedAt", () => {
    const result = lifecycle([
      item("a", "commitment", "resolved", { resolvedAt: "2026-02-01T00:00:00.000Z" }),
      item("b", "follow_up", "resolved", { resolvedAt: "2026-02-03T00:00:00.000Z" }),
    ]);
    expect(result).toEqual({ state: "resolved", resolvedAt: "2026-02-03T00:00:00.000Z" });
  });

  it("does not invent a resolved timestamp when an explicit member lacks one", () => {
    expect(lifecycle([item("a", "commitment", "resolved"), item("b", "commitment", "resolved")])).toEqual({
      state: "resolved",
      resolvedAt: null,
    });
  });

  it("does not mutate members", () => {
    const items = [item("a", "commitment", "open"), item("b", "delegation", "open")];
    const before = structuredClone(items);
    lifecycle(items);
    expect(items).toEqual(before);
  });
});
