# Ambient Realtime Awareness — Phase 4

## Status

**Design specification for Phase 4.**

Phase 4 begins only after the completed Phase 1–3 pipeline:

1. Phase 1 — detect and correlate unfinished work from processed Bee history.
2. Phase 2 — persist stable local Loop threads and determine what changed.
3. Phase 3 — let the user review, acknowledge, snooze, pin, dismiss, restore, and receive deduplicated local notification candidates.
4. **Phase 4 — add ambient realtime awareness without weakening the authoritative historical pipeline.**

The Phase 4 product question is:

> **Can CueNexa notice likely follow-through while a conversation is still happening, then safely hand off to the authoritative Phase 1–3 pipeline once Bee has processed the conversation?**

Phase 4 is intentionally not a rewrite of detection, correlation, persistence, or follow-through.

---

## 1. Core architectural rule

**Bee processed history remains authoritative. Realtime is an acceleration layer only.**

```text
Bee realtime stream
    ↓
Phase 4 realtime adapter
    ↓
normalized ephemeral realtime events
    ↓
provisional awareness
    ↓
provisional local presentation only
    ↓
Bee finishes processing conversation/history
    ↓
authoritative historical sync
    ↓
Phase 1 detection + correlation
    ↓
Phase 2 persistent reconciliation
    ↓
Phase 3 review/actions/notification planning
```

Realtime data MUST NOT directly create, resolve, reopen, mutate, or delete a persistent `LoopThread`.

Realtime data MUST NOT directly write to the Phase 2/3 SQLite state.

A realtime signal disappearing, arriving late, arriving twice, being corrected, or never arriving MUST NOT corrupt authoritative CueNexa state.

If realtime is unavailable, every Phase 1–3 command MUST continue to work exactly as it does today.

---

## 2. Source-of-truth boundary

Phase 4 introduces two explicit truth levels.

### 2.1 Provisional realtime awareness

Realtime observations are:

- ephemeral;
- non-authoritative;
- local-only;
- best-effort;
- allowed to be incomplete;
- allowed to disappear on process exit;
- never used as evidence that work is resolved;
- never persisted as a `LoopThread`, `LoopItem`, source event, notification delivery, or user action.

A provisional signal may say:

- a possible commitment was heard;
- a possible follow-up was heard;
- a possible delegation was heard;
- a possible deadline was heard;
- the conversation may contain unfinished work.

It MUST NOT claim that an authoritative Loop exists until the processed historical pipeline confirms it.

### 2.2 Authoritative processed history

Only the existing historical path may produce durable truth:

```text
fetchCompleteDetectionSnapshot
→ detectLoopItems
→ correlateLoopItems
→ LoopStore.reconcile
→ Phase 3 review / notification policy
```

Phase 4 MUST call or reuse this path rather than duplicating its business rules.

---

## 3. Non-goals

Phase 4 MUST NOT add:

- cloud services;
- a CueNexa server;
- telemetry or analytics;
- an LLM or embedding model;
- vector search;
- Bee write-back;
- modification of Bee facts or todos;
- OS/mobile push notification delivery;
- email/SMS delivery;
- a background daemon or system service;
- Electron, Flutter, React, Tauri, or another GUI framework;
- a second database;
- persistent storage of raw realtime transcripts;
- persistent storage of provisional utterances or provisional signals;
- automatic resolution based on realtime silence or disappearance;
- replacement of Phase 1 detection or correlation logic.

`loops:watch` is a foreground user-invoked process. It is not a daemon.

---

## 4. Package boundaries

Existing boundaries remain authoritative.

### `@cuenexa-loop/bee-adapter`

Owns all Bee-specific realtime integration.

It should expose a small provider-facing abstraction such as a realtime subscription/async-event interface without leaking Bee wire shapes into the rest of the monorepo.

The adapter MUST:

- use the official Bee CLI/library surface already trusted by this repository;
- inspect the actual installed Bee CLI/library capability before coding against a realtime method;
- keep all Bee-specific response/event parsing inside `bee-adapter`;
- classify connection/auth/malformed-event failures into privacy-safe typed errors;
- normalize events before they cross the adapter boundary;
- support dependency injection/fakes for tests;
- avoid shell interpolation or bespoke credential handling.

Do not introduce a hand-written Bee HTTP integration merely to obtain realtime events unless the official supported integration surface truly requires it and the change is separately justified in `docs/BEE_INTEGRATION.md`. The existing official integration path remains preferred.

### `@cuenexa-loop/contracts`

May define provider-independent ephemeral realtime contracts if needed.

Realtime contracts MUST be clearly named as provisional/ephemeral and MUST NOT be aliases of authoritative `LoopItem`, `Loop`, or `LoopThread`.

Example conceptual shape:

```ts
interface RealtimeUtterance {
  provider: string;
  sessionId: string | null;
  conversationId: string | null;
  utteranceId: string | null;
  observedAt: string;
  spokenAt: string | null;
  text: string;
  final: boolean | null;
}
```

Exact fields should match what can be normalized safely from the supported Bee realtime surface.

### `@cuenexa-loop/loop-engine`

May own pure provider-independent provisional awareness logic, but authoritative Phase 1 detection/correlation behavior MUST remain unchanged.

Do not pass provisional realtime records into persistence reconciliation.

### `@cuenexa-loop/loop-store`

No Phase 4 realtime content persistence is required.

Phase 4 should not change the database schema unless a concrete structural need is proven during implementation. A schema migration merely to persist realtime/provisional state is prohibited.

The existing schema v2 user state and notification ledger remain authoritative.

### `@cuenexa-loop/cli`

Owns the foreground watch runtime, orchestration, privacy-safe rendering, bounded refresh policy, and graceful shutdown.

---

## 5. Phase 4A — Bee realtime adapter

### Goal

Provide a testable, provider-contained realtime event stream without changing historical ingestion.

### Requirements

1. Inspect the installed `@beeai/cli` version and its supported realtime/developer API before implementing.
2. Document the exact supported realtime call/surface actually used.
3. Wrap it only inside `@cuenexa-loop/bee-adapter`.
4. Normalize every supported event into provider-independent ephemeral contracts.
5. Reject or warn on malformed event shapes rather than silently treating them as valid empty data.
6. Preserve privacy-safe error rendering; never print raw Bee payloads/stderr by default.
7. Handle disconnect/end-of-stream without treating it as evidence of completion or resolution.
8. Implement bounded reconnect/backoff if the official surface supports reconnectable subscriptions.
9. Do not assume replay. Realtime must be treated as potentially lossy/at-most-once unless the installed official surface explicitly guarantees stronger delivery.
10. Duplicate realtime events must not cause duplicate provisional presentation.

### Suggested checkpoint commit

`Phase 4A: add Bee realtime adapter`

---

## 6. Phase 4B — provisional awareness engine

### Goal

Turn normalized realtime utterances into conservative, ephemeral awareness signals while the conversation is happening.

### New concept

Use a distinct model such as `ProvisionalSignal`.

Conceptually:

```ts
type ProvisionalSignalType =
  | "possible_commitment"
  | "possible_follow_up"
  | "possible_delegation"
  | "possible_deadline";

interface ProvisionalSignal {
  id: string;
  type: ProvisionalSignalType;
  observedAt: string;
  conversationId: string | null;
  confidence: "strong" | "tentative";
  sourceEventIds: readonly string[];
}
```

Exact naming is flexible, but the type MUST make the non-authoritative nature obvious.

### Detection rules

- deterministic only;
- no LLM;
- conservative precision-first behavior;
- no cross-conversation correlation in the provisional layer;
- no resolution inference;
- no durable Loop identity assignment;
- no copying raw content into persistent state;
- stable in-process provisional IDs derived from structural event identity, not wall-clock randomness;
- bounded in-memory buffer;
- bounded deduplication window;
- corrected/finalized realtime utterances may replace prior provisional presentation but never mutate authoritative state.

Reuse existing pure text/deadline primitives only where that can be done without changing Phase 1 semantics. Do not force realtime fragments through APIs that assume a complete processed conversation if doing so changes their meaning.

### Privacy

Default watch output MUST be structural, for example:

```text
Possible follow-through detected (provisional)
Type: possible_commitment
Conversation/session: available
Content printed: NO
```

An explicit `--include-content` may show only a redacted/truncated ephemeral preview using the existing shared redact-before-truncate helper or an equivalent shared helper.

The preview MUST NOT be written to SQLite or notification delivery history.

### Suggested checkpoint commit

`Phase 4B: add provisional realtime awareness`

---

## 7. Phase 4C — authoritative handoff and reconciliation

### Goal

Safely replace provisional awareness with the existing authoritative pipeline once Bee processed history becomes available.

### Rules

1. Provisional signals are never converted directly into persistent Loop threads.
2. A bounded authoritative refresh invokes the existing complete historical pipeline.
3. When processed history confirms work, Phase 1–3 create/reuse the persistent thread normally.
4. When processed history does not yet contain the conversation, the provisional signal may remain visible in memory until its bounded expiry; absence MUST NOT be interpreted as rejection/resolution.
5. When provisional content expires without historical confirmation, it disappears silently from ephemeral state. No persistent delete/resolution event is generated.
6. Historical synchronization remains safe under partial snapshots.
7. Existing persistent identity rules remain unchanged.
8. New authoritative activity may invalidate a Phase 3 acknowledgement/dismissal according to existing Phase 3 policy; Phase 4 does not invent a second rule.
9. Phase 3 notification delivery dedupe remains the only durable notification dedupe mechanism for authoritative work.
10. A realtime signal itself MUST NOT create a Phase 3 delivery-ledger row.

### Authoritative refresh policy

Do not hammer Bee after every token/utterance.

Use a bounded deterministic refresh strategy such as:

- debounce conversation activity;
- trigger a historical refresh when realtime indicates a conversation/session ended or became idle if the official event model exposes such a signal;
- otherwise refresh after a documented bounded idle interval;
- rate-limit authoritative sync attempts;
- allow an explicit manual refresh while watching;
- after disconnect/reconnect, perform one bounded authoritative refresh because realtime may have gaps.

Exact intervals may be chosen during implementation, but they must be constants/configuration with deterministic tests and documented defaults.

Implementation note for `@beeai/cli` 0.7.3: `streamJson().events[].data`
contains only parsed `data:` JSON, so CueNexa identifies the documented raw
utterance and conversation structures rather than relying on discarded SSE
`event:`/`id:` fields. Realtime UUIDs and historical numeric IDs remain
separate unless Bee supplies both in one conversation payload; that exact
mapping is held only in a bounded foreground adapter bridge. Refresh hints
received during the 60-second cooldown or an in-flight attempt set one
coalesced pending request, which is attempted once when the shared limit
allows. A failed attempt retains that one bounded pending request.

### Suggested checkpoint commit

`Phase 4C: reconcile realtime awareness with processed history`

---

## 8. Phase 4D — foreground ambient runtime

### Primary command

Add:

```bash
npm run loops:watch
```

Optional:

```bash
npm run loops:watch -- --include-content
```

### Startup behavior

Recommended sequence:

1. open the existing LoopStore, automatically using the current schema;
2. authenticate through the Bee adapter;
3. perform one authoritative `loops:sync`-equivalent refresh to establish current persistent truth;
4. render a concise Phase 3 review summary or watch-ready status;
5. subscribe to realtime;
6. show provisional awareness as events arrive;
7. periodically/conditionally perform bounded authoritative refreshes;
8. if authoritative state changes, render only meaningful changes and existing Phase 3 notification eligibility;
9. do not automatically mark Phase 3 notification candidates delivered merely because watch displayed a review update unless the implementation explicitly invokes the existing delivery action with documented semantics.

### Runtime safety

- foreground process only;
- graceful `SIGINT` / `SIGTERM` cleanup;
- close Bee subscription and SQLite store;
- bounded in-memory buffers;
- no unbounded event arrays;
- no busy loops;
- bounded reconnect backoff;
- no raw payload logging by default;
- privacy-safe errors;
- no credentials persisted by CueNexa;
- no separate lock-in to a GUI/runtime framework.

### Degraded operation

If realtime connection fails:

```text
Realtime unavailable — authoritative CueNexa state remains available.
```

The runtime may attempt bounded reconnects, but persistent state must remain readable. Existing standalone commands remain unaffected.

If the user stops `loops:watch`, no realtime/provisional state needs to survive.

### Suggested checkpoint commit

`Phase 4D: add ambient loops watch runtime`

---

## 9. Phase 4E — demo and hackathon experience

### Goal

Demonstrate the complete CueNexa Loop value chain without pretending realtime is authoritative.

The demo story should be:

```text
1. A conversation is happening.
2. CueNexa hears a possible follow-through item.
3. CueNexa labels it PROVISIONAL.
4. Bee later exposes processed history.
5. CueNexa runs its existing authoritative detection/correlation.
6. The same real work becomes a persistent LoopThread.
7. Phase 3 review/actions/notification planning take over.
8. No duplicate durable thread or duplicate notification is created merely because realtime saw it first.
```

### Demo command

Extend `loops:demo` only if doing so keeps it safe and deterministic, or add a synthetic realtime demo fixture/test harness that does not require a live Bee stream for CI.

The live Bee acceptance path may use `loops:watch`.

### Suggested checkpoint commit

`Phase 4E: polish ambient realtime demo`

---

## 10. Presentation semantics

Realtime output must use explicit language that distinguishes provisional from authoritative state.

Good:

```text
PROVISIONAL — possible commitment detected
Waiting for processed Bee history before creating a persistent Loop.
```

Bad:

```text
New Loop created
Commitment confirmed
Task is open
```

unless the authoritative historical sync actually produced that result.

Default output must remain privacy-safe and structural.

---

## 11. Realtime deduplication and correction

Realtime transport can be noisy. Phase 4 needs in-memory deduplication independent of the Phase 3 durable notification ledger.

### Requirements

- dedupe identical provider event IDs when available;
- otherwise derive a bounded structural fingerprint from safe event metadata;
- never use only current wall-clock time as identity;
- corrected/finalized versions of an utterance should replace prior provisional presentation when identifiable;
- avoid emitting the same provisional signal repeatedly for successive fragments of the same utterance;
- in-memory dedupe state may be discarded on process restart;
- no provisional delivery ledger is required.

Historical Phase 1–3 identity remains separate and authoritative.

---

## 12. Reconnect and gap semantics

A realtime disconnect means only:

> CueNexa may have missed realtime observations.

It does NOT mean:

- a conversation ended;
- work completed;
- a commitment was withdrawn;
- a Loop resolved;
- an item should disappear from persistent state.

After a reconnect or suspected gap, perform a bounded authoritative historical refresh. Processed history repairs the truth; CueNexa must not attempt to reconstruct authoritative history from realtime fragments.

---

## 13. Time semantics

- use absolute ISO-8601 instants internally;
- accept Bee event timestamps defensively through adapter normalization;
- use injected/fixed clocks in tests;
- no wall-clock-flaky tests;
- provisional deadlines may be displayed as provisional only;
- final/durable deadlines come from the existing authoritative detection pipeline.

---

## 14. Security and privacy requirements

Phase 4 inherits all existing requirements from `PRIVACY.md`, `SECURITY.md`, and `BEE_INTEGRATION.md`.

Additionally:

- raw realtime transcript text stays memory-only;
- no raw realtime payload is persisted;
- no provisional content enters `loop_events`;
- no provisional content enters `loop_thread_user_state`;
- no provisional content enters `loop_notification_deliveries`;
- no raw realtime payload is printed by default;
- `--include-content` must redact before truncation;
- no raw Bee errors/stderr should leak into normal CLI output;
- no credentials or auth tokens are read/persisted by CueNexa;
- no shell command construction from event content;
- no SQL from event content;
- bounded memory and parser inputs;
- malformed events degrade one event/connection safely rather than crashing into data loss.

`loops:reset -- --yes` continues to erase only CueNexa persistent local state. There is no Phase 4 realtime persistence to erase.

---

## 15. Backward compatibility

All existing commands MUST remain operational:

```text
bee:check
loops:check
loops:correlate
loops:sync
loops:today
loops:review
loops:ack
loops:snooze
loops:unsnooze
loops:pin
loops:unpin
loops:dismiss
loops:restore
loops:notifications
loops:notify
loops:history
loops:reset
loops:demo
```

Phase 4 adds `loops:watch` without changing their public semantics.

Phase 1 detection/correlation must not regress.

Phase 2 persistent identity/reconciliation must not regress.

Phase 3 user-state precedence and notification deduplication must not regress.

---

## 16. Mandatory test coverage

### Phase 4A adapter

Test:

- successful subscription/event normalization;
- malformed event handling;
- duplicate provider event IDs;
- connection close/disconnect;
- auth failure;
- privacy-safe error mapping;
- cancellation/cleanup;
- reconnect/backoff using fake timers where applicable.

No test should require the live Bee service in CI.

### Phase 4B provisional awareness

Test:

- strong commitment signal;
- follow-up signal;
- delegation signal;
- provisional deadline signal;
- fragments do not spam duplicate signals;
- corrected/final utterance replaces or supersedes provisional fragment;
- no resolution inference;
- no cross-conversation provisional correlation;
- bounded buffer eviction;
- deterministic ordering/ties;
- default output contains no raw conversation text;
- `--include-content` redacts before truncating.

### Phase 4C handoff

Test:

- provisional signal creates no database rows;
- historical confirmation creates/reuses a persistent thread through existing reconciliation;
- unconfirmed provisional signal expires without deleting/resolving anything;
- realtime duplicate + authoritative history creates only one persistent thread;
- realtime gap followed by historical sync repairs truth;
- partial historical snapshot does not infer absence/resolution;
- existing acknowledged/dismissed state reacts only through existing Phase 3 rules when authoritative new activity arrives;
- realtime never creates a Phase 3 notification-delivery row.

### Phase 4D runtime

Test:

- initial authoritative sync precedes realtime watch-ready state;
- graceful SIGINT/SIGTERM abstraction cleanup;
- realtime failure leaves persistent review available;
- reconnect triggers at most the documented bounded refresh behavior;
- gap/processed/idle hints received during cooldown are coalesced and later
  attempted once rather than discarded;
- UUID-only provisional awareness is retired by numeric processed history only
  after an explicit provider-supplied UUID↔ID mapping;
- no busy loop;
- bounded memory;
- old commands still work.

### Regression

Run all existing Phase 1–3 tests unchanged.

---

## 17. Validation gate

Before Phase 4 is considered complete:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm audit
```

CI must stay compatible with repository Node requirements (Node >=22; CI Node 22).

Do not redesign the repository around a developer machine's newer Node version.

---

## 18. Live manual acceptance

After merge, perform live testing without resetting the real database.

### Existing state safety

1. Pull `main`.
2. Keep the existing Phase 3 SQLite database.
3. Run `loops:review -- --include-content`.
4. Confirm existing persistent threads and Phase 3 user state are unchanged.

### Realtime watch

1. Run `npm run loops:watch`.
2. Start a Bee-recorded conversation.
3. Say a clear action/commitment related to a test topic.
4. Confirm CueNexa may surface a **PROVISIONAL** signal only.
5. Confirm no new `LoopThread` exists solely because of realtime.
6. Allow Bee to process the conversation; use Bee's manual processing action if required by observed Bee behavior.
7. Let `loops:watch` perform a bounded authoritative refresh, or run `loops:sync` manually if needed.
8. Confirm the existing Phase 1–3 pipeline creates/reuses the authoritative persistent thread.
9. Confirm the provisional signal is retired/replaced in presentation.
10. Confirm no duplicate persistent thread is created.
11. Confirm Phase 3 notification eligibility/deduplication still behaves normally.

### Realtime failure

1. Interrupt or simulate realtime connectivity loss.
2. Confirm no persistent work is resolved/deleted.
3. Confirm `loops:review` still works.
4. Reconnect and confirm a bounded historical refresh restores authoritative truth.

---

## 19. Implementation workflow

Use one branch:

```text
phase-4-ambient-realtime-awareness
```

Create one PR against `main`. Do not merge until audited.

Preferred checkpoint commits:

1. `Phase 4A: add Bee realtime adapter`
2. `Phase 4B: add provisional realtime awareness`
3. `Phase 4C: reconcile realtime awareness with processed history`
4. `Phase 4D: add ambient loops watch runtime`
5. `Phase 4E: polish ambient realtime demo`
6. optional hardening/docs commit

Continue through checkpoints unless there is a genuine architectural blocker caused by the actual supported Bee realtime surface.

If the official installed Bee CLI/library does not expose a safely usable realtime API, STOP before inventing a private/unsupported protocol. Document the blocker with exact inspected evidence and propose the smallest supported alternative.

---

## 20. Required implementation report

The Phase 4 PR report must include:

- branch;
- PR number;
- starting `main` SHA;
- final head SHA;
- checkpoint SHAs;
- changed-file/addition/deletion counts;
- exact Bee realtime API/surface used and installed CLI/library version inspected;
- delivery/replay guarantees actually observed/documented;
- normalized ephemeral contract;
- provisional signal model;
- in-memory dedupe/buffer limits;
- reconnect/backoff behavior;
- authoritative refresh policy and limits;
- proof that realtime does not write authoritative persistence;
- proof that no schema migration was introduced unless explicitly justified;
- `loops:watch` behavior;
- privacy/default-output behavior;
- tests and test totals;
- typecheck/build/audit results;
- CI run/result;
- limitations;
- manual QA steps.

The report must explicitly answer:

1. Can realtime create a persistent LoopThread by itself? **NO**
2. Can realtime resolve/reopen/delete a LoopThread by itself? **NO**
3. Is processed Bee history still authoritative? **YES**
4. Does realtime raw transcript text enter SQLite? **NO**
5. Do provisional signals enter the Phase 3 notification ledger? **NO**
6. Does realtime failure break `loops:sync`/`loops:review`? **NO**
7. Is Phase 1 correlation behavior changed? **NO**, unless an audited bug fix is explicitly required
8. Is Phase 2 persistent identity behavior changed? **NO**, unless an audited bug fix is explicitly required
9. Are Phase 3 user-action precedence rules preserved? **YES**
10. Is exact authoritative notification dedupe preserved? **YES**
11. Is a cloud service/LLM/telemetry added? **NO**
12. Is Bee write-back added? **NO**
13. Is `loops:watch` a foreground process rather than a daemon? **YES**
14. Can a realtime disconnect be interpreted as completion/resolution? **NO**
15. Are historical refresh attempts bounded/rate-limited? **YES**

---

## 21. Completion definition

Phase 4 is complete when CueNexa can safely notice possible follow-through during a live conversation, clearly mark it as provisional, survive realtime gaps/failure, and then hand authority back to the existing processed-history pipeline without producing duplicate durable state or weakening Phase 1–3 privacy, persistence, or notification guarantees.
