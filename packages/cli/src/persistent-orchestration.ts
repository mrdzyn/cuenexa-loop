import { BeeAdapterClient, fetchCompleteDetectionSnapshot } from "@cuenexa-loop/bee-adapter";
import { LoopStore, type ReconcileResult } from "@cuenexa-loop/loop-store";
import { detectAndCorrelateSnapshot } from "./correlation-orchestration.js";
import { resolveTimeZone } from "./timezone.js";

export async function syncPersistentLoops(
  client: BeeAdapterClient,
  store: LoopStore,
  now = new Date().toISOString(),
): Promise<ReconcileResult> {
  const { timeZone } = await client.ensureAuthenticated();
  const completeSnapshot = await fetchCompleteDetectionSnapshot(client);
  const result = detectAndCorrelateSnapshot(completeSnapshot.snapshot, now, resolveTimeZone(timeZone));
  const complete = completeSnapshot.complete && result.correlation.snapshot.completeness === "complete";
  return store.reconcile({ loops: result.correlation.loops, observedAt: now, complete });
}
