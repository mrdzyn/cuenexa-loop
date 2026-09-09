export interface CliArgs {
  /** Deliberate opt-in to print redacted/truncated conversational content instead of the default connectivity report. */
  includeContent: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  return { includeContent: argv.includes("--include-content") };
}
