/**
 * Resolves the IANA time zone Loop detection's deadline resolver should
 * use, in priority order: an explicit `LOOP_TIMEZONE` override, then
 * Bee's own account time zone (from `ensureAuthenticated()`), then the
 * local system's IANA time zone as a last-resort, documented fallback.
 * Never silently assumes UTC. See docs/LOOP-DETECTION.md
 * ("Timezone-aware deadline resolution").
 */
export function resolveTimeZone(beeTimeZone: string | null, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.LOOP_TIMEZONE?.trim();
  if (override && isValidTimeZone(override)) {
    return override;
  }
  if (beeTimeZone && isValidTimeZone(beeTimeZone)) {
    return beeTimeZone;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function isValidTimeZone(candidate: string): boolean {
  try {
    // Intl throws RangeError for an unrecognized zone; constructed only to validate.
    void new Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}
