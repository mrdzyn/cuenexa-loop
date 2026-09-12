import { createHash } from "node:crypto";
import type { BeeClient, JsonSseStream } from "@beeai/cli/lib";
import {
  EphemeralRealtimeEventSchema,
  type EphemeralRealtimeEvent,
} from "@cuenexa-loop/contracts";
import { classifyBeeError } from "./errors.js";

export const BEE_REALTIME_EVENT_TYPES = [
  "new-utterance",
  "new-conversation",
  "update-conversation",
] as const;
export const REALTIME_DEDUPE_LIMIT = 512;
export const REALTIME_TEXT_LIMIT = 4_000;
export const REALTIME_IDENTITY_BRIDGE_LIMIT = 256;

export type BeeRealtimeWarningCode = "malformed_event" | "unsupported_event";

export interface BeeRealtimeWarning {
  readonly code: BeeRealtimeWarningCode;
  /** Fixed and content-free; raw event payloads must never be included. */
  readonly message: string;
}

export interface BeeRealtimeSubscribeOptions {
  readonly signal?: AbortSignal;
  readonly now?: () => string;
  readonly onWarning?: (warning: BeeRealtimeWarning) => void;
  readonly dedupeLimit?: number;
}

export interface BeeRealtimeSubscription {
  readonly events: AsyncIterable<EphemeralRealtimeEvent>;
  close(): void;
}

export function subscribeToBeeRealtime(
  client: Pick<BeeClient, "sse">,
  options: BeeRealtimeSubscribeOptions = {},
  identities = new BeeConversationIdentityBridge(),
): BeeRealtimeSubscription {
  const now = options.now ?? (() => new Date().toISOString());
  const dedupeLimit = boundedDedupeLimit(options.dedupeLimit);
  let stream: JsonSseStream<unknown>;
  let closed = false;

  try {
    stream = client.sse.streamJson<unknown>({
      types: [...BEE_REALTIME_EVENT_TYPES],
      signal: options.signal,
    });
  } catch (error) {
    throw classifyBeeError(error, "opening realtime stream");
  }

  const events = async function* (): AsyncGenerator<EphemeralRealtimeEvent> {
    const seen = new Set<string>();
    const order: string[] = [];
    try {
      for await (const incoming of stream.events) {
        const result = normalizeBeeRealtimeEvent(incoming.data, now(), identities);
        if ("warning" in result) {
          options.onWarning?.(result.warning);
          continue;
        }
        if (seen.has(result.event.id)) {
          continue;
        }
        seen.add(result.event.id);
        order.push(result.event.id);
        if (order.length > dedupeLimit) {
          const expired = order.shift();
          if (expired) seen.delete(expired);
        }
        yield result.event;
      }
    } catch (error) {
      if (closed || options.signal?.aborted) return;
      throw classifyBeeError(error, "reading realtime stream");
    }
  }();

  return {
    events,
    close() {
      closed = true;
      stream.close();
    },
  };
}

export function normalizeBeeRealtimeEvent(
  input: unknown,
  observedAt: string,
  identities = new BeeConversationIdentityBridge(),
): { event: EphemeralRealtimeEvent } | { warning: BeeRealtimeWarning } {
  if (!isRecord(input)) return malformed();
  const hasUtterance = "utterance" in input;
  const hasConversation = "conversation" in input;
  if (hasUtterance && hasConversation) return malformed();

  let candidate: unknown;
  if (hasUtterance) {
    if (!isRecord(input.utterance)) return malformed();
    const text = stringValue(input.utterance.text);
    if (!text || text.length > REALTIME_TEXT_LIMIT) return malformed();
    const sessionId = identifier(input.conversation_uuid);
    if (!sessionId) return malformed();
    const conversationId = identities.authoritativeIdForUuid(sessionId);
    const utteranceId = identifier(input.utterance.id) ?? identifier(input.utterance.uuid);
    candidate = {
      ...baseEvent("utterance", conversationId, sessionId, observedAt, [
        "utterance", sessionId, utteranceId, stringValue(input.utterance.speaker), text,
      ]),
      utteranceId,
      spokenAt: isoInstant(input.utterance.spoken_at),
      text,
      final: booleanValue(input.utterance.final),
    };
  } else if (hasConversation) {
    if (!isRecord(input.conversation)) return malformed();
    const explicitConversationId = numericIdentifier(input.conversation.id);
    const explicitSessionId = identifier(input.conversation.uuid);
    const state = stringValue(input.conversation.state);
    if (!state || state.length > 64) return malformed();
    if (explicitConversationId && explicitSessionId) {
      if (!identities.remember(explicitSessionId, explicitConversationId)) return malformed();
    }
    const conversationId = explicitConversationId
      ?? (explicitSessionId ? identities.authoritativeIdForUuid(explicitSessionId) : null);
    if (!conversationId) return malformed();
    const sessionId = explicitSessionId ?? identities.uuidForAuthoritativeId(conversationId);
    candidate = {
      ...baseEvent("conversation_state", conversationId, sessionId, observedAt, [
        "conversation", conversationId, sessionId, state,
      ]),
      state,
    };
  } else {
    return {
      warning: {
        code: "unsupported_event",
        message: "Bee realtime event type is not supported and was ignored.",
      },
    };
  }

  const parsed = EphemeralRealtimeEventSchema.safeParse(candidate);
  return parsed.success ? { event: parsed.data } : malformed();
}

function baseEvent(
  kind: EphemeralRealtimeEvent["kind"],
  conversationId: string | null,
  sessionId: string | null,
  observedAt: string,
  identityParts: readonly unknown[],
) {
  const structuralId = createHash("sha256")
    .update(JSON.stringify(identityParts))
    .digest("hex")
    .slice(0, 32);
  return {
    kind,
    id: `bee_rt_${structuralId}`,
    provider: "bee",
    providerEventId: null,
    sessionId,
    conversationId,
    observedAt,
  };
}

/** Exact provider-observed UUID↔numeric-ID pairs, bounded to one subscription. */
export class BeeConversationIdentityBridge {
  private readonly byUuid = new Map<string, string>();
  private readonly byAuthoritativeId = new Map<string, string>();
  private readonly order: string[] = [];
  private readonly boundedLimit: number;

  constructor(limit = REALTIME_IDENTITY_BRIDGE_LIMIT) {
    this.boundedLimit = Number.isInteger(limit)
      ? Math.max(1, Math.min(1_024, limit))
      : REALTIME_IDENTITY_BRIDGE_LIMIT;
  }

  remember(uuid: string, authoritativeId: string): boolean {
    const normalizedUuid = stringValue(uuid);
    const normalizedId = numericIdentifier(authoritativeId);
    if (!normalizedUuid || normalizedUuid.length > 256 || !normalizedId || normalizedId.length > 256) return false;
    const knownId = this.byUuid.get(normalizedUuid);
    const knownUuid = this.byAuthoritativeId.get(normalizedId);
    if ((knownId && knownId !== normalizedId) || (knownUuid && knownUuid !== normalizedUuid)) return false;
    if (knownId === normalizedId) return true;
    this.byUuid.set(normalizedUuid, normalizedId);
    this.byAuthoritativeId.set(normalizedId, normalizedUuid);
    this.order.push(normalizedUuid);
    while (this.order.length > this.boundedLimit) {
      const expiredUuid = this.order.shift();
      if (!expiredUuid) break;
      const expiredId = this.byUuid.get(expiredUuid);
      this.byUuid.delete(expiredUuid);
      if (expiredId) this.byAuthoritativeId.delete(expiredId);
    }
    return true;
  }

  authoritativeIdForUuid(uuid: string): string | null {
    return this.byUuid.get(uuid) ?? null;
  }

  uuidForAuthoritativeId(authoritativeId: string): string | null {
    return this.byAuthoritativeId.get(authoritativeId) ?? null;
  }
}

function malformed(): { warning: BeeRealtimeWarning } {
  return {
    warning: {
      code: "malformed_event",
      message: "Bee realtime event was malformed and was ignored.",
    },
  };
}

function boundedDedupeLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined) return REALTIME_DEDUPE_LIMIT;
  return Math.max(1, Math.min(2_048, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function identifier(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function numericIdentifier(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  const normalized = stringValue(value);
  return normalized && /^(?:0|[1-9]\d*)$/.test(normalized) ? normalized : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isoInstant(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = typeof value === "number" ? value : /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : null;
  const normalized = numeric !== null && Number.isFinite(numeric) && Math.abs(numeric) < 1_000_000_000_000
    ? numeric * 1_000
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
