import { describe, expect, it } from "vitest";
import { LoopStore } from "@cuenexa-loop/loop-store";
import { loadNotificationPlan } from "../notification-orchestration.js";

const NOW = "2026-08-01T12:00:00.000Z";

describe("notification preview and delivery orchestration", () => {
  it("preview does not mutate the ledger and delivered triggers disappear on exact rerun", () => {
    const store = new LoopStore({ path: ":memory:" });
    const database = (store as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
    database.prepare("INSERT INTO loop_threads VALUES (?, 'open', NULL, ?, ?, ?, ?, NULL)")
      .run("thread_synthetic", "2026-08-01T13:00:00.000Z", NOW, NOW, NOW);
    const preview = loadNotificationPlan(store, NOW);
    expect(preview.candidates).toHaveLength(1);
    expect(store.listNotificationDeliveries()).toEqual([]);
    store.recordNotificationDeliveries(preview.candidates.map((candidate) => ({
      id: candidate.id, threadId: candidate.thread.id, type: candidate.type, triggerKey: candidate.triggerKey,
    })), NOW);
    expect(loadNotificationPlan(store, NOW).candidates).toEqual([]);
    store.close();
  });
});
