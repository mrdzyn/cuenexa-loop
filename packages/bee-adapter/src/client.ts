import { BeeConnectionError, BeeResponseError } from "./errors.js";
import type { BeeConversation, BeeFact, BeeTodo } from "./raw-types.js";

export interface BeeProxyClientOptions {
  /** Base URL of the local Bee proxy. Defaults to http://127.0.0.1:8787. */
  baseUrl?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Talks to the local Bee developer proxy (`bee proxy`), started after the
 * user has already run `bee login`. The proxy is local-only and
 * unauthenticated by design (see https://docs.bee.computer/docs/proxy), so
 * this client never handles or stores credentials — that trust boundary is
 * `bee login`'s job, not ours.
 */
export class BeeProxyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: BeeProxyClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async listConversations(): Promise<BeeConversation[]> {
    const body = await this.get("/v1/conversations");
    return extractList(body, ["conversations"]);
  }

  async getConversation(id: string): Promise<BeeConversation | null> {
    const body = await this.get(`/v1/conversations/${encodeURIComponent(id)}`);
    return (body as BeeConversation | null) ?? null;
  }

  async listFacts(): Promise<BeeFact[]> {
    const body = await this.get("/v1/facts");
    return extractList(body, ["facts"]);
  }

  async listTodos(): Promise<BeeTodo[]> {
    const body = await this.get("/v1/todos");
    return extractList(body, ["todos"]);
  }

  private async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (cause) {
      throw new BeeConnectionError(
        `Could not reach the Bee proxy at ${this.baseUrl}. Is "bee proxy" running? ` +
          `Run "bee login" once, then "bee proxy" in a separate terminal, and try again.`,
        { cause },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new BeeResponseError(
        `Bee proxy returned ${response.status} ${response.statusText} for ${path}`,
        response.status,
      );
    }

    return response.json();
  }
}

/**
 * Bee's list endpoints may return a bare array or an object wrapping the
 * array under a named key; this normalizes either shape without assuming
 * which one the running proxy version uses.
 */
function extractList(body: unknown, wrapperKeys: string[]): any[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === "object") {
    for (const key of wrapperKeys) {
      const value = (body as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return [];
}
