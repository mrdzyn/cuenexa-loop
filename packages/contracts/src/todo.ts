import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

export const LoopTodoStatusSchema = z.enum(["open", "completed", "unknown"]);
export type LoopTodoStatus = z.infer<typeof LoopTodoStatusSchema>;

/**
 * A todo/reminder item, normalized from an upstream source. This is a raw
 * carried-over task, distinct from a "follow-up loop" CueNexa Loop will
 * later detect from conversation content — that detection logic does not
 * exist yet in Phase 0.
 */
export const LoopTodoSchema = z.object({
  id: z.string().min(1),
  provenance: ProvenanceSchema,
  // Not min(1): the adapter must be able to represent a todo whose upstream
  // text was missing rather than discarding the whole record.
  text: z.string(),
  status: LoopTodoStatusSchema,
  createdAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
});
export type LoopTodo = z.infer<typeof LoopTodoSchema>;
