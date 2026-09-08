/**
 * Best-effort shapes for objects returned by the local Bee developer proxy
 * (`bee proxy`, see https://docs.bee.computer/docs/proxy). Bee does not
 * publish a formal JSON schema for these endpoints, so every field here is
 * optional and possibly-null by design. The normalizer in ./normalize
 * treats even these as unreliable: it never trusts a field's presence and
 * always falls back gracefully. If your local `bee proxy` returns fields
 * not modeled here, extend this file rather than widening it to `any`.
 */

export interface BeeLocation {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface BeeUtterance {
  speaker?: string | null;
  text?: string | null;
  timestamp?: string | number | null;
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
  transcriptions?: BeeUtterance[] | null;
  utterances?: BeeUtterance[] | null;
}

export interface BeeFact {
  id?: string | number | null;
  text?: string | null;
  tags?: string[] | null;
  timestamp?: string | number | null;
  confirmation_status?: string | null;
}

export interface BeeTodo {
  id?: string | number | null;
  text?: string | null;
  created?: string | number | null;
  alarm?: string | number | null;
  alarm_at?: string | number | null;
  completion_status?: string | null;
  completed?: boolean | null;
}
