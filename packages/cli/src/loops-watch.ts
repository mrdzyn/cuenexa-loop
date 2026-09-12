#!/usr/bin/env node
import { BeeAdapterClient } from "@cuenexa-loop/bee-adapter";
import { buildReviewModel, LoopStore } from "@cuenexa-loop/loop-store";
import { parseArgs } from "./args.js";
import { renderBeeError } from "./error-report.js";
import { renderLocalStateError } from "./local-error.js";
import { loadNotificationPlan } from "./notification-orchestration.js";
import { syncPersistentLoopsWithDetails } from "./persistent-orchestration.js";
import { runAmbientWatch } from "./watch-runtime.js";

async function main(): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let store: LoopStore | undefined;

  try {
    store = new LoopStore();
    const stableStore = store;
    const client = new BeeAdapterClient();
    await runAmbientWatch({
      initialSync: (now) => syncPersistentLoopsWithDetails(client, stableStore, now),
      authoritativeRefresh: (now) => syncPersistentLoopsWithDetails(client, stableStore, now),
      subscribe: (signal) => client.subscribeRealtime({
        signal,
        onWarning: (warning) => console.warn(`Realtime event ignored: ${warning.code}.`),
      }),
      loadReview: (now) => buildReviewModel(
        stableStore.listThreads(), stableStore.listEvents(500), stableStore.listThreadUserStates(), now,
      ),
      loadNotifications: (now) => loadNotificationPlan(stableStore, now),
      output: (text) => console.log(text),
      includeContent: parseArgs(process.argv.slice(2)).includeContent,
    }, controller.signal);
  } catch (error) {
    console.error(error instanceof Error && error.name === "LoopStoreError" ? renderLocalStateError() : renderBeeError(error));
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    store?.close();
  }
}

void main();
