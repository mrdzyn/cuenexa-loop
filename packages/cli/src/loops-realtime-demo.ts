#!/usr/bin/env node
import { parseArgs } from "./args.js";
import { runSyntheticRealtimeDemo } from "./realtime-demo.js";

console.log(runSyntheticRealtimeDemo(parseArgs(process.argv.slice(2)).includeContent).output);
