import { createBeeClient } from "@beeai/cli/lib";
import type { BeeCliOptions, BeeClient } from "@beeai/cli/lib";
import type { Page } from "@cuenexa-loop/contracts";
import { BeeAuthenticationError, classifyBeeError } from "./errors.js";
import { extractPage } from "./pagination.js";
import type { BeeConversation, BeeConversationDetailResponse, BeeFact, BeeTodo } from "./raw-types.js";

export interface BeeAdapterClientOptions {
  /** Passed through to `createBeeClient` (command path, environment, cwd, env overrides). */
  cliOptions?: BeeCliOptions;
  /** Injectable for tests: an already-constructed official BeeClient to wrap instead of spawning `bee`. */
  client?: BeeClient;
}

export interface ListPageOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Wraps the official `@beeai/cli/lib` client (`createBeeClient()`), which
 * itself runs the already-authenticated `bee` CLI as a subprocess in JSON
 * mode. This class is the only place in CueNexa Loop that talks to Bee —
 * everything above it (the CLI, and any future package) only ever sees
 * CueNexa Loop contracts. Authentication stays entirely the Bee CLI's
 * responsibility: this class never reads, stores, or transmits a
 * credential itself, it only asks `bee` whether a session exists.
 */
export class BeeAdapterClient {
  private readonly client: BeeClient;

  constructor(options: BeeAdapterClientOptions = {}) {
    this.client = options.client ?? createBeeClient(options.cliOptions);
  }

  /** Throws BeeAuthenticationError if `bee login` has not been completed for this session. */
  async ensureAuthenticated(): Promise<void> {
    const authenticated = await this.guarded(
      () => this.client.auth.isAuthenticated(),
      "checking Bee authentication",
    );
    if (!authenticated) {
      throw new BeeAuthenticationError("Bee CLI reported no authenticated session.");
    }
  }

  async listConversations(options: ListPageOptions = {}): Promise<Page<BeeConversation>> {
    const body = await this.guarded(
      () => this.client.api.conversations.list({ cursor: options.cursor, limit: options.limit }),
      "listing conversations",
    );
    return extractPage<BeeConversation>(body, ["conversations", "items", "data"]);
  }

  async getConversation(id: string): Promise<BeeConversation | null> {
    const body = await this.guarded(
      () => this.client.api.conversations.get(id),
      `fetching conversation ${id}`,
    );
    return unwrapConversation(body);
  }

  async listFacts(options: ListPageOptions = {}): Promise<Page<BeeFact>> {
    const body = await this.guarded(
      () => this.client.api.facts.list({ cursor: options.cursor, limit: options.limit }),
      "listing facts",
    );
    return extractPage<BeeFact>(body, ["facts", "items", "data"]);
  }

  async listTodos(options: ListPageOptions = {}): Promise<Page<BeeTodo>> {
    const body = await this.guarded(
      () => this.client.api.todos.list({ cursor: options.cursor, limit: options.limit }),
      "listing todos",
    );
    return extractPage<BeeTodo>(body, ["todos", "items", "data"]);
  }

  private async guarded<T>(fn: () => Promise<T>, action: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw classifyBeeError(error, action);
    }
  }
}

/**
 * A conversation-detail response may be bare or wrapped under a
 * "conversation" key (see raw-types.ts). Unwraps either shape; never
 * treats the wrapper object itself as the conversation.
 */
function unwrapConversation(body: unknown): BeeConversation | null {
  if (body === null || body === undefined) {
    return null;
  }
  if (typeof body === "object" && "conversation" in body) {
    const wrapped = (body as BeeConversationDetailResponse).conversation;
    return wrapped ?? null;
  }
  return body as BeeConversation;
}
