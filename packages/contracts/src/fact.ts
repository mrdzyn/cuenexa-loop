import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

export const LoopFactStatusSchema = z.enum(["confirmed", "pending", "unknown"]);
export type LoopFactStatus = z.infer<typeof LoopFactStatusSchema>;

/**
 * A discrete fact CueNexa Loop has learned about the user, normalized from
 * an upstream source. Facts are inputs to later Loop intelligence (e.g.
 * resolving who a commitment was made to) but carry no detection logic
 * themselves in Phase 0.
 */
export const LoopFactSchema = z.object({
  id: z.string().min(1),
  provenance: ProvenanceSchema,
  // Not min(1): the adapter must be able to represent a fact whose upstream
  // text was missing rather than discarding the whole record.
  text: z.string(),
  tags: z.array(z.string()),
  status: LoopFactStatusSchema,
  capturedAt: z.string().datetime().nullable(),
});
export type LoopFact = z.infer<typeof LoopFactSchema>;
