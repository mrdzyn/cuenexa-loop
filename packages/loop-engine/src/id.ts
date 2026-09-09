let counter = 0;

/** Deterministic-enough Loop item id; uniqueness only needs to hold within a single detection run. */
export function nextLoopItemId(): string {
  counter += 1;
  return `loop-item-${Date.now().toString(36)}-${counter}`;
}
