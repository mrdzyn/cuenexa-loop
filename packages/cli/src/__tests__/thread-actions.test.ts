import { describe, expect, it } from "vitest";
import { LoopStore } from "@cuenexa-loop/loop-store";
import { executeThreadAction, parseThreadActionArgs } from "../thread-actions.js";

const NOW = "2026-08-01T12:00:00.000Z";

function createThread(store: LoopStore): string {
  const database = (store as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
  database.prepare("INSERT INTO loop_threads VALUES (?, 'open', NULL, NULL, ?, ?, ?, NULL)")
    .run("thread_synthetic", NOW, NOW, NOW);
  return "thread_synthetic";
}

describe("Phase 3 action CLI parsing and execution", () => {
  it.each(["ack", "unsnooze", "pin", "unpin", "dismiss", "restore"] as const)("parses and executes %s", (action) => {
    const store = new LoopStore({ path: ":memory:" });
    const threadId = createThread(store);
    const result = executeThreadAction(store, parseThreadActionArgs([action, threadId], NOW), NOW);
    expect(result).toMatchObject({ action, threadId });
    expect(store.getThread(threadId)?.state).toBe("open");
    store.close();
  });

  it("parses exact and relative snoozes deterministically", () => {
    expect(parseThreadActionArgs(["snooze", "thread_synthetic", "--until", "2026-08-01T14:00:00.000Z"], NOW).snoozedUntil)
      .toBe("2026-08-01T14:00:00.000Z");
    expect(parseThreadActionArgs(["snooze", "thread_synthetic", "--for", "2h"], NOW).snoozedUntil)
      .toBe("2026-08-01T14:00:00.000Z");
    expect(parseThreadActionArgs(["snooze", "thread_synthetic", "--until", "2026-08-01T22:00:00+08:00"], NOW).snoozedUntil)
      .toBe("2026-08-01T14:00:00.000Z");
  });

  it("executes snooze without changing source lifecycle", () => {
    const store = new LoopStore({ path: ":memory:" });
    const threadId = createThread(store);
    const request = parseThreadActionArgs(["snooze", threadId, "--for", "15m"], NOW);
    expect(executeThreadAction(store, request, NOW).snoozedUntil).toBe("2026-08-01T12:15:00.000Z");
    expect(store.getThread(threadId)?.state).toBe("open");
    store.close();
  });

  it.each([
    { args: [] }, { args: ["unknown", "thread_synthetic"] }, { args: ["pin"] },
    { args: ["pin", "invalid"] }, { args: ["pin", "thread_synthetic", "--extra"] },
    { args: ["snooze", "thread_synthetic"] },
    { args: ["snooze", "thread_synthetic", "--until", "2026-08-01T14:00:00.000Z", "--for", "2h"] },
    { args: ["snooze", "thread_synthetic", "--for", "soon"] },
    { args: ["snooze", "thread_synthetic", "--for", "366d"] },
    { args: ["snooze", "thread_synthetic", "--until", "not-a-date"] },
    { args: ["snooze", "thread_synthetic", "--until", "2026-08-01T11:00:00.000Z"] },
  ])("rejects malformed arguments: $args", ({ args }) => {
    expect(() => parseThreadActionArgs(args, NOW)).toThrow();
  });
});
