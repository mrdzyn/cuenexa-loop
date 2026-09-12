#!/usr/bin/env node
import { BeeAdapterClient, fetchDetectionSnapshot } from "@cuenexa-loop/bee-adapter";
import { parseArgs } from "./args.js";
import { loadConfig } from "./config.js";
import { detectAndCorrelateSnapshot } from "./correlation-orchestration.js";
import { renderCorrelationConnectivityReport, renderCorrelationContentReport } from "./correlation-presenter.js";
import { renderBeeError } from "./error-report.js";
import { resolveTimeZone } from "./timezone.js";

async function main(): Promise<void> {
  const { includeContent } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = new BeeAdapterClient();

  try {
    const { timeZone: beeTimeZone } = await client.ensureAuthenticated();
    const snapshot = await fetchDetectionSnapshot(client);
    const now = new Date().toISOString();
    const result = detectAndCorrelateSnapshot(snapshot, now, resolveTimeZone(beeTimeZone));
    console.log(
      includeContent
        ? renderCorrelationContentReport(snapshot, result.detection, result.correlation, config)
        : renderCorrelationConnectivityReport(snapshot, result.detection, result.correlation),
    );
  } catch (error) {
    console.error(renderBeeError(error));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("CueNexa Loop failed unexpectedly:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
