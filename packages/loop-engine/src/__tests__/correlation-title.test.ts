import { describe, expect, it } from "vitest";
import { deriveLoopTitle } from "../correlation/title.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem } from "../types.js";

function item(id: string, text: string): LoopItem {
  return LoopItemSchema.parse({
    id, type: "commitment", text, state: "open", confidence: 0.9, owner: null, counterparties: [], dueAt: null,
    dueAtPhrase: null,
    source: { provider: "bee", conversationId: `conv-${id}`, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: `conv-${id}`, text }],
    createdAt: "2026-02-01T00:00:00.000Z", resolvedAt: null,
  });
}

describe("deriveLoopTitle", () => {
  it("uses the dominant shared specific phrase instead of generic action language", () => {
    const items = [item("a", "Send the pricing deck"), item("b", "Please review the pricing deck"), item("c", "Finalize the pricing deck")];
    expect(deriveLoopTitle(items)).toBe("Pricing deck");
  });

  it("ranks by member coverage before deterministic lexical ties", () => {
    const items = [item("a", "Prepare Azure migration plan"), item("b", "Review Azure migration plan"), item("c", "Finalize Azure migration")];
    expect(deriveLoopTitle(items)).toBe("Azure migration");
  });

  it("is independent of input order", () => {
    const items = [item("a", "Send the vendor contract"), item("b", "Review the vendor contract")];
    expect(deriveLoopTitle(items)).toBe(deriveLoopTitle([...items].reverse()));
  });
});
