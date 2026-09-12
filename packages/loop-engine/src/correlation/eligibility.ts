import { extractCorrelationAnchors } from "./anchors.js";
import { PairEligibilityResultSchema } from "./types.js";
import type { PairEligibilityResult } from "./types.js";
import { tokenize } from "../text-utils.js";
import type { LoopItem, LoopItemType } from "../types.js";

type ItemFamily = "action" | "decision" | "open_question" | "unsupported";

/**
 * Evaluates only hard, deterministic pre-scoring guards. It neither emits a
 * Loop nor calculates correlation confidence; those are later Phase 1B work.
 */
export function evaluatePairEligibility(a: LoopItem, b: LoopItem): PairEligibilityResult {
  const rejectionReasonCodes: PairEligibilityResult["rejectionReasonCodes"] = [];
  const reasonCodes: PairEligibilityResult["reasonCodes"] = [];

  if (a.id === b.id) {
    rejectionReasonCodes.push("same_member");
  }
  if (a.source.conversationId === null || b.source.conversationId === null) {
    rejectionReasonCodes.push("missing_conversation_context");
  } else if (a.source.conversationId === b.source.conversationId) {
    rejectionReasonCodes.push("same_conversation");
  }
  if (a.source.provider !== b.source.provider) {
    rejectionReasonCodes.push("different_provider");
  }

  const familyA = itemFamily(a.type);
  const familyB = itemFamily(b.type);
  if (familyA === "open_question" || familyB === "open_question") {
    rejectionReasonCodes.push("open_question_conservative");
  } else if (!areFamiliesCompatible(familyA, familyB)) {
    rejectionReasonCodes.push("incompatible_item_families");
  } else if (familyA === "decision" || familyB === "decision") {
    reasonCodes.push("decision_to_action");
  } else {
    reasonCodes.push("same_action_family");
  }

  const anchorsA = extractCorrelationAnchors(a);
  const anchorsB = extractCorrelationAnchors(b);
  const sharedSpecificTokens = intersection(anchorsA.specificTokens, anchorsB.specificTokens);
  const sharedSpecificPhrases = intersection(anchorsA.specificPhrases, anchorsB.specificPhrases);
  const hasSharedSpecificAnchorPhrase = sharedSpecificPhrases.length > 0;

  if (hasSharedSpecificAnchorPhrase) {
    reasonCodes.push("shared_specific_anchor_phrase");
  }
  if (sharedSpecificTokens.length >= 2) {
    reasonCodes.push("shared_specific_anchor_tokens");
  }

  const requiresStrongDecisionAnchors = familyA === "decision" || familyB === "decision";
  const hasSufficientAnchors = hasSharedSpecificAnchorPhrase || sharedSpecificTokens.length >= 2;
  const hasStrongDecisionAnchors = hasSharedSpecificAnchorPhrase && sharedSpecificTokens.length >= 2;
  if (requiresStrongDecisionAnchors && !hasStrongDecisionAnchors) {
    rejectionReasonCodes.push("decision_requires_strong_anchor");
  } else if (!requiresStrongDecisionAnchors && !hasSufficientAnchors) {
    rejectionReasonCodes.push(hasGenericOverlap(a, b) ? "generic_language_only" : "no_shared_specific_anchors");
  }

  return PairEligibilityResultSchema.parse({
    eligible: rejectionReasonCodes.length === 0,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    rejectionReasonCodes: [...new Set(rejectionReasonCodes)].sort(),
    sharedSpecificAnchorCount: sharedSpecificTokens.length,
    hasSharedSpecificAnchorPhrase,
  });
}

function itemFamily(type: LoopItemType): ItemFamily {
  if (type === "commitment" || type === "follow_up" || type === "delegation") {
    return "action";
  }
  if (type === "decision") {
    return "decision";
  }
  if (type === "open_question") {
    return "open_question";
  }
  return "unsupported";
}

function areFamiliesCompatible(a: ItemFamily, b: ItemFamily): boolean {
  return (a === "action" && b === "action") || (a === "decision" && b === "action") || (a === "action" && b === "decision");
}

function intersection(a: readonly string[], b: readonly string[]): string[] {
  const bValues = new Set(b);
  return [...new Set(a.filter((value) => bValues.has(value)))].sort();
}

function hasGenericOverlap(a: LoopItem, b: LoopItem): boolean {
  const tokensA = new Set([a.text, ...a.evidence.map((evidence) => evidence.text)].flatMap(tokenize));
  const tokensB = new Set([b.text, ...b.evidence.map((evidence) => evidence.text)].flatMap(tokenize));
  return [...tokensA].some((token) => tokensB.has(token));
}
