#!/usr/bin/env node
import { BeeAdapterClient, fetchBeeSnapshot } from "@cuenexa-loop/bee-adapter";
import { parseArgs } from "./args.js";
import { loadConfig } from "./config.js";
import { renderBeeError } from "./error-report.js";
import { renderConnectivityReport, renderContentReport } from "./presenter.js";

async function main(): Promise<void> {
  const { includeContent } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = new BeeAdapterClient();

  try {
    await client.ensureAuthenticated();
    const snapshot = await fetchBeeSnapshot(client);
    console.log(includeContent ? renderContentReport(snapshot, config) : renderConnectivityReport(snapshot));
  } catch (error) {
    console.error(renderBeeError(error));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("CueNexa Loop failed unexpectedly:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
