#!/usr/bin/env node
import { BeeAdapterClient } from "@cuenexa-loop/bee-adapter";
import { LoopStore } from "@cuenexa-loop/loop-store";
import { renderBeeError } from "./error-report.js";
import { renderLocalStateError } from "./local-error.js";
import { syncPersistentLoops } from "./persistent-orchestration.js";
import { renderSyncReport } from "./persistent-presenter.js";

async function main(): Promise<void> {
  let store: LoopStore | undefined;
  try {
    store = new LoopStore();
    const result = await syncPersistentLoops(new BeeAdapterClient(), store);
    console.log(renderSyncReport(result));
  } catch (error) {
    console.error(error instanceof Error && error.name === "LoopStoreError" ? renderLocalStateError() : renderBeeError(error));
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}
void main();
