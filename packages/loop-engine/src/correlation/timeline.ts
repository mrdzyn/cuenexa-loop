import type { LoopConversation } from "@cuenexa-loop/contracts";
import { createStableMemberIdentity } from "../loop-id.js";
import { LoopTimelineEventSchema } from "../loop-types.js";
import type { LoopTimelineEvent } from "../loop-types.js";
import type { LoopItem } from "../types.js";
import { deriveItemOccurrence } from "./occurrence.js";

/** Builds an input-order-independent timeline without using detection time. */
export function buildLoopTimeline(
  items: readonly LoopItem[],
  conversations: readonly LoopConversation[],
): LoopTimelineEvent[] {
  const pending = items.map((item) => ({
    item,
    memberIdentity: createStableMemberIdentity(item),
    occurrence: deriveItemOccurrence(item, conversations),
  }));

  pending.sort((a, b) => {
    const firstTime = a.occurrence.occurredAt;
    const secondTime = b.occurrence.occurredAt;
    if (firstTime && secondTime && firstTime !== secondTime) {
      return firstTime.localeCompare(secondTime);
    }
    if (firstTime && !secondTime) {
      return -1;
    }
    if (!firstTime && secondTime) {
      return 1;
    }
    return a.memberIdentity.localeCompare(b.memberIdentity);
  });

  return pending.map(({ item, memberIdentity, occurrence }, sequence) =>
    LoopTimelineEventSchema.parse({
      itemId: item.id,
      memberIdentity,
      source: item.source,
      occurredAt: occurrence.occurredAt,
      timestampSource: occurrence.timestampSource,
      sequence,
    }),
  );
}
