import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

export const LoopLocationSchema = z.object({
  label: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export type LoopLocation = z.infer<typeof LoopLocationSchema>;

export const LoopUtteranceSchema = z.object({
  speaker: z.string().nullable(),
  text: z.string(),
  spokenAt: z.string().datetime().nullable(),
});
export type LoopUtterance = z.infer<typeof LoopUtteranceSchema>;

/**
 * A single conversation, normalized from whatever upstream capture source
 * produced it. `utterances` preserves per-speaker detail for later Loop
 * intelligence phases (commitment/decision detection); the console
 * presenter is responsible for never rendering it verbatim by default.
 */
export const LoopConversationSchema = z.object({
  id: z.string().min(1),
  provenance: ProvenanceSchema,
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  summary: z.string(),
  detailedSummary: z.string().nullable(),
  location: LoopLocationSchema.nullable(),
  deviceType: z.string().nullable(),
  utterances: z.array(LoopUtteranceSchema),
});
export type LoopConversation = z.infer<typeof LoopConversationSchema>;
