/**
 * Shapes for objects returned by the official Bee client library
 * (`@beeai/cli/lib`, `createBeeClient().api`), which in turn runs the
 * authenticated `bee` CLI as a subprocess in JSON mode. `@beeai/cli`
 * itself does not publish a formal JSON schema for these payloads, so
 * every field here is optional and possibly-null by design, and the
 * normalizer in ./normalize never trusts a field's presence — it always
 * falls back gracefully rather than throwing. Fields marked "legacy
 * fallback" existed in an earlier Bee response shape (or the local `bee
 * proxy`) and are read only if the current field is absent, purely for
 * forward compatibility with older Bee CLI versions.
 */

export interface BeeLocation {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** A single spoken segment, nested under a BeeTranscription. */
export interface BeeUtterance {
  id?: string | number | null;
  realtime?: boolean | null;
  start?: string | number | null;
  end?: string | number | null;
  spoken_at?: string | number | null;
  text?: string | null;
  speaker?: string | null;
  created_at?: string | number | null;
}

/** A transcription segment of a conversation; carries its utterances nested, not flat. */
export interface BeeTranscription {
  id?: string | number | null;
  realtime?: boolean | null;
  utterances?: BeeUtterance[] | null;
}

export interface BeeConversation {
  id?: string | number | null;
  start_time?: string | number | null;
  end_time?: string | number | null;
  device_type?: string | null;
  state?: string | null;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  short_summary?: string | null;
  summary?: string | null;
  primary_location?: BeeLocation | null;
  transcriptions?: BeeTranscription[] | null;
}

/**
 * A conversation-detail response may wrap the conversation object under a
 * "conversation" key rather than returning it bare; the adapter unwraps
 * this rather than treating the wrapper itself as the conversation.
 */
export interface BeeConversationDetailResponse {
  conversation?: BeeConversation | null;
}

export interface BeeFact {
  id?: string | number | null;
  text?: string | null;
  tags?: string[] | null;
  created_at?: string | number | null;
  confirmed?: boolean | null;
  /** Legacy fallback (pre-dates the `confirmed` boolean field). */
  timestamp?: string | number | null;
  /** Legacy fallback (pre-dates the `confirmed` boolean field). */
  confirmation_status?: string | null;
}

export interface BeeTodo {
  id?: string | number | null;
  text?: string | null;
  created_at?: string | number | null;
  alarm_at?: string | number | null;
  completed?: boolean | null;
  /** Legacy fallback (pre-dates the `created_at` field). */
  created?: string | number | null;
  /** Legacy fallback (pre-dates the `alarm_at` field). */
  alarm?: string | number | null;
  /** Legacy fallback (pre-dates the `completed` boolean field). */
  completion_status?: string | null;
}
