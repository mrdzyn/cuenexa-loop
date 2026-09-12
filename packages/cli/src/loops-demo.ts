#!/usr/bin/env node
import { BeeAdapterClient } from "@cuenexa-loop/bee-adapter";
import { buildReviewModel, LoopStore } from "@cuenexa-loop/loop-store";
import { renderBeeError } from "./error-report.js";
import { renderLocalStateError } from "./local-error.js";
import { syncPersistentLoops } from "./persistent-orchestration.js";
import { renderSyncReport } from "./persistent-presenter.js";
import { renderReview } from "./review-presenter.js";
import { loadNotificationPlan } from "./notification-orchestration.js";
import { renderNotifications } from "./notification-presenter.js";

async function main(): Promise<void> {
  let store: LoopStore | undefined;
  try {
    store = new LoopStore();
    console.log(renderSyncReport(await syncPersistentLoops(new BeeAdapterClient(), store)));
    console.log("");
    const now = new Date().toISOString();
    const review = buildReviewModel(store.listThreads(), store.listEvents(500), store.listThreadUserStates(), now);
    console.log(renderReview(review, false));
    console.log("");
    console.log(renderNotifications(loadNotificationPlan(store, now), false));
  } catch (error) {
    console.error(error instanceof Error && error.name === "LoopStoreError" ? renderLocalStateError() : renderBeeError(error));
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
void main();
