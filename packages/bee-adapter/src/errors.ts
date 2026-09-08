/**
 * Thrown when the Bee proxy could not be reached at all — most commonly
 * because `bee proxy` isn't running locally. Kept distinct from
 * BeeResponseError so callers (e.g. the CLI) can print actionable, specific
 * guidance instead of a generic network error.
 */
export class BeeConnectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "BeeConnectionError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** Thrown when the Bee proxy responded, but with a non-2xx HTTP status. */
export class BeeResponseError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BeeResponseError";
    this.status = status;
  }
}
