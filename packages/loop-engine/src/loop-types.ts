import { z } from "zod";
import { LoopConversationSchema, LoopFactSchema, LoopTodoSchema } from "@cuenexa-loop/contracts";
import { LoopItemSchema, LoopSourceSchema } from "./types.js";

/**
 * Phase 1B contracts only. They model a snapshot-local grouping of Phase
 * 1A items; no cross-conversation correlation behavior is implemented yet.
 */
export const LoopIdSchema = z.string().regex(/^loop_[a-f0-9]{24}$/, "Expected a stable Loop id.");
export type LoopId = z.infer<typeof LoopIdSchema>;
export const LoopMemberIdentitySchema = z.string().regex(/^member_[a-f0-9]{64}$/, "Expected a stable member identity.");

export const LoopStateSchema = z.enum(["open", "waiting", "resolved"]);
export type LoopState = z.infer<typeof LoopStateSchema>;

export const LoopTimestampSourceSchema = z.enum([
  "utterance",
  "conversation_ended",
  "conversation_started",
  "fact_captured",
  "todo_created",
  "unavailable",
]);
export type LoopTimestampSource = z.infer<typeof LoopTimestampSourceSchema>;

export const LoopCorrelationReasonCodeSchema = z.enum([
  "shared_specific_anchor_phrase",
  "shared_specific_anchor_tokens",
  "same_action_family",
  "decision_to_action",
  "chronological_continuation",
  "matching_due_date",
  "matching_owner",
]);
export type LoopCorrelationReasonCode = z.infer<typeof LoopCorrelationReasonCodeSchema>;

/** Emitted Loops only represent high-confidence deterministic correlations. */
export const MINIMUM_LOOP_CORRELATION_CONFIDENCE = 0.9;

/** A complete, immutable-in-practice Phase 1A item retained as a Loop member. */
export const LoopMemberSchema = z
  .object({
    itemId: z.string().min(1),
    item: LoopItemSchema,
  })
  .superRefine((member, context) => {
    if (member.itemId !== member.item.id) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Loop member itemId must match item.id.", path: ["itemId"] });
    }
  });
export type LoopMember = z.infer<typeof LoopMemberSchema>;

/** A chronology entry references its preserved member and never copies source text. */
export const LoopTimelineEventSchema = z.object({
  itemId: z.string().min(1),
  /** Optional for backwards compatibility with Phase 1B.1 callers; emitted by the correlator. */
  memberIdentity: LoopMemberIdentitySchema.optional(),
  source: LoopSourceSchema,
  occurredAt: z.string().datetime().nullable(),
  timestampSource: LoopTimestampSourceSchema,
  /** Stable ordering fallback when no source timestamp is available. */
  sequence: z.number().int().nonnegative(),
});
export type LoopTimelineEvent = z.infer<typeof LoopTimelineEventSchema>;

/** Explainable, deterministic relationship metadata; raw anchor text is intentionally excluded. */
export const LoopCorrelationLinkSchema = z
  .object({
    fromItemId: z.string().min(1),
    toItemId: z.string().min(1),
    confidence: z.number().min(MINIMUM_LOOP_CORRELATION_CONFIDENCE).max(1),
    reasonCodes: z.array(LoopCorrelationReasonCodeSchema).min(1),
    sharedSpecificAnchorCount: z.number().int().nonnegative(),
  })
  .superRefine((link, context) => {
    if (link.fromItemId === link.toItemId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "A correlation link must join two distinct members.", path: ["toItemId"] });
    }
  });
export type LoopCorrelationLink = z.infer<typeof LoopCorrelationLinkSchema>;

export const LoopSnapshotCompletenessSchema = z.enum(["complete", "partial"]);
export type LoopSnapshotCompleteness = z.infer<typeof LoopSnapshotCompletenessSchema>;

export const LoopSnapshotMetadataSchema = z.object({
  observedAt: z.string().datetime(),
  completeness: LoopSnapshotCompletenessSchema,
});
export type LoopSnapshotMetadata = z.infer<typeof LoopSnapshotMetadataSchema>;

export const LoopSchema = z
  .object({
    id: LoopIdSchema,
    /** Reserved for a later deterministic title derivation; Phase 1B.1 does not generate one. */
    title: z.string().min(1).max(160).nullable(),
    state: LoopStateSchema,
    members: z.array(LoopMemberSchema).min(2),
    timeline: z.array(LoopTimelineEventSchema).min(2),
    correlationLinks: z.array(LoopCorrelationLinkSchema).min(1),
    correlationConfidence: z.number().min(MINIMUM_LOOP_CORRELATION_CONFIDENCE).max(1),
    snapshot: LoopSnapshotMetadataSchema,
    resolvedAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((loop, context) => {
    const memberIds = loop.members.map((member) => member.itemId);
    const uniqueMemberIds = new Set(memberIds);
    if (uniqueMemberIds.size !== memberIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Loop members must be unique.", path: ["members"] });
    }

    const conversationMembers = loop.members.filter((member) => member.item.source.conversationId !== null);
    const conversationIds = new Set(conversationMembers.map((member) => member.item.source.conversationId));
    if (conversationMembers.length < 2 || conversationIds.size < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A Loop must contain members from at least two distinct conversations.",
        path: ["members"],
      });
    }

    const providers = new Set(loop.members.map((member) => member.item.source.provider));
    if (providers.size !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A Loop's members must originate from the same provider.",
        path: ["members"],
      });
    }

    for (const event of loop.timeline) {
      if (!uniqueMemberIds.has(event.itemId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Timeline event must reference a Loop member.", path: ["timeline"] });
      }
    }
    const timelineMemberIds = loop.timeline.map((event) => event.itemId);
    if (timelineMemberIds.length !== memberIds.length || new Set(timelineMemberIds).size !== uniqueMemberIds.size) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A Loop timeline must reference every member exactly once.",
        path: ["timeline"],
      });
    }
    const orderedSequences = loop.timeline.map((event) => event.sequence).sort((a, b) => a - b);
    if (orderedSequences.some((sequence, index) => sequence !== index)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Loop timeline sequence values must be contiguous from zero.",
        path: ["timeline"],
      });
    }
    for (const link of loop.correlationLinks) {
      if (!uniqueMemberIds.has(link.fromItemId) || !uniqueMemberIds.has(link.toItemId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation link must reference Loop members.", path: ["correlationLinks"] });
      }
    }
    const weakestLink = Math.min(...loop.correlationLinks.map((link) => link.confidence));
    if (loop.correlationConfidence !== weakestLink) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Loop confidence must equal its weakest correlation link.",
        path: ["correlationConfidence"],
      });
    }
  });
export type Loop = z.infer<typeof LoopSchema>;

/** Provider-independent snapshot input for deterministic, in-memory correlation. */
export const LoopCorrelationInputSchema = z.object({
  items: z.array(LoopItemSchema),
  conversations: z.array(LoopConversationSchema),
  facts: z.array(LoopFactSchema),
  todos: z.array(LoopTodoSchema),
  now: z.string().datetime(),
  snapshot: LoopSnapshotMetadataSchema,
});
export type LoopCorrelationInput = z.infer<typeof LoopCorrelationInputSchema>;

export const LoopCorrelationWarningSchema = z.object({
  field: z.string(),
  message: z.string(),
});
export type LoopCorrelationWarning = z.infer<typeof LoopCorrelationWarningSchema>;

/** Public result for deterministic, snapshot-local correlation. */
export const LoopCorrelationResultSchema = z.object({
  loops: z.array(LoopSchema),
  warnings: z.array(LoopCorrelationWarningSchema),
  snapshot: LoopSnapshotMetadataSchema,
});
export type LoopCorrelationResult = z.infer<typeof LoopCorrelationResultSchema>;

/** Public Phase 1B correlator signature. */
export type CorrelateLoopItems = (input: LoopCorrelationInput) => LoopCorrelationResult;
