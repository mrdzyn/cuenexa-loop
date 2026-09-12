#!/usr/bin/env node
import { LoopStore } from "@cuenexa-loop/loop-store";
import { parseArgs } from "./args.js";
import { renderLocalStateError } from "./local-error.js";
import { loadNotificationPlan } from "./notification-orchestration.js";
import { renderNotifications } from "./notification-presenter.js";

function main(): void {
  let store: LoopStore | undefined;
  try {
    store = new LoopStore();
    const now = new Date().toISOString();
    const plan = loadNotificationPlan(store, now);
    console.log(renderNotifications(plan, parseArgs(process.argv.slice(2)).includeContent));
    store.recordNotificationDeliveries(plan.candidates.map((candidate) => ({
      id: candidate.id, threadId: candidate.thread.id, type: candidate.type, triggerKey: candidate.triggerKey,
    })), now);
  } catch {
    console.error(renderLocalStateError());
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
main();
