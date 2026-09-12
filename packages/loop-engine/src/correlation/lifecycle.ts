import type { LoopState, LoopTimelineEvent } from "../loop-types.js";
import type { LoopItem } from "../types.js";

export interface LoopLifecycle {
  readonly state: LoopState;
  readonly resolvedAt: string | null;
}

/** Derives lifecycle only from explicit member state and deterministic semantics. */
export function deriveLoopLifecycle(
  items: readonly LoopItem[],
  timeline: readonly LoopTimelineEvent[],
): LoopLifecycle {
  const allResolved = items.length > 0 && items.every((item) => item.state === "resolved" || item.state === "dismissed");
  if (allResolved) {
    const resolvedTimestamps = items.map((item) => item.resolvedAt);
    return {
      state: "resolved",
      resolvedAt: resolvedTimestamps.every((timestamp): timestamp is string => timestamp !== null)
        ? [...resolvedTimestamps].sort().at(-1) ?? null
        : null,
    };
  }

  const activeItems = new Map(
    items
      .filter((item) => item.state !== "resolved" && item.state !== "dismissed")
      .map((item) => [item.id, item]),
  );
  const newestActive = [...timeline]
    .sort((a, b) => b.sequence - a.sequence)
    .map((event) => activeItems.get(event.itemId))
    .find((item): item is LoopItem => item !== undefined);

  if (newestActive && (newestActive.state === "waiting" || newestActive.type === "delegation" || newestActive.type === "open_question")) {
    return { state: "waiting", resolvedAt: null };
  }
  return { state: "open", resolvedAt: null };
}
