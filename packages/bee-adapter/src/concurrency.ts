/**
 * Maps `items` through `fn`, running at most `limit` calls concurrently.
 * Used to hydrate multiple conversations' full detail without firing one
 * request per conversation simultaneously (unbounded) or serially (slow).
 * Preserves input order in the result regardless of completion order.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index] as T;
      results[index] = await fn(item, index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
