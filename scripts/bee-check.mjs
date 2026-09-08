#!/usr/bin/env node
// Preflight check: is the local Bee developer proxy reachable? Reads no
// conversations/facts/todos — it only checks that an endpoint responds, so
// this is safe to run without pulling any Bee data into the process.

const baseUrl = (process.env.BEE_PROXY_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const TIMEOUT_MS = 3000;

async function main() {
  console.log(`Checking for a local Bee developer proxy at ${baseUrl} ...`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/v1/facts`, { signal: controller.signal });
    if (!response.ok) {
      console.error(`Bee proxy responded with HTTP ${response.status} ${response.statusText}.`);
      process.exitCode = 1;
      return;
    }
    console.log("Bee proxy is reachable. (This check only confirmed an HTTP status; no data was read.)");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `Could not reach the Bee proxy at ${baseUrl}.\n` +
        `Run "bee login" once, then "bee proxy" in a separate terminal, and try again.\n` +
        `(${detail})`,
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

await main();
