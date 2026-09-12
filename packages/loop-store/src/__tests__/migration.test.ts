import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createStableMemberIdentity } from "@cuenexa-loop/loop-engine";
import { LoopStore } from "../store.js";
import { syntheticItem, syntheticLoop, TEST_NOW } from "./synthetic.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("schema v1 to v2 migration", () => {
  it("preserves Phase 2 state, enables user state, reopens after expansion, and reruns idempotently", () => {
    const directory = mkdtempSync(join(tmpdir(), "cuenexa-loop-v1-"));
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const a = syntheticItem("a"); const b = syntheticItem("b"); const c = syntheticItem("c");
    const original = syntheticLoop([a, b], "resolved");
    createVersionOneDatabase(path, original.id, [createStableMemberIdentity(a), createStableMemberIdentity(b)]);

    const migrated = new LoopStore({ path });
    expect(migrated.listThreads()[0]).toMatchObject({ id: "thread_synthetic_v1", state: "resolved" });
    expect(migrated.listEvents()[0]).toMatchObject({ id: "event_synthetic_v1", type: "resolved" });
    expect(migrated.pinThread("thread_synthetic_v1", TEST_NOW).state.pinned).toBe(true);
    expect(migrated.recordNotificationDeliveries([{
      id: "notification_migrated", threadId: "thread_synthetic_v1", type: "reopened", triggerKey: "event:event_synthetic_v1",
    }], TEST_NOW)).toBe(1);
    const reopened = migrated.reconcile({
      loops: [syntheticLoop([a, b, c], "open")],
      observedAt: "2026-01-02T12:00:00.000Z",
      complete: true,
    });
    expect(reopened.threads[0]?.id).toBe("thread_synthetic_v1");
    expect(reopened.events.map((event) => event.type)).toContain("reopened");
    migrated.close();

    const reopenedDatabase = new LoopStore({ path });
    expect(reopenedDatabase.getThreadUserState("thread_synthetic_v1").pinned).toBe(true);
    expect(reopenedDatabase.listNotificationDeliveries()).toHaveLength(1);
    expect(reopenedDatabase.listThreads()).toHaveLength(1);
    reopenedDatabase.close();

    const raw = new DatabaseSync(path);
    expect((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(2);
    raw.close();
  });
});

function createVersionOneDatabase(path: string, snapshotLoopId: string, members: string[]): void {
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE loop_threads (
      thread_id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('open', 'waiting', 'resolved')),
      title TEXT, due_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      last_observed_at TEXT NOT NULL, resolved_at TEXT
    );
    CREATE TABLE loop_snapshot_loops (
      snapshot_loop_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
      first_observed_at TEXT NOT NULL, last_observed_at TEXT NOT NULL
    );
    CREATE TABLE loop_thread_members (
      thread_id TEXT NOT NULL REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
      member_identity TEXT NOT NULL, first_observed_at TEXT NOT NULL, last_observed_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, member_identity)
    );
    CREATE TABLE loop_events (
      event_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES loop_threads(thread_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, observed_at TEXT NOT NULL, details_json TEXT NOT NULL
    );
    PRAGMA user_version = 1;
  `);
  database.prepare("INSERT INTO loop_threads VALUES (?, 'resolved', ?, NULL, ?, ?, ?, ?)")
    .run("thread_synthetic_v1", "Synthetic project", TEST_NOW, TEST_NOW, TEST_NOW, TEST_NOW);
  database.prepare("INSERT INTO loop_snapshot_loops VALUES (?, ?, ?, ?)")
    .run(snapshotLoopId, "thread_synthetic_v1", TEST_NOW, TEST_NOW);
  for (const member of members) {
    database.prepare("INSERT INTO loop_thread_members VALUES (?, ?, ?, ?)")
      .run("thread_synthetic_v1", member, TEST_NOW, TEST_NOW);
  }
  database.prepare("INSERT INTO loop_events VALUES (?, ?, 'resolved', ?, ?)")
    .run("event_synthetic_v1", "thread_synthetic_v1", TEST_NOW, "{\"state\":\"resolved\"}");
  database.close();
}
