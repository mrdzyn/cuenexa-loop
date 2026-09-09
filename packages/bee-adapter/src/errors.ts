/** Base class for every error this adapter throws, so callers can catch just one type if they want. */
export abstract class BeeAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The `bee` executable itself could not be found or launched (e.g. the
 * subprocess spawn failed with ENOENT). Distinct from an authenticated-but-
 * failing command so the CLI can point the user at installing Bee, not at
 * `bee login`.
 */
export class BeeCliUnavailableError extends BeeAdapterError {}

/**
 * `bee` ran, but there is no authenticated session. CueNexa Loop never
 * handles Bee credentials itself — this only tells the user to run
 * `bee login`.
 */
export class BeeAuthenticationError extends BeeAdapterError {}

/** `bee` launched but exited non-zero for a reason other than authentication. */
export class BeeCommandError extends BeeAdapterError {}

/**
 * `bee` exited zero but its stdout was not valid JSON, or a list response's
 * JSON was valid but didn't match any recognized shape (see
 * `pagination.ts`) — either way, something CueNexa Loop cannot safely
 * interpret came back from Bee.
 */
export class BeeMalformedResponseError extends BeeAdapterError {}

/**
 * Classifies an error thrown by the underlying `@beeai/cli/lib` runner for
 * an ordinary data call (listing/fetching conversations, facts, todos)
 * into one of the errors above, without ever including raw stdout/stderr
 * content in the resulting message — only Bee's own exit-code-driven
 * failure text, which the CLI's error renderer discards anyway in favor of
 * a fixed, actionable message per error type.
 */
export function classifyBeeError(error: unknown, action: string): BeeAdapterError {
  if (isEnoent(error)) {
    return new BeeCliUnavailableError(`Bee CLI not found while ${action}.`);
  }

  if (isMalformedJsonError(error)) {
    return new BeeMalformedResponseError(`Bee CLI returned malformed JSON while ${action}.`);
  }

  return new BeeCommandError(`Bee CLI command failed while ${action}.`);
}

/**
 * Classifies a failure from Bee's own profile/identity check specifically
 * (used for the authentication preflight — see `BeeAdapterClient.
 * ensureAuthenticated`). This exists because `@beeai/cli/lib`'s own
 * `auth.isAuthenticated()` helper wraps that same profile check in a bare
 * try/catch and collapses every failure — CLI missing, malformed output,
 * *and* "not logged in" — into a single `false`, making it impossible to
 * tell "Bee CLI isn't installed" apart from "you haven't run bee login".
 * `ensureAuthenticated()` calls the underlying profile check directly
 * (bypassing that collapsing wrapper) and classifies the raw failure here:
 * ENOENT and malformed-JSON are distinguished exactly as
 * `classifyBeeError` would, but any other failure is treated as "not
 * authenticated" — which mirrors what `isAuthenticated()` itself assumes
 * internally, while preserving the two distinctions it throws away.
 */
export function classifyAuthError(error: unknown): BeeAdapterError {
  if (isEnoent(error)) {
    return new BeeCliUnavailableError("Bee CLI not found while checking authentication.");
  }

  if (isMalformedJsonError(error)) {
    return new BeeMalformedResponseError("Bee CLI returned malformed JSON while checking authentication.");
  }

  return new BeeAuthenticationError("Bee CLI reported no authenticated session.");
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isMalformedJsonError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("Failed to parse Bee CLI JSON output");
}
