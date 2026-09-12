#!/usr/bin/env node
import { buildReviewModel, LoopStore } from "@cuenexa-loop/loop-store";
import { parseArgs } from "./args.js";
import { renderLocalStateError } from "./local-error.js";
import { renderReview } from "./review-presenter.js";

function main(): void {
  let store: LoopStore | undefined;
  try {
    store = new LoopStore();
    const model = buildReviewModel(
      store.listThreads(), store.listEvents(500), store.listThreadUserStates(), new Date().toISOString(),
    );
    console.log(renderReview(model, parseArgs(process.argv.slice(2)).includeContent));
  } catch {
    console.error(renderLocalStateError());
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
main();
