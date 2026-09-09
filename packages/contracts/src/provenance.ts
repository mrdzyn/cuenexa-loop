import { z } from "zod";

/**
 * Identifies which upstream system a normalized record originated from.
 * Kept as an enum (rather than a bare string) so adding a second source
 * later is a one-line change, not a breaking one.
 */
export const SourceSystemSchema = z.enum(["bee"]);
export type SourceSystem = z.infer<typeof SourceSystemSchema>;

/**
 * Attached to every normalized contract so a record can always be traced
 * back to the raw system and identifier it came from, and to the moment
 * CueNexa Loop observed it (not the moment the upstream system created it).
 */
export const ProvenanceSchema = z.object({
  source: SourceSystemSchema,
  sourceId: z.string().min(1),
  retrievedAt: z.string().datetime(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;
