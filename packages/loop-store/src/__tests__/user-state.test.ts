import { describe, expect, it } from "vitest";
import { LoopStore } from "../store.js";
import { seedThread, TEST_NOW } from "./synthetic.js";

const LATER = "2026-01-01T13:00:00.000Z";

describe("local Loop user state", () => {
  it("acknowledges independently and accepts a later acknowledgement", () => {
    const store = new LoopStore({ path: ":memory:" });
    const id = seedThread(store);
    expect(store.acknowledgeThread(id, TEST_NOW).changed).toBe(true);
    expect(store.acknowledgeThread(id, LATER).state.acknowledgedAt).toBe(LATER);
    expect(store.getThread(id)?.state).toBe("open");
    expect(store.listEvents()).toHaveLength(1);
    store.close();
  });

  it("pins and unpins idempotently without changing source lifecycle", () => {
    const store = new LoopStore({ path: ":memory:" });
    const id = seedThread(store, "waiting");
    expect(store.pinThread(id, TEST_NOW).changed).toBe(true);
    expect(store.pinThread(id, LATER).changed).toBe(false);
    expect(store.unpinThread(id, LATER).state.pinned).toBe(false);
    expect(store.unpinThread(id, LATER).changed).toBe(false);
    expect(store.getThread(id)?.state).toBe("waiting");
    store.close();
  });

  it("snoozes to an exact bounded instant and unsnoozes safely", () => {
    const store = new LoopStore({ path: ":memory:" });
    const id = seedThread(store);
    expect(store.snoozeThread(id, LATER, TEST_NOW).state.snoozedUntil).toBe(LATER);
    expect(store.unsnoozeThread(id, LATER).state.snoozedUntil).toBeNull();
    expect(store.unsnoozeThread(id, LATER).changed).toBe(false);
    expect(store.getThread(id)?.state).toBe("open");
    store.close();
  });

  it("rejects malformed, expired, too-short and overlong snoozes", () => {
    const store = new LoopStore({ path: ":memory:" });
    const id = seedThread(store);
    expect(() => store.snoozeThread(id, "not-a-date", TEST_NOW)).toThrow("Invalid snooze timestamp");
    expect(() => store.snoozeThread(id, "2026-01-01T11:00:00.000Z", TEST_NOW)).toThrow("between 1 minute");
    expect(() => store.snoozeThread(id, "2026-01-01T12:00:30.000Z", TEST_NOW)).toThrow("between 1 minute");
    expect(() => store.snoozeThread(id, "2027-01-02T12:00:00.000Z", TEST_NOW)).toThrow("365 days");
    store.close();
  });

  it("dismisses and restores idempotently without resolving or deleting history", () => {
    const store = new LoopStore({ path: ":memory:" });
    const id = seedThread(store);
    expect(store.dismissThread(id, TEST_NOW).state.dismissedAt).toBe(TEST_NOW);
    expect(store.restoreThread(id, LATER).state.dismissedAt).toBeNull();
    expect(store.restoreThread(id, LATER).changed).toBe(false);
    expect(store.getThread(id)?.state).toBe("open");
    expect(store.listEvents()).toHaveLength(1);
    store.close();
  });

  it("rejects unknown thread ids without interpolating them into SQL", () => {
    const store = new LoopStore({ path: ":memory:" });
    expect(() => store.pinThread("thread_unknown'; DROP TABLE loop_threads;--", TEST_NOW)).toThrow("Unknown local Loop thread ID");
    expect(store.listThreads()).toEqual([]);
    store.close();
  });

  it("cascades user state when retention legitimately deletes the thread", () => {
    const store = new LoopStore({ path: ":memory:", retentionDays: 30 });
    const id = seedThread(store, "resolved");
    store.pinThread(id, TEST_NOW);
    expect(store.purgeResolved("2026-02-02T12:00:00.000Z")).toBe(1);
    expect(store.getThread(id)).toBeNull();
    expect(() => store.getThreadUserState(id)).toThrow("Unknown local Loop thread ID");
    store.close();
  });
});
