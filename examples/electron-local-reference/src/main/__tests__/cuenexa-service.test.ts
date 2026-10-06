import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BeeAdapterClient,
  BeeAuthenticationError,
  BeeCliUnavailableError,
  type CompleteDetectionSnapshot,
} from "@cuenexa-loop/bee-adapter";
import { createStableLoopId, type Loop, type LoopCorrelationResult, type LoopItem } from "@cuenexa-loop/loop-engine";
import { LoopStore } from "@cuenexa-loop/loop-store";
import { CueNexaService, resolveElectronStorePath, type CorrelateFn } from "../cuenexa-service.js";
import { dtoContainsProhibitedContent } from "../dto.js";

const NOW = "2026-10-06T12:00:00.000Z";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempStore(): LoopStore {
  const directory = mkdtempSync(join(tmpdir(), "cuenexa-electron-ref-"));
  directories.push(directory);
  return new LoopStore({ path: join(directory, "state.sqlite") });
}

function fakeClient(ensureAuthenticated: BeeAdapterClient["ensureAuthenticated"]): BeeAdapterClient {
  return { ensureAuthenticated } as BeeAdapterClient;
}

function emptySnapshot(overrides: Partial<CompleteDetectionSnapshot> = {}): CompleteDetectionSnapshot {
  return {
    complete: true,
    snapshot: {
      conversations: [],
      facts: [],
      todos: [],
      warnings: [],
      pagination: {
        conversations: { nextCursor: null },
        facts: { nextCursor: null },
        todos: { nextCursor: null },
      },
    },
    ...overrides,
  };
}

function item(id: string, conversationId: string): LoopItem {
  return {
    id,
    type: "commitment",
    text: "Synthetic private item",
    state: "open",
    confidence: 0.95,
    owner: null,
    counterparties: [],
    dueAt: null,
    dueAtPhrase: null,
    source: { provider: "test", conversationId, factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: conversationId, text: "SECRET_UTTERANCE_TEXT" }],
    createdAt: NOW,
    resolvedAt: null,
  };
}

function loopFrom(items: LoopItem[]): Loop {
  return {
    id: createStableLoopId(items),
    title: "Apollo Partner Security Review",
    state: "open",
    members: items.map((entry) => ({ itemId: entry.id, item: entry })),
    timeline: items.map((entry, sequence) => ({
      itemId: entry.id,
      source: entry.source,
      occurredAt: null,
      timestampSource: "unavailable",
      sequence,
    })),
    correlationLinks: [
      {
        fromItemId: items[0]!.id,
        toItemId: items[1]!.id,
        confidence: 0.95,
        reasonCodes: ["shared_specific_anchor_phrase"],
        sharedSpecificAnchorCount: 2,
      },
    ],
    correlationConfidence: 0.95,
    snapshot: { observedAt: NOW, completeness: "complete" },
    resolvedAt: null,
  };
}

describe("CueNexaService authoritative path", () => {
  it("calls detection, correlation, and reconciliation in order", async () => {
    const store = tempStore();
    const service = new CueNexaService({
      client: fakeClient(async () => ({ timeZone: "Asia/Manila" })),
      store,
      fetchSnapshot: async () => emptySnapshot(),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    await service.sync();
    expect(service.getPipelineCalls()).toEqual([
      "ensureAuthenticated",
      "fetchCompleteDetectionSnapshot",
      "detectLoopItems",
      "correlateLoopItems",
      "reconcile",
      "buildReviewModel",
    ]);
    store.close();
  });

  it("does not mark a warning-bearing snapshot complete", async () => {
    const store = tempStore();
    const service = new CueNexaService({
      client: fakeClient(async () => ({ timeZone: "Asia/Manila" })),
      store,
      fetchSnapshot: async () =>
        emptySnapshot({
          complete: true,
          snapshot: {
            conversations: [],
            facts: [],
            todos: [],
            warnings: [{ field: "conversations", message: "page bound reached" }],
            pagination: {
              conversations: { nextCursor: "cursor" },
              facts: { nextCursor: null },
              todos: { nextCursor: null },
            },
          },
        }),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const snapshot = await service.sync();
    expect(snapshot.complete).toBe(false);
    store.close();
  });

  it("does not mark an incomplete fetch complete", async () => {
    const store = tempStore();
    const service = new CueNexaService({
      client: fakeClient(async () => ({ timeZone: "Asia/Manila" })),
      store,
      fetchSnapshot: async () => emptySnapshot({ complete: false }),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    expect((await service.sync()).complete).toBe(false);
    store.close();
  });

  it("returns sanitized DTOs without raw Bee objects", async () => {
    const store = tempStore();
    const candidate = loopFrom([item("item_a", "conv_a"), item("item_b", "conv_b")]);
    const service = new CueNexaService({
      client: fakeClient(async () => ({ timeZone: "Asia/Manila" })),
      store,
      fetchSnapshot: async () => emptySnapshot(),
      detect: () => ({ items: candidate.members.map((member) => member.item), warnings: [] }),
      correlate: (input): LoopCorrelationResult => ({
        loops: [{ ...candidate, snapshot: input.snapshot }],
        warnings: [],
        snapshot: input.snapshot,
      }),
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const snapshot = await service.sync();
    expect(snapshot.sections.needsAttention.length + snapshot.sections.dueNow.length).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain("SECRET_UTTERANCE_TEXT");
    expect(dtoContainsProhibitedContent(snapshot)).toBe(false);
    store.close();
  });

  it("preserves thread identity across store restart and does not duplicate unchanged input", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cuenexa-electron-ref-"));
    directories.push(directory);
    const dbPath = join(directory, "state.sqlite");
    const candidate = loopFrom([item("item_a", "conv_a"), item("item_b", "conv_b")]);
    const correlate: CorrelateFn = (input) => ({
      loops: [{ ...candidate, snapshot: input.snapshot }],
      warnings: [],
      snapshot: input.snapshot,
    });
    const firstStore = new LoopStore({ path: dbPath });
    const first = new CueNexaService({
      client: fakeClient(async () => ({ timeZone: "Asia/Manila" })),
      store: firstStore,
      fetchSnapshot: async () => emptySnapshot(),
      detect: () => ({ items: candidate.members.map((member) => member.item), warnings: [] }),
      correlate,
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const created = await first.sync();
    expect(created.changeCount).toBeGreaterThan(0);
    const firstId = [...created.sections.dueNow, ...created.sections.needsAttention, ...created.sections.waiting][0]?.id;
    expect(firstId).toBeTruthy();
    firstStore.close();

    const secondStore = new LoopStore({ path: dbPath });
    const second = new CueNexaService({
      client: fakeClient(async () => ({ timeZone: "Asia/Manila" })),
      store: secondStore,
      fetchSnapshot: async () => emptySnapshot(),
      detect: () => ({ items: candidate.members.map((member) => member.item), warnings: [] }),
      correlate,
      now: () => "2026-10-06T13:00:00.000Z",
      env: {},
      systemTimeZone: () => "UTC",
    });
    const repeated = await second.sync();
    const secondId = [...repeated.sections.dueNow, ...repeated.sections.needsAttention, ...repeated.sections.waiting][0]?.id;
    expect(secondId).toBe(firstId);
    expect(repeated.changeCount).toBe(0);
    secondStore.close();
  });

  it("maps Bee authentication failure to a sanitized error state", async () => {
    const store = tempStore();
    const service = new CueNexaService({
      client: fakeClient(async () => {
        throw new BeeAuthenticationError("raw profile payload must not leak");
      }),
      store,
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const status = await service.getStatus();
    expect(status.authenticated).toBe(false);
    expect(status.errorCode).toBe("unauthenticated");
    expect(JSON.stringify(status)).not.toContain("raw profile payload");
    const snapshot = await service.sync();
    expect(snapshot.errorCode).toBe("unauthenticated");
    expect(JSON.stringify(snapshot)).not.toContain("raw profile payload");
    store.close();
  });

  it("maps missing Bee CLI to bee_unavailable without leaking internals", async () => {
    const store = tempStore();
    const service = new CueNexaService({
      client: fakeClient(async () => {
        throw new BeeCliUnavailableError("ENOENT /secret/path/bee");
      }),
      store,
      now: () => NOW,
      env: {},
      systemTimeZone: () => "UTC",
    });
    const status = await service.getStatus();
    expect(status.beeAvailable).toBe(false);
    expect(status.errorCode).toBe("bee_unavailable");
    expect(JSON.stringify(status)).not.toContain("/secret/path");
    store.close();
  });
});

describe("resolveElectronStorePath", () => {
  it("uses an explicit override and otherwise an app-specific userData file", () => {
    expect(
      resolveElectronStorePath({
        userDataPath: "/tmp/Electron",
        env: { CUENEXA_LOOP_ELECTRON_DB_PATH: "/tmp/ref.sqlite" },
      }),
    ).toBe("/tmp/ref.sqlite");
    expect(resolveElectronStorePath({ userDataPath: "/tmp/Electron", env: {} })).toBe(
      "/tmp/Electron/cuenexa-loop-electron-reference.sqlite",
    );
  });
});
