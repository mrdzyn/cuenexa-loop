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
    console.log(renderNotifications(loadNotificationPlan(store, new Date().toISOString()), parseArgs(process.argv.slice(2)).includeContent));
  } catch {
    console.error(renderLocalStateError());
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
main();
