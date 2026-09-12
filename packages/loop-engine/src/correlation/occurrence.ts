import type { LoopConversation } from "@cuenexa-loop/contracts";
import type { LoopTimestampSource } from "../loop-types.js";
import type { LoopItem } from "../types.js";

export interface ItemOccurrence {
  readonly occurredAt: string | null;
  readonly timestampSource: LoopTimestampSource;
}

/**
 * Resolves conversational occurrence time from normalized source context.
 * Phase 1A `createdAt` is detection time and is deliberately never read.
 */
export function deriveItemOccurrence(
  item: LoopItem,
  conversations: readonly LoopConversation[],
): ItemOccurrence {
  const conversationId = item.source.conversationId;
  if (conversationId === null) {
    return { occurredAt: null, timestampSource: "unavailable" };
  }

  const conversation = conversations.find(
    (candidate) => candidate.id === conversationId && candidate.provenance.source === item.source.provider,
  );
  if (!conversation) {
    return { occurredAt: null, timestampSource: "unavailable" };
  }

  const utteranceTimes = [...new Set(item.source.utteranceIndexes)]
    .sort((a, b) => a - b)
    .map((index) => conversation.utterances[index]?.spokenAt ?? null)
    .filter((timestamp): timestamp is string => timestamp !== null)
    .sort();
  const utteranceTime = utteranceTimes[0];
  if (utteranceTime) {
    return { occurredAt: utteranceTime, timestampSource: "utterance" };
  }
  if (conversation.endedAt) {
    return { occurredAt: conversation.endedAt, timestampSource: "conversation_ended" };
  }
  if (conversation.startedAt) {
    return { occurredAt: conversation.startedAt, timestampSource: "conversation_started" };
  }
  return { occurredAt: null, timestampSource: "unavailable" };
}
