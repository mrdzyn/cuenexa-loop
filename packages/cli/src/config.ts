export interface LoopConfig {
  /** Max items printed per category in --include-content mode, to keep opted-in output deliberate. */
  maxItemsPerCategory: number;
}

const DEFAULT_MAX_ITEMS = 5;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoopConfig {
  const maxItemsRaw = env.LOOP_MAX_ITEMS?.trim();
  const parsedMaxItems = maxItemsRaw ? Number.parseInt(maxItemsRaw, 10) : NaN;
  const maxItemsPerCategory =
    Number.isFinite(parsedMaxItems) && parsedMaxItems > 0 ? parsedMaxItems : DEFAULT_MAX_ITEMS;

  return { maxItemsPerCategory };
}
