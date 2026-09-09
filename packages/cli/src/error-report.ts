import { BeeAuthenticationError, BeeCliUnavailableError, BeeCommandError, BeeMalformedResponseError } from "@cuenexa-loop/bee-adapter";

/**
 * Renders a fixed, actionable, privacy-safe message per Bee failure mode.
 * Deliberately never includes the underlying error's message — Bee CLI
 * stderr/stdout could theoretically contain something unexpected, and this
 * codebase's rule is to never dump a raw response body or command output
 * to the console (see docs/SECURITY.md).
 */
export function renderBeeError(error: unknown): string {
  if (error instanceof BeeCliUnavailableError) {
    return [
      "CueNexa Loop could not access Bee.",
      "",
      "Verify that:",
      "1. Bee CLI is installed (npm install -g @beeai/cli).",
      "2. The `bee` command is on your PATH.",
    ].join("\n");
  }

  if (error instanceof BeeAuthenticationError) {
    return [
      "CueNexa Loop could not access Bee.",
      "",
      "Verify that:",
      "1. Bee CLI is installed.",
      "2. You have completed `bee login`.",
      "3. Your Bee session is valid.",
    ].join("\n");
  }

  if (error instanceof BeeCommandError) {
    return [
      "CueNexa Loop could not access Bee.",
      "",
      "The Bee CLI command failed. Verify that:",
      "1. Your Bee session is valid (run `bee status`).",
      "2. You are online and Bee's service is reachable.",
    ].join("\n");
  }

  if (error instanceof BeeMalformedResponseError) {
    return [
      "CueNexa Loop received an unexpected response from Bee.",
      "",
      "This may indicate a Bee CLI version mismatch. Verify that:",
      "1. @beeai/cli is up to date.",
    ].join("\n");
  }

  return "CueNexa Loop failed unexpectedly. Re-run with more context if the problem persists.";
}
