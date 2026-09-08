import type {
  LoopConversation,
  LoopLocation,
  LoopUtterance,
  NormalizationResult,
  NormalizationWarning,
} from "@cuenexa-loop/contracts";
import type { BeeConversation, BeeLocation, BeeUtterance } from "../raw-types.js";
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
    utterances: (raw.transcriptions ?? raw.utterances ?? []).map(normalizeUtterance),
  };

  return { record, warnings };
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
    spokenAt: coerceTimestamp(raw.timestamp),
  };
}
