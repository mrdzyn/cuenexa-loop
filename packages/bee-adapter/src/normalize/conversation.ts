import {
  LoopConversationSchema,
  type LoopConversation,
  type LoopLocation,
  type LoopUtterance,
  type NormalizationResult,
  type NormalizationWarning,
} from "@cuenexa-loop/contracts";
import type { BeeConversation, BeeLocation, BeeTranscription, BeeUtterance } from "../raw-types.js";
import { coerceId, coerceText, coerceTimestamp, warnAndPlaceholder } from "./util.js";

export function normalizeConversation(
  raw: BeeConversation,
  retrievedAt: string,
): NormalizationResult<LoopConversation> {
  const warnings: NormalizationWarning[] = [];

  const id = coerceId(raw.id) ?? warnAndPlaceholder(warnings, "conversation");

  const shortSummary = coerceText(raw.short_summary);
  const longSummary = coerceText(raw.summary);
  if (!shortSummary && !longSummary) {
    warnings.push({ field: "summary", message: "No summary text found on the raw conversation." });
  }

  const record: LoopConversation = {
    id,
    provenance: { source: "bee", sourceId: id, retrievedAt },
    startedAt: coerceTimestamp(raw.start_time),
    endedAt: coerceTimestamp(raw.end_time),
    summary: shortSummary ?? longSummary ?? "",
    detailedSummary: longSummary && longSummary !== shortSummary ? longSummary : null,
    location: normalizeLocation(raw.primary_location),
    deviceType: coerceText(raw.device_type),
    utterances: flattenUtterances(raw.transcriptions),
  };

  return { record: LoopConversationSchema.parse(record), warnings };
}

/**
 * Bee nests utterances two levels deep: each conversation has
 * `transcriptions[]`, and each transcription carries its own
 * `utterances[]`. A transcription is a grouping, not an utterance itself
 * — flatten fully rather than treating a transcription as one utterance,
 * and never drop a transcription's utterances even if the transcription
 * itself is missing other fields.
 */
function flattenUtterances(transcriptions: BeeTranscription[] | null | undefined): LoopUtterance[] {
  if (!Array.isArray(transcriptions)) {
    return [];
  }
  return transcriptions.flatMap((transcription) =>
    Array.isArray(transcription.utterances) ? transcription.utterances.map(normalizeUtterance) : [],
  );
}

function normalizeLocation(raw: BeeLocation | null | undefined): LoopLocation | null {
  if (!raw) {
    return null;
  }
  return {
    label: coerceText(raw.address),
    latitude: typeof raw.latitude === "number" ? raw.latitude : null,
    longitude: typeof raw.longitude === "number" ? raw.longitude : null,
  };
}

function normalizeUtterance(raw: BeeUtterance): LoopUtterance {
  return {
    speaker: coerceText(raw.speaker),
    text: coerceText(raw.text) ?? "",
    // spoken_at is the authoritative spoken timestamp; start is a segment-relative fallback.
    spokenAt: coerceTimestamp(raw.spoken_at ?? raw.start),
  };
}
