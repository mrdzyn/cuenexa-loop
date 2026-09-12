import { describe, expect, it } from "vitest";
import { createStableLoopId } from "../loop-id.js";
import {
  LoopCorrelationInputSchema,
  LoopCorrelationLinkSchema,
  LoopCorrelationReasonCodeSchema,
  LoopSchema,
  LoopStateSchema,
} from "../loop-types.js";
import { LoopItemSchema } from "../types.js";
import type { LoopItem } from "../types.js";

const OBSERVED_AT = "2026-02-01T12:00:00.000Z";

function makeItem(id: string, conversationId: string, evidenceText: string): LoopItem {
  return LoopItemSchema.parse({
    id,
    type: "commitment",
    text: "Send the revised pricing deck",
    state: "open",
    confidence: 0.9,
    owner: null,
    counterparties: [],
    dueAt: null,
    dueAtPhrase: null,
    source: { provider: "test-provider", conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text: evidenceText }],
    createdAt: OBSERVED_AT,
    resolvedAt: null,
  });
}

function makeLoop(items: [LoopItem, LoopItem]) {
  const [first, second] = items;
  const id = createStableLoopId(items);
  return {
    id,
    title: null,
    state: "open" as const,
    members: items.map((item) => ({ itemId: item.id, item })),
    timeline: items.map((item, sequence) => ({
      itemId: item.id,
      source: item.source,
      occurredAt: null,
      timestampSource: "unavailable" as const,
      sequence,
    })),
    correlationLinks: [
      {
        fromItemId: first.id,
        toItemId: second.id,
        confidence: 0.95,
        reasonCodes: ["shared_specific_anchor_phrase", "same_action_family"],
        sharedSpecificAnchorCount: 3,
      },
    ],
    correlationConfidence: 0.95,
    sourceConversationIds: [first.source.conversationId!, second.source.conversationId!],
    snapshot: { observedAt: OBSERVED_AT, completeness: "complete" as const },
    resolvedAt: null,
  };
}

describe("Phase 1B.1 Loop contracts", () => {
  const first = makeItem("item-a", "conversation-a", "I'll send the revised pricing deck.");
  const second = makeItem("item-b", "conversation-b", "I'll follow up on the revised pricing deck.");

  it("parses a valid Loop while preserving complete Phase 1A members", () => {
    const parsed = LoopSchema.parse(makeLoop([first, second]));

    expect(parsed.members).toHaveLength(2);
    expect(parsed.members[0]?.item).toEqual(first);
    expect(parsed.members[1]?.item.source).toEqual(second.source);
    expect(parsed.members[1]?.item.evidence).toEqual(second.evidence);
  });

  it("requires at least two members", () => {
    const loop = makeLoop([first, second]);
    expect(LoopSchema.safeParse({ ...loop, members: [loop.members[0]] }).success).toBe(false);
  });

  it("rejects lifecycle states outside the Phase 1B Loop lifecycle", () => {
    expect(LoopStateSchema.safeParse("provisional").success).toBe(false);
    expect(LoopSchema.safeParse({ ...makeLoop([first, second]), state: "dismissed" }).success).toBe(false);
  });

  it("requires correlation confidence to be within the deterministic score range", () => {
    const link = makeLoop([first, second]).correlationLinks[0]!;
    expect(LoopCorrelationLinkSchema.safeParse({ ...link, confidence: 1.01 }).success).toBe(false);
    expect(LoopCorrelationLinkSchema.safeParse({ ...link, confidence: -0.01 }).success).toBe(false);
  });

  it("rejects unknown correlation reason codes", () => {
    expect(LoopCorrelationReasonCodeSchema.safeParse("machine_inference").success).toBe(false);
  });

  it("defines provider-independent future correlation input without Bee adapter types", () => {
    const parsed = LoopCorrelationInputSchema.parse({
      items: [first, second],
      conversations: [],
      facts: [],
      todos: [],
      now: OBSERVED_AT,
      snapshot: { observedAt: OBSERVED_AT, completeness: "partial" },
    });

    expect(parsed.items.map((item) => item.source.provider)).toEqual(["test-provider", "test-provider"]);
  });
});

describe("createStableLoopId", () => {
  const first = makeItem("item-a", "conversation-a", "I'll send the revised pricing deck.");
  const second = makeItem("item-b", "conversation-b", "I'll follow up on the revised pricing deck.");
  const third = makeItem("item-c", "conversation-c", "I'll review the quarterly forecast.");

  it("is independent of input member ordering", () => {
    expect(createStableLoopId([first, second])).toBe(createStableLoopId([second, first]));
  });

  it("changes when stable membership changes", () => {
    expect(createStableLoopId([first, second])).not.toBe(createStableLoopId([first, third]));
  });

  it("excludes raw evidence, party fields, and detection timestamps", () => {
    const altered = LoopItemSchema.parse({
      ...first,
      owner: { label: "Jordan Private" },
      evidence: [{ ...first.evidence[0]!, text: "Email jordan@example.com about the revised pricing deck." }],
      createdAt: "2030-01-01T00:00:00.000Z",
    });
    const id = createStableLoopId([altered, second]);

    expect(id).toBe(createStableLoopId([first, second]));
    expect(id).not.toContain("jordan");
    expect(id).not.toContain("example");
    expect(id).not.toContain("pricing");
  });

  it("does not mutate frozen member arrays or items", () => {
    const frozenItems = Object.freeze([Object.freeze(first), Object.freeze(second)]);
    expect(() => createStableLoopId(frozenItems)).not.toThrow();
  });
});
