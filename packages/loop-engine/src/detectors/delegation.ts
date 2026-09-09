import { CONFIDENCE } from "../confidence.js";
import { capitalizeFirst, stripTrailingPunctuation } from "../text-utils.js";
import type { DetectorMatch } from "./types.js";

/** Pronouns that structurally match the capitalized-word patterns below but are never a delegation "owner". */
const NON_PERSON_SUBJECTS = new Set(["i", "we", "you", "they", "it"]);

const DIRECT_ADDRESS_PATTERN = /^([A-Z][a-zA-Z]*),\s*(?:can|could|would)\s+you\b|^([A-Z][a-zA-Z]*),\s*please\b/;
const THIRD_PERSON_WILL_PATTERN = /^([A-Z][a-zA-Z]*)\s+will\s+/;
const PLEASE_HAVE_PATTERN = /\bplease\s+have\s+(.+?)\s+(?:verify|prepare|send|complete|review|handle|confirm|check|do)\b/i;

/**
 * Detects explicit assignment of responsibility to someone other than the
 * speaker: direct address ("John, can you...?", "Alex, please..."),
 * third-person future ("Sarah will prepare..."), or an explicit
 * instruction to have a person/team act ("Please have the operations
 * team verify this."). No speaker-identity resolution is attempted —
 * only names/labels found directly in the source text are used as
 * `owner.label`.
 */
export function detectDelegation(sentence: string): DetectorMatch | null {
  const trimmed = stripTrailingPunctuation(sentence).trim();

  const directAddress = trimmed.match(DIRECT_ADDRESS_PATTERN);
  const directAddressName = directAddress?.[1] ?? directAddress?.[2];
  if (directAddressName && isPersonSubject(directAddressName)) {
    return build(trimmed, directAddressName);
  }

  const thirdPersonWill = trimmed.match(THIRD_PERSON_WILL_PATTERN);
  const thirdPersonName = thirdPersonWill?.[1];
  if (thirdPersonName && isPersonSubject(thirdPersonName)) {
    return build(trimmed, thirdPersonName);
  }

  const pleaseHave = sentence.match(PLEASE_HAVE_PATTERN);
  if (pleaseHave?.[1]) {
    return build(trimmed, pleaseHave[1].trim());
  }

  return null;
}

function isPersonSubject(candidate: string): boolean {
  return !NON_PERSON_SUBJECTS.has(candidate.toLowerCase());
}

function build(sentenceText: string, ownerLabel: string): DetectorMatch {
  return {
    type: "delegation",
    text: capitalizeFirst(sentenceText),
    confidence: CONFIDENCE.EXPLICIT_DELEGATION,
    owner: { label: ownerLabel },
    counterparties: [],
  };
}
