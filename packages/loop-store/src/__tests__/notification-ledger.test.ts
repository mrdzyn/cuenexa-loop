import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LoopStore, resetLoopStore } from "../store.js";
import { seedThread, TEST_NOW } from "./synthetic.js";

describe("notification delivery ledger", () => {
  it("persists one structural delivery across reopen and rejects exact duplicate delivery", () => {
    const directory = mkdtempSync(join(tmpdir(), "cuenexa-notification-ledger-"));
    const path = join(directory, "state.sqlite");
    const store = new LoopStore({ path });
    const threadId = seedThread(store);
    const input = { id: "notification_synthetic", threadId, type: "new_activity" as const, triggerKey: "event:event_synthetic" };
    expect(store.recordNotificationDeliveries([input], TEST_NOW)).toBe(1);
    expect(store.hasNotificationDelivery(threadId, input.type, input.triggerKey)).toBe(true);
    expect(store.recordNotificationDeliveries([input], "2026-01-01T13:00:00.000Z")).toBe(0);
    store.close();

    const reopened = new LoopStore({ path });
    expect(reopened.listNotificationDeliveries()).toEqual([{
      id: input.id, threadId, type: input.type, triggerKey: input.triggerKey, deliveredAt: TEST_NOW,
    }]);
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("cascades deliveries when retention deletes their thread", () => {
    const store = new LoopStore({ path: ":memory:", retentionDays: 30 });
    const threadId = seedThread(store, "resolved");
    store.recordNotificationDeliveries([{
      id: "notification_synthetic", threadId, type: "reopened", triggerKey: "event:event_synthetic",
    }], TEST_NOW);
    store.purgeResolved("2026-02-02T12:00:00.000Z");
    expect(store.listNotificationDeliveries()).toEqual([]);
    store.close();
  });

  it("reset erases Phase 3 user state and notification ledger with the local database", () => {
    const directory = mkdtempSync(join(tmpdir(), "cuenexa-phase3-reset-"));
    const path = join(directory, "state.sqlite");
    const store = new LoopStore({ path });
    const threadId = seedThread(store);
    store.pinThread(threadId, TEST_NOW);
    store.recordNotificationDeliveries([{
      id: "notification_reset", threadId, type: "new_activity", triggerKey: "event:event_reset",
    }], TEST_NOW);
    store.close();
    expect(resetLoopStore(path)).toBe(true);
    const fresh = new LoopStore({ path });
    expect(fresh.listThreads()).toEqual([]);
    expect(fresh.listThreadUserStates()).toEqual([]);
    expect(fresh.listNotificationDeliveries()).toEqual([]);
    fresh.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
