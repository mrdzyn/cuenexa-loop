export interface LoopConfig {
  /** Base URL of the local Bee proxy started via `bee proxy`. */
  beeProxyUrl: string;
  /** Max items printed per category, to keep console output small and deliberate. */
  maxItemsPerCategory: number;
}

const DEFAULT_BEE_PROXY_URL = "http://127.0.0.1:8787";
const DEFAULT_MAX_ITEMS = 5;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoopConfig {
  const beeProxyUrl = env.BEE_PROXY_URL?.trim() || DEFAULT_BEE_PROXY_URL;

  const maxItemsRaw = env.LOOP_MAX_ITEMS?.trim();
  const parsedMaxItems = maxItemsRaw ? Number.parseInt(maxItemsRaw, 10) : NaN;
  const maxItemsPerCategory =
    Number.isFinite(parsedMaxItems) && parsedMaxItems > 0 ? parsedMaxItems : DEFAULT_MAX_ITEMS;

  return { beeProxyUrl, maxItemsPerCategory };
}
