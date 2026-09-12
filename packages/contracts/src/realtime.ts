import { z } from "zod";

const EphemeralRealtimeBaseSchema = z.object({
  id: z.string().min(1).max(96),
  provider: z.string().min(1).max(32),
  providerEventId: z.string().min(1).max(256).nullable(),
  sessionId: z.string().min(1).max(256).nullable(),
  conversationId: z.string().min(1).max(256).nullable(),
  observedAt: z.string().datetime(),
});

/** Memory-only transcript fragment. It is never an authoritative LoopItem. */
export const EphemeralRealtimeUtteranceSchema = EphemeralRealtimeBaseSchema.extend({
  kind: z.literal("utterance"),
  utteranceId: z.string().min(1).max(256).nullable(),
  spokenAt: z.string().datetime().nullable(),
  text: z.string().min(1).max(4_000),
  final: z.boolean().nullable(),
});
export type EphemeralRealtimeUtterance = z.infer<typeof EphemeralRealtimeUtteranceSchema>;

/** Structural processing-state hint. It carries no title, summary, location, or transcript. */
export const EphemeralRealtimeConversationStateSchema = EphemeralRealtimeBaseSchema.extend({
  kind: z.literal("conversation_state"),
  state: z.string().min(1).max(64).nullable(),
});
export type EphemeralRealtimeConversationState = z.infer<typeof EphemeralRealtimeConversationStateSchema>;

/** Structural connection observation; never evidence that a conversation started or ended. */
export const EphemeralRealtimeConnectionSchema = EphemeralRealtimeBaseSchema.extend({
  kind: z.literal("connection"),
});
export type EphemeralRealtimeConnection = z.infer<typeof EphemeralRealtimeConnectionSchema>;

export const EphemeralRealtimeEventSchema = z.discriminatedUnion("kind", [
  EphemeralRealtimeUtteranceSchema,
  EphemeralRealtimeConversationStateSchema,
  EphemeralRealtimeConnectionSchema,
]);
export type EphemeralRealtimeEvent = z.infer<typeof EphemeralRealtimeEventSchema>;
