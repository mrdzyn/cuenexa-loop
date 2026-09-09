#!/usr/bin/env node
import { BeeAdapterClient, fetchBeeSnapshot } from "@cuenexa-loop/bee-adapter";
import { detectLoopItems } from "@cuenexa-loop/loop-engine";
import { parseArgs } from "./args.js";
import { loadConfig } from "./config.js";
import { renderBeeError } from "./error-report.js";
import { renderLoopConnectivityReport, renderLoopContentReport } from "./loop-presenter.js";

async function main(): Promise<void> {
  const { includeContent } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = new BeeAdapterClient();

  try {
    await client.ensureAuthenticated();
    const snapshot = await fetchBeeSnapshot(client);
    const now = new Date().toISOString();
    const result = detectLoopItems({
      conversations: snapshot.conversations,
      facts: snapshot.facts,
      todos: snapshot.todos,
      now,
    });

    console.log(includeContent ? renderLoopContentReport(result, config) : renderLoopConnectivityReport(snapshot, result));
  } catch (error) {
    console.error(renderBeeError(error));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("CueNexa Loop failed unexpectedly:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
