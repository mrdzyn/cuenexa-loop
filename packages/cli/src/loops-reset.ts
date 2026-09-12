#!/usr/bin/env node
import { resetLoopStore, resolveLoopStorePath } from "@cuenexa-loop/loop-store";
import { parseArgs } from "./args.js";
import { renderLocalStateError } from "./local-error.js";

function main(): void {
  if (!parseArgs(process.argv.slice(2)).yes) {
    console.error("Refusing to erase local CueNexa Loop state. Re-run with --yes.");
    process.exitCode = 1;
    return;
  }
  try {
    const removed = resetLoopStore(resolveLoopStorePath());
    console.log(removed ? "Local CueNexa Loop state erased." : "No local CueNexa Loop state exists.");
  } catch {
    console.error(renderLocalStateError());
    process.exitCode = 1;
  }
}
main();
