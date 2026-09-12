#!/usr/bin/env node
import { LoopStore } from "@cuenexa-loop/loop-store";
import { parseArgs } from "./args.js";
import { renderLocalStateError } from "./local-error.js";
import { renderHistory } from "./persistent-presenter.js";

function main(): void {
  let store: LoopStore | undefined;
  try {
    store = new LoopStore();
    console.log(renderHistory(store.listEvents(), store.listThreads(), parseArgs(process.argv.slice(2)).includeContent));
  } catch {
    console.error(renderLocalStateError());
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
main();
