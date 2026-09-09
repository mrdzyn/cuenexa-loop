import type { BeeClient } from "@beeai/cli/lib";
import { describe, expect, it, vi } from "vitest";
import { BeeAdapterClient } from "../bee-client.js";
import {
  syntheticConversation,
  syntheticConversationDetailResponse,
  syntheticConversationSummary,
  syntheticConversationSummaryListResponse,
  syntheticEmptyFactListResponse,
  syntheticEmptyTodoListResponse,
} from "../fixtures/synthetic-bee-data.js";
import { fetchBeeSnapshot, fetchDetectionSnapshot } from "../service.js";

function makeFakeBeeClient(overrides: Partial<BeeClient> = {}): BeeClient {
  const notImplemented = () => Promise.reject(new Error("not implemented in this fake"));
  return {
    auth: { getProfile: notImplemented, isAuthenticated: notImplemented, login: notImplemented, logout: notImplemented },
    api: {
      me: notImplemented,
      today: notImplemented,
      now: notImplemented,
      changed: notImplemented,
      version: notImplemented,
      facts: {
        list: vi.fn().mockResolvedValue(syntheticEmptyFactListResponse),
        get: notImplemented,
        create: notImplemented,
        update: notImplemented,
        confirm: notImplemented,
        delete: notImplemented,
      },
      todos: {
        list: vi.fn().mockResolvedValue(syntheticEmptyTodoListResponse),
        get: notImplemented,
        create: notImplemented,
        update: notImplemented,
        delete: notImplemented,
      },
      conversations: {
        list: vi.fn().mockResolvedValue(syntheticConversationSummaryListResponse),
        get: vi.fn().mockResolvedValue(syntheticConversationDetailResponse),
      },
      daily: { list: notImplemented, get: notImplemented },
      journals: { list: notImplemented, get: notImplemented },
      search: notImplemented,
    },
    sse: {
      streamJson: () => {
        throw new Error("not implemented in this fake");
      },
    },
    run: notImplemented,
    runJson: notImplemented,
    ...overrides,
  } as unknown as BeeClient;
}

describe("fetchBeeSnapshot (list-only, unchanged by hydration work)", () => {
  it("never calls conversations.get — it stays list-only", async () => {
    const fake = makeFakeBeeClient();
    const client = new BeeAdapterClient({ client: fake });

    const snapshot = await fetchBeeSnapshot(client);

    expect(fake.api.conversations.get).not.toHaveBeenCalled();
    // The list-only summary has no transcriptions, so utterances stay empty — this is the exact
    // gap fetchDetectionSnapshot exists to close.
    expect(snapshot.conversations[0]?.utterances).toEqual([]);
  });
});

describe("fetchDetectionSnapshot (hydrates full conversation detail)", () => {
  it("hydrates a listed (summary-only) conversation into one with populated utterances", async () => {
    const fake = makeFakeBeeClient();
    const client = new BeeAdapterClient({ client: fake });

    const snapshot = await fetchDetectionSnapshot(client);

    expect(fake.api.conversations.get).toHaveBeenCalledWith(String(syntheticConversationSummary.id));
    expect(snapshot.conversations).toHaveLength(1);
    expect(snapshot.conversations[0]?.utterances.length).toBeGreaterThan(0);
    expect(snapshot.conversations[0]?.utterances[0]?.text).toBe(
      syntheticConversation.transcriptions?.[0]?.utterances?.[0]?.text,
    );
  });

  it("preserves the list call's pagination cursor", async () => {
    const fake = makeFakeBeeClient();
    const client = new BeeAdapterClient({ client: fake });

    const snapshot = await fetchDetectionSnapshot(client);

    expect(snapshot.pagination.conversations.nextCursor).toBe(syntheticConversationSummaryListResponse.next_cursor);
  });

  it("falls back to summary-only data (with a warning) when detail fetch throws, rather than dropping the conversation", async () => {
    const fake = makeFakeBeeClient();
    fake.api.conversations.get = vi.fn().mockRejectedValue(new Error("Bee CLI exited with code 1."));
    const client = new BeeAdapterClient({ client: fake });

    const snapshot = await fetchDetectionSnapshot(client);

    expect(snapshot.conversations).toHaveLength(1);
    expect(snapshot.conversations[0]?.utterances).toEqual([]);
    expect(snapshot.warnings.some((w) => w.field === "conversation" && w.message.includes("Failed to fetch full detail"))).toBe(
      true,
    );
  });

  it("falls back to summary-only data (with a warning) when detail fetch returns nothing", async () => {
    const fake = makeFakeBeeClient();
    fake.api.conversations.get = vi.fn().mockResolvedValue(null);
    const client = new BeeAdapterClient({ client: fake });

    const snapshot = await fetchDetectionSnapshot(client);

    expect(snapshot.conversations).toHaveLength(1);
    expect(snapshot.warnings.some((w) => w.field === "conversation" && w.message.includes("no detail"))).toBe(true);
  });

  it("never includes raw transcript/summary content in a hydration warning message", async () => {
    const fake = makeFakeBeeClient();
    fake.api.conversations.get = vi.fn().mockRejectedValue(new Error("boom"));
    const client = new BeeAdapterClient({ client: fake });

    const snapshot = await fetchDetectionSnapshot(client);

    for (const warning of snapshot.warnings) {
      expect(warning.message).not.toContain(syntheticConversation.short_summary);
    }
  });

  it("hydrates multiple conversations with bounded concurrency without dropping any", async () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      ...syntheticConversationSummary,
      id: `conv_synthetic_${index}`,
    }));
    const fake = makeFakeBeeClient();
    fake.api.conversations.list = vi.fn().mockResolvedValue({ conversations: many, next_cursor: null });
    fake.api.conversations.get = vi.fn(async (id: string) => ({
      conversation: { ...syntheticConversation, id },
    })) as unknown as BeeClient["api"]["conversations"]["get"];
    const client = new BeeAdapterClient({ client: fake });

    const snapshot = await fetchDetectionSnapshot(client, { concurrency: 2 });

    expect(snapshot.conversations).toHaveLength(7);
    expect(fake.api.conversations.get).toHaveBeenCalledTimes(7);
    for (const conversation of snapshot.conversations) {
      expect(conversation.utterances.length).toBeGreaterThan(0);
    }
  });
});
