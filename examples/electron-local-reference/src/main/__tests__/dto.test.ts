import { describe, expect, it } from "vitest";
import type { ReviewItem } from "@cuenexa-loop/loop-store";
import { assertCardIsSanitized, dtoContainsProhibitedContent, toLoopCardDto, toReviewSnapshotDto } from "../dto.js";

const NOW = "2026-10-06T12:00:00.000Z";

function reviewItem(): ReviewItem {
  return {
    priority: 10,
    reasonCodes: ["newly_created"],
    userState: {
      threadId: "thread_synthetic",
      acknowledgedAt: null,
      snoozedUntil: null,
      pinned: false,
      dismissedAt: null,
      updatedAt: null,
    },
    thread: {
      id: "thread_synthetic",
      state: "open",
      title: "Apollo Partner Security Review",
      dueAt: "2026-10-07T12:00:00.000Z",
      createdAt: NOW,
      updatedAt: NOW,
      lastObservedAt: NOW,
      resolvedAt: null,
      memberIdentities: ["member_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "member_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      snapshotLoopIds: ["loop_aaaaaaaaaaaaaaaaaaaaaaaa"],
    },
  };
}

describe("renderer DTO sanitizer", () => {
  it("emits only structural card fields and excludes prohibited content", () => {
    const item = reviewItem();
    (item.thread as unknown as { transcript: string }).transcript = "SECRET_TRANSCRIPT_DO_NOT_LEAK";
    (item.thread as unknown as { evidence: string }).evidence = "SECRET_EVIDENCE";
    const card = toLoopCardDto(item, "needsAttention");
    assertCardIsSanitized(card);
    expect(card.title).toBe("Apollo Partner Security Review");
    expect(card.memberCount).toBe(2);
    expect(card.section).toBe("needsAttention");
    expect(JSON.stringify(card)).not.toContain("SECRET_TRANSCRIPT");
    expect(JSON.stringify(card)).not.toContain("SECRET_EVIDENCE");
    expect(dtoContainsProhibitedContent(card)).toBe(false);
  });

  it("maps review sections without Bee source objects", () => {
    const snapshot = toReviewSnapshotDto({
      review: {
        generatedAt: NOW,
        dueNow: [],
        needsAttention: [reviewItem()],
        waiting: [],
        snoozed: [],
        recentlyResolved: [],
      },
      complete: true,
      timeZone: "Asia/Manila",
      changeCount: 1,
    });
    expect(snapshot.sections.needsAttention).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toMatch(/utterance|transcript|evidence|summary|latitude/);
  });
});
