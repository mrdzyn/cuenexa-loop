export function isValidTimeZone(candidate: string): boolean {
  try {
    void new Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

export function resolveHostTimeZone(options: {
  readonly beeTimeZone: string | null;
  readonly env?: NodeJS.ProcessEnv;
  readonly systemTimeZone?: () => string;
}): string {
  const env = options.env ?? process.env;
  const override = env.LOOP_TIMEZONE?.trim();
  if (override && isValidTimeZone(override)) {
    return override;
  }
  if (options.beeTimeZone && isValidTimeZone(options.beeTimeZone)) {
    return options.beeTimeZone;
  }
  const fallback = options.systemTimeZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  return fallback();
}
