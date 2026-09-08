import { describe, expect, it, vi } from "vitest";
import { BeeProxyClient } from "../client.js";
import { BeeConnectionError, BeeResponseError } from "../errors.js";

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: { "content-type": "application/json" },
  });
}

describe("BeeProxyClient", () => {
  it("returns a bare array response as-is", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ id: "conv_1" }]));
    const client = new BeeProxyClient({ fetchImpl });

    const conversations = await client.listConversations();

    expect(conversations).toEqual([{ id: "conv_1" }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/conversations",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("unwraps a response wrapped under a named key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ facts: [{ id: "fact_1" }] }));
    const client = new BeeProxyClient({ fetchImpl });

    const facts = await client.listFacts();

    expect(facts).toEqual([{ id: "fact_1" }]);
  });

  it("returns an empty list when the shape is unrecognized, rather than throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }));
    const client = new BeeProxyClient({ fetchImpl });

    const todos = await client.listTodos();

    expect(todos).toEqual([]);
  });

  it("wraps a network failure in a BeeConnectionError with actionable guidance", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const client = new BeeProxyClient({ fetchImpl });

    await expect(client.listConversations()).rejects.toThrow(BeeConnectionError);
    await expect(client.listConversations()).rejects.toThrow(/bee proxy/i);
  });

  it("wraps a non-2xx response in a BeeResponseError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, { status: 500, statusText: "Internal Server Error" }));
    const client = new BeeProxyClient({ fetchImpl });

    const error = await client.listFacts().catch((e) => e);

    expect(error).toBeInstanceOf(BeeResponseError);
    expect((error as BeeResponseError).status).toBe(500);
  });

  it("uses a custom base URL when provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = new BeeProxyClient({ baseUrl: "http://127.0.0.1:9999/", fetchImpl });

    await client.listTodos();

    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:9999/v1/todos", expect.anything());
  });
});
