import type { BeeSnapshot } from "@cuenexa-loop/bee-adapter";
import type { LoopConversation } from "@cuenexa-loop/contracts";
import { describe, expect, it } from "vitest";
import { detectAndCorrelateSnapshot } from "../correlation-orchestration.js";

const NOW = "2026-02-10T12:00:00.000Z";

function conversation(id: string, text: string, spokenAt: string): LoopConversation {
  return {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt: NOW },
    startedAt: spokenAt,
    endedAt: spokenAt,
    summary: "Synthetic",
    detailedSummary: null,
    location: null,
    deviceType: null,
    utterances: [{ speaker: "Speaker A", text, spokenAt }],
  };
}

describe("correlation CLI orchestration", () => {
  it("detects preserved LoopItems and correlates them from one hydrated snapshot", () => {
    const snapshot: BeeSnapshot = {
      conversations: [
        conversation("conv-a", "I'll send the pricing deck.", "2026-02-01T10:00:00.000Z"),
        conversation("conv-b", "I'll review the pricing deck.", "2026-02-02T10:00:00.000Z"),
      ],
      facts: [], todos: [], warnings: [],
      pagination: { conversations: { nextCursor: null }, facts: { nextCursor: null }, todos: { nextCursor: null } },
    };
    const result = detectAndCorrelateSnapshot(snapshot, NOW, "UTC");
    expect(result.detection.items).toHaveLength(2);
    expect(result.correlation.loops).toHaveLength(1);
    expect(result.correlation.loops[0]?.members.map((member) => member.item)).toEqual(
      expect.arrayContaining(result.detection.items),
    );
  });
});
