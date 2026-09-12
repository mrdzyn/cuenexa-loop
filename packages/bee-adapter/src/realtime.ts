import { createHash } from "node:crypto";
import type { BeeClient, JsonSseStream } from "@beeai/cli/lib";
import {
  EphemeralRealtimeEventSchema,
  type EphemeralRealtimeEvent,
} from "@cuenexa-loop/contracts";
import { classifyBeeError } from "./errors.js";

export const BEE_REALTIME_EVENT_TYPES = [
  "connected",
  "new-utterance",
  "new-conversation",
  "update-conversation",
] as const;
export const REALTIME_DEDUPE_LIMIT = 512;
export const REALTIME_TEXT_LIMIT = 4_000;

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
        const result = normalizeBeeRealtimeEvent(incoming.data, now());
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
): { event: EphemeralRealtimeEvent } | { warning: BeeRealtimeWarning } {
  if (!isRecord(input)) return malformed();
  const eventName = stringValue(input.event) ?? stringValue(input.type);
  if (!eventName) return malformed();
  const payload = isRecord(input.data) ? input.data : input;
  const providerEventId = stringValue(input.id);

  let candidate: unknown;
  if (eventName === "connected") {
    candidate = baseEvent("connection", providerEventId, null, observedAt, [eventName]);
  } else if (eventName === "new-utterance") {
    if (!isRecord(payload.utterance)) return malformed();
    const text = stringValue(payload.utterance.text);
    if (!text || text.length > REALTIME_TEXT_LIMIT) return malformed();
    const conversationId = identifier(payload.conversation_uuid) ?? identifier(payload.conversation_id);
    const utteranceId = identifier(payload.utterance.id) ?? identifier(payload.utterance.uuid);
    candidate = {
      ...baseEvent("utterance", providerEventId, conversationId, observedAt, [
        eventName, conversationId, utteranceId, stringValue(payload.utterance.speaker), text,
      ]),
      utteranceId,
      spokenAt: isoInstant(payload.utterance.spoken_at),
      text,
      final: booleanValue(payload.utterance.final),
    };
  } else if (eventName === "new-conversation" || eventName === "update-conversation") {
    if (!isRecord(payload.conversation)) return malformed();
    const conversationId = identifier(payload.conversation.uuid) ?? identifier(payload.conversation.id);
    if (!conversationId) return malformed();
    const state = stringValue(payload.conversation.state);
    candidate = {
      ...baseEvent("conversation_state", providerEventId, conversationId, observedAt, [eventName, conversationId, state]),
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
  providerEventId: string | null,
  conversationId: string | null,
  observedAt: string,
  identityParts: readonly unknown[],
) {
  const structuralId = providerEventId ?? createHash("sha256")
    .update(JSON.stringify(identityParts))
    .digest("hex")
    .slice(0, 32);
  return {
    kind,
    id: `bee_rt_${structuralId}`,
    provider: "bee",
    providerEventId,
    sessionId: null,
    conversationId,
    observedAt,
  };
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

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isoInstant(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
