#!/usr/bin/env node
import { LoopStore, LoopStoreError } from "@cuenexa-loop/loop-store";
import { renderLocalStateError } from "./local-error.js";
import {
  executeThreadAction, parseThreadActionArgs, renderThreadActionResult, ThreadActionArgumentError,
} from "./thread-actions.js";

function main(): void {
  let store: LoopStore | undefined;
  try {
    const now = new Date().toISOString();
    const request = parseThreadActionArgs(process.argv.slice(2), now);
    store = new LoopStore();
    console.log(renderThreadActionResult(executeThreadAction(store, request, now)));
  } catch (error) {
    const message = error instanceof ThreadActionArgumentError
      ? error.message
      : error instanceof LoopStoreError && error.message === "Unknown local Loop thread ID."
        ? error.message
        : renderLocalStateError();
    console.error(message);
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
main();
