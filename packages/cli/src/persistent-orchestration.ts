import { BeeAdapterClient, fetchCompleteDetectionSnapshot } from "@cuenexa-loop/bee-adapter";
import { LoopStore, type ReconcileResult } from "@cuenexa-loop/loop-store";
import { detectAndCorrelateSnapshot } from "./correlation-orchestration.js";
import { resolveTimeZone } from "./timezone.js";

export interface AuthoritativeSyncResult {
  readonly reconcile: ReconcileResult;
  /** Conversations represented by authoritative detected LoopItems in this processed snapshot. */
  readonly detectedConversationIds: ReadonlySet<string>;
  readonly timeZone: string;
}

export async function syncPersistentLoops(
  client: BeeAdapterClient,
  store: LoopStore,
  now = new Date().toISOString(),
): Promise<ReconcileResult> {
  return (await syncPersistentLoopsWithDetails(client, store, now)).reconcile;
}

/** The one Phase 4 handoff route; it is the existing authoritative pipeline plus structural confirmation metadata. */
export async function syncPersistentLoopsWithDetails(
  client: BeeAdapterClient,
  store: LoopStore,
  now = new Date().toISOString(),
): Promise<AuthoritativeSyncResult> {
  const { timeZone } = await client.ensureAuthenticated();
  const completeSnapshot = await fetchCompleteDetectionSnapshot(client);
  const result = detectAndCorrelateSnapshot(completeSnapshot.snapshot, now, resolveTimeZone(timeZone));
  const complete = completeSnapshot.complete && result.correlation.snapshot.completeness === "complete";
  const detectedConversationIds = new Set(
    result.detection.items
      .map((item) => item.source.conversationId)
      .filter((conversationId): conversationId is string => conversationId !== null),
  );
  return {
    reconcile: store.reconcile({ loops: result.correlation.loops, observedAt: now, complete }),
    detectedConversationIds,
    timeZone: resolveTimeZone(timeZone),
  };
}
