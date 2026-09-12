# CueNexa Loop — Bee Developer Friction Log

This document is the concise, submission-ready friction log for CueNexa Loop's Bee integration work. It focuses on issues that are directly useful to Bee/Amazon developer-experience reviewers.

For the broader internal engineering history, see [`docs/FRICTION-LOG.md`](FRICTION-LOG.md).

---

## 1. Bee response payloads do not have a formally published schema

**Specific task attempted:**  
Build the CueNexa Loop Bee adapter for conversations, facts, and todos using the official `@beeai/cli/lib` client.

**Steps taken:**
1. Reviewed the Bee developer documentation and example responses.
2. Inspected the TypeScript declarations shipped with `@beeai/cli`.
3. Implemented the adapter around `facts.list()`, `todos.list()`, `conversations.list()`, and `conversations.get()`.
4. Added defensive normalization and runtime schema validation.

**Expected result:**  
The official library would expose strongly typed response objects or point to a canonical JSON schema describing the fields returned by each Bee API.

**Actual result:**  
The method signatures are typed, but response payloads are generic caller-supplied types. There is no authoritative JSON schema for the returned Bee records. This meant fields such as timestamps, conversation wrappers, nested utterances, and legacy/current field names had to be validated defensively at runtime.

**Severity:** Medium

**Workaround used:**  
CueNexa Loop keeps Bee-specific raw types in one adapter layer, treats fields as optional, normalizes them defensively, validates normalized records with Zod, and emits `NormalizationWarning`s instead of allowing unexpected Bee payloads to silently propagate through the application.

**Actionable suggestion:**  
Publish versioned JSON schemas, generated TypeScript response types, or an OpenAPI-style contract for the Bee data API. Ideally these schemas should cover conversations, facts, todos, pagination, timestamps, and conversation-detail wrappers.

---

## 2. `streamJson()` does not preserve SSE event names

**Specific task attempted:**  
Implement ambient realtime awareness in CueNexa Loop using Bee realtime events.

**Steps taken:**
1. Used the supported `bee.sse.streamJson({ types, signal })` API in `@beeai/cli` 0.7.3.
2. Inspected the installed library implementation when the initial realtime adapter behavior did not match expectations.
3. Compared the parsed stream output with the documented realtime payload examples.
4. Added regression tests against the actual parsed payload shape.

**Expected result:**  
Each parsed event would retain its SSE event metadata, conceptually similar to:

```json
{
  "event": "new-utterance",
  "id": "...",
  "data": {}
}
```

This would let consumers reliably discriminate event types.

**Actual result:**  
`streamJson().events[].data` contains only the parsed SSE `data:` JSON. The library consumes the transport-level `event:` and `id:` fields and does not return them. CueNexa therefore cannot distinguish supported realtime events using the SSE event name and must instead discriminate them from payload structure.

**Severity:** High

An incorrect assumption here can result in every valid realtime event being ignored even though the stream itself is connected successfully.

**Workaround used:**  
CueNexa Loop structurally discriminates the documented raw payloads:

- `{ utterance, conversation_uuid }`
- `{ conversation }`

It requests only `new-utterance`, `new-conversation`, and `update-conversation`, because these can be identified safely from their parsed data. It does not rely on an invented event/type field.

**Actionable suggestion:**  
Expose the original SSE metadata in the Node library, for example:

```ts
{ event, id, data }
```

Even if `data` remains parsed automatically, retaining `event` would make integrations safer, simpler, and less dependent on structural payload inference.

---

## 3. Realtime and processed history use different conversation identifiers

**Specific task attempted:**  
Reconcile a provisional commitment detected during a live Bee conversation with the same conversation after Bee processed it into historical data.

**Steps taken:**
1. Observed realtime `new-utterance` events.
2. Inspected the identifiers available on realtime payloads.
3. Compared them with the identifiers returned by processed conversation history.
4. Added tests using deliberately different realtime UUIDs and historical numeric IDs.

**Expected result:**  
A conversation would have one stable identifier that could be used across realtime and processed-history APIs.

**Actual result:**  
Realtime utterances identify the conversation using `conversation_uuid`, while processed historical conversations use a numeric conversation `id`. These are different identifier namespaces, so a simple equality comparison cannot safely perform the realtime-to-history handoff.

**Severity:** Medium

Without an explicit mapping, a provisional realtime signal can remain active even after the corresponding historical conversation has been processed.

**Workaround used:**  
CueNexa Loop maintains a bounded, process-local UUID↔numeric-ID bridge.

A mapping is accepted only when a Bee conversation payload explicitly contains both identifiers. CueNexa never guesses the relationship using conversation text, timestamps, or similarity.

The bridge:

- stores a maximum of 256 pairs;
- is never written to SQLite;
- disappears when `loops:watch` exits;
- leaves unmatched provisional signals to expire naturally.

**Actionable suggestion:**  
Provide one canonical conversation identifier across realtime and historical APIs, or include the processed-history conversation ID alongside `conversation_uuid` in realtime utterance events. A documented UUID-to-ID mapping API would also solve the problem safely.

---

## 4. Recently recorded conversations may not immediately appear in processed history

**Specific task attempted:**  
Perform end-to-end testing of CueNexa Loop by having a real conversation, then retrieving the processed conversation through Bee for Loop detection and reconciliation.

**Steps taken:**
1. Recorded a real conversation through Bee.
2. Verified the Bee CLI connection.
3. Queried processed conversation history from CueNexa Loop.
4. Waited and retried historical synchronization.
5. During acceptance testing, when the conversation was still not available, used Bee's manual **Process now** action.
6. Re-ran CueNexa Loop synchronization after processing completed.

**Expected result:**  
Once the recorded conversation ended, the processed conversation would become available through Bee history within a predictable amount of time, or expose a machine-readable processing state.

**Actual result:**  
During live acceptance testing, recently recorded conversations were not always immediately visible in processed history. In those cases, manually triggering Bee processing and then retrying the historical synchronization made them available.

From an integration perspective, the absence of the conversation did not clearly distinguish between:

- no conversation exists;
- the conversation exists but is still processing;
- processing failed;
- historical synchronization is simply early.

**Severity:** Medium

This does not affect already processed data, but it complicates deterministic end-to-end testing and realtime-to-history reconciliation.

**Workaround used:**  
CueNexa Loop treats realtime data as provisional only and keeps processed Bee history authoritative.

It uses:

- bounded historical refreshes;
- retry/coalescing rather than aggressive polling;
- gap repair after realtime disconnects;
- manual Bee processing when necessary during development/testing.

A missing historical conversation is never interpreted as a resolved Loop.

**Actionable suggestion:**  
Expose a documented processing lifecycle for conversations, for example:

```text
recording → uploaded → processing → processed → failed
```

Ideally this would be available through the CLI/API and accompanied by a realtime `conversation-processed` event containing the canonical historical conversation ID. A documented typical processing-latency range would also make integrations easier to test.

---

## Summary

The most important Bee integration frictions encountered by CueNexa Loop were not basic installation issues; they were contract and lifecycle boundaries that matter when building reliable realtime applications:

1. response payload contracts are not formally versioned/typed;
2. parsed realtime events lose transport event metadata;
3. realtime and historical conversation identity use different namespaces;
4. the historical processing lifecycle is not directly observable enough for deterministic handoff.

CueNexa Loop's architecture works around these conservatively by keeping processed Bee history authoritative, treating realtime observations as provisional, refusing guessed identity mappings, bounding retries/state, and minimizing persistent data.