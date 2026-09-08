#!/usr/bin/env node
import { BeeConnectionError, BeeProxyClient, BeeResponseError, fetchBeeSnapshot } from "@cuenexa-loop/bee-adapter";
import { loadConfig } from "./config.js";
import { renderSnapshot } from "./presenter.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new BeeProxyClient({ baseUrl: config.beeProxyUrl });

  try {
    const snapshot = await fetchBeeSnapshot(client);
    console.log(renderSnapshot(snapshot, config));
  } catch (error) {
    if (error instanceof BeeConnectionError) {
      console.error(`CueNexa Loop could not reach Bee: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof BeeResponseError) {
      console.error(`CueNexa Loop got an unexpected response from Bee: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error("CueNexa Loop failed unexpectedly:", error);
  process.exitCode = 1;
});
