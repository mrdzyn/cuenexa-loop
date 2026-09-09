import type { BeeClient } from "@beeai/cli/lib";
import { describe, expect, it, vi } from "vitest";
import { BeeAdapterClient } from "../bee-client.js";
import { BeeAuthenticationError, BeeCliUnavailableError, BeeCommandError, BeeMalformedResponseError } from "../errors.js";
import {
  syntheticConversation,
  syntheticConversationDetailResponse,
  syntheticConversationListResponse,
  syntheticEmptyFactListResponse,
  syntheticEmptyTodoListResponse,
  syntheticFactListResponse,
  syntheticTodoListResponse,
} from "../fixtures/synthetic-bee-data.js";

/** A fully-shaped fake of the official BeeClient, so tests only override what they exercise. */
function makeFakeBeeClient(overrides: Partial<BeeClient> = {}): BeeClient {
  const notImplemented = () => Promise.reject(new Error("not implemented in this fake"));
  return {
    auth: {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getProfile: notImplemented,
      login: notImplemented,
      logout: notImplemented,
    },
    api: {
      me: notImplemented,
      today: notImplemented,
      now: notImplemented,
      changed: notImplemented,
      version: notImplemented,
      facts: {
        list: vi.fn().mockResolvedValue(syntheticFactListResponse),
        get: notImplemented,
        create: notImplemented,
        update: notImplemented,
        confirm: notImplemented,
        delete: notImplemented,
      },
      todos: {
        list: vi.fn().mockResolvedValue(syntheticTodoListResponse),
        get: notImplemented,
        create: notImplemented,
        update: notImplemented,
        delete: notImplemented,
      },
      conversations: {
        list: vi.fn().mockResolvedValue(syntheticConversationListResponse),
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

describe("BeeAdapterClient.ensureAuthenticated", () => {
  it("resolves when Bee reports an authenticated session", async () => {
    const client = new BeeAdapterClient({ client: makeFakeBeeClient() });
    await expect(client.ensureAuthenticated()).resolves.toBeUndefined();
  });

  it("throws BeeAuthenticationError when Bee reports no session", async () => {
    const fake = makeFakeBeeClient();
    fake.auth.isAuthenticated = vi.fn().mockResolvedValue(false);
    const client = new BeeAdapterClient({ client: fake });

    await expect(client.ensureAuthenticated()).rejects.toBeInstanceOf(BeeAuthenticationError);
  });
});

describe("BeeAdapterClient list methods", () => {
  it("unwraps a wrapped conversations list response and preserves next_cursor", async () => {
    const client = new BeeAdapterClient({ client: makeFakeBeeClient() });

    const page = await client.listConversations();

    expect(page.items).toEqual([syntheticConversation]);
    expect(page.nextCursor).toBe("cursor_synthetic_conversations_002");
  });

  it("treats an empty facts list as a legitimate successful response", async () => {
    const fake = makeFakeBeeClient();
    fake.api.facts.list = vi.fn().mockResolvedValue(syntheticEmptyFactListResponse);
    const client = new BeeAdapterClient({ client: fake });

    const page = await client.listFacts();

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("treats an empty todos list as a legitimate successful response", async () => {
    const fake = makeFakeBeeClient();
    fake.api.todos.list = vi.fn().mockResolvedValue(syntheticEmptyTodoListResponse);
    const client = new BeeAdapterClient({ client: fake });

    const page = await client.listTodos();

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("BeeAdapterClient.getConversation", () => {
  it("unwraps a conversation-detail response wrapped under a 'conversation' key", async () => {
    const client = new BeeAdapterClient({ client: makeFakeBeeClient() });

    const conversation = await client.getConversation("conv_synthetic_001");

    // Regression guard: must return the actual conversation, not the { conversation: {...} } wrapper.
    expect(conversation).toEqual(syntheticConversation);
    expect(conversation).not.toHaveProperty("conversation");
  });

  it("returns a bare (unwrapped) conversation response as-is", async () => {
    const fake = makeFakeBeeClient();
    fake.api.conversations.get = vi.fn().mockResolvedValue(syntheticConversation);
    const client = new BeeAdapterClient({ client: fake });

    const conversation = await client.getConversation("conv_synthetic_001");

    expect(conversation).toEqual(syntheticConversation);
  });
});

describe("BeeAdapterClient error classification", () => {
  it("wraps an ENOENT spawn failure in BeeCliUnavailableError", async () => {
    const fake = makeFakeBeeClient();
    const enoent = Object.assign(new Error("spawn bee ENOENT"), { code: "ENOENT" });
    fake.api.facts.list = vi.fn().mockRejectedValue(enoent);
    const client = new BeeAdapterClient({ client: fake });

    await expect(client.listFacts()).rejects.toBeInstanceOf(BeeCliUnavailableError);
  });

  it("wraps a JSON parse failure in BeeMalformedResponseError", async () => {
    const fake = makeFakeBeeClient();
    fake.api.todos.list = vi.fn().mockRejectedValue(new Error("Failed to parse Bee CLI JSON output: Unexpected token"));
    const client = new BeeAdapterClient({ client: fake });

    await expect(client.listTodos()).rejects.toBeInstanceOf(BeeMalformedResponseError);
  });

  it("wraps a generic non-zero exit in BeeCommandError", async () => {
    const fake = makeFakeBeeClient();
    fake.api.conversations.list = vi.fn().mockRejectedValue(new Error("Bee CLI exited with code 1."));
    const client = new BeeAdapterClient({ client: fake });

    await expect(client.listConversations()).rejects.toBeInstanceOf(BeeCommandError);
  });

  it("never includes raw error detail in the thrown message", async () => {
    const fake = makeFakeBeeClient();
    fake.api.conversations.list = vi.fn().mockRejectedValue(new Error("super secret stderr contents"));
    const client = new BeeAdapterClient({ client: fake });

    const error = await client.listConversations().catch((e: unknown) => e);
    expect((error as Error).message).not.toContain("super secret stderr contents");
  });
});
