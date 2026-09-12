# Privacy

CueNexa Loop exists to help someone follow through on their own
commitments, using their own Bee data. That only works if it is
trustworthy with data that is, by nature, extremely personal — ambient
transcripts of someone's conversations. Phase 0 and Phase 1 set the
privacy posture the rest of the project builds on, around six principles.

## Phase 1: no persistence

No Bee content, and no detected Loop item, is written to disk. There is
no database, no cache, no file CueNexa Loop writes containing Bee data or
detection/correlation results. `fetchBeeSnapshot`, `fetchDetectionSnapshot`,
`detectLoopItems`, and `correlateLoopItems` are all called fresh every run; every result lives only
in process memory for the lifetime of a single CLI invocation, then
exits. `detectLoopItems` is a pure function — it has no side effects and
no I/O of its own at all. `fetchDetectionSnapshot` additionally fetches
full conversation detail (not just list summaries — see
`docs/LOOP-DETECTION.md`, "Full conversation hydration") so
conversation-derived detection has real utterance text to work with, but
that fuller content is held under the exact same "in memory only, this
run only" rule — it is never cached to disk between runs, and hydration
failures are reported only as a generic, content-free warning.

## Phase 2: minimized local persistence

Phase 2 adds one local SQLite file for follow-through continuity. It stores
only a local thread ID, Phase 1 snapshot Loop IDs, hashed stable member
identities, lifecycle state, normalized ISO due instant, timestamps, a
derived title, and content-free structural change events. It never stores a
Bee transcript, utterance, summary, raw LoopItem text/evidence, location,
coordinates, person identity, credential, or raw correlation anchor. The
database defaults to `~/.cuenexa-loop/cuenexa-loop.sqlite`, supports the
`CUENEXA_LOOP_DB_PATH` override, uses best-effort owner-only permissions,
and can be erased with `npm run loops:reset -- --yes`.

Resolved local threads are retained for 30 days by default (bounded
`CUENEXA_LOOP_RETENTION_DAYS`); active threads are never purged. No local
state is sent anywhere: there is no telemetry, cloud service, LLM, vector
database, UI, or Bee write-back. Phase 4's later realtime listener does not
expand what Phase 2 persists.

## Phase 3 data categories

**Ephemeral source content** includes Bee conversations, utterances,
summaries, facts, todos, normalized LoopItems, evidence, and correlation
anchors. It may be processed in memory during sync and is not persisted.

**Persisted source-derived local state** is limited to stable thread IDs,
hashed member identities, snapshot Loop IDs, source lifecycle, normalized
due timestamps, structural timestamps/events, and the minimal derived title.

**Persisted user preference state** is isolated in its own table and contains
only acknowledgement time, snooze-until time, pin boolean, dismissal time,
and preference update time.

**Persisted notification ledger state** contains only a structural
notification ID, thread ID, notification type, structural trigger key, and
delivery timestamp. Notification body or title text is never stored there.

Phase 3 does not persist raw transcripts, utterance text, Bee summaries, raw
LoopItem text, evidence quotations, raw anchors, locations/coordinates,
speaker or person metadata, Bee credentials, arbitrary notes, or notification
body text. `loops:reset -- --yes` removes all CueNexa local tables by deleting
the local database; it never deletes or changes Bee data.

## Phase 4 ephemeral realtime data

`loops:watch` receives documented Bee realtime events only in its foreground
process. Raw event envelopes and transcript fragments remain in memory. The
adapter retains at most 512 dedupe identities, and provisional awareness keeps
at most 128 utterance groups with a ten-minute expiry. None of these records,
their text, or their provisional signals are passed to `LoopStore`, `loop_events`,
user preference tables, or the notification delivery ledger. The SQLite schema
remains version 2 with no Phase 4 migration.

Only a separate, bounded call to the existing processed-history sync path may
change persistent state. A realtime disconnect, correction, expiry, duplicate,
or missing event never establishes completion, resolution, deletion, or any
other authoritative fact.

## No real data in this repository

Every fixture under `packages/bee-adapter/src/fixtures` and
`packages/loop-engine/src/fixtures` is synthetic — invented names
("Speaker A", "Speaker B"), invented text, invented IDs
(`fact_synthetic_001`, `todo_synthetic_001`), invented addresses ("123
Fictional Avenue, Sampletown") — specifically so this public repository
never ships with anyone's real conversations, facts, todos, or account
information. `npm test` and CI run entirely against these fixtures; only
`npm run bee:check`, `npm run loops:check`, `npm run loops:correlate`, and
`npm run loops:watch`, run manually by the
repository owner against their own already-authenticated session, ever
touch real data, and their output is designed (see below) to contain
none of it.

## Strict privacy-by-default output

This is a mandatory requirement for every CueNexa Loop command, not a
convenience default that can be casually loosened later.

**`npm start`'s default output** (also what `npm run bee:check` prints)
contains only structural information — counts, connection status,
normalization status, and a warning count:

```text
CueNexa Loop — Bee Connectivity Check

Bee connection: OK
Conversations: 5
Facts: 12
Todos: 3
Normalization warnings: 0
Normalization: OK
Private content printed: NO
```

**`npm run loops:check`'s default output** follows the identical
principle for detection results — item counts by type plus a
cross-cutting count of items with a resolved deadline, never an item's
text, owner, due date value, or evidence:

```text
CueNexa Loop — Detection Check

Bee connection: OK

Conversations processed: 5
Facts processed: 12
Todos processed: 3

Commitments: 4
Decisions: 2
Delegations: 1
Follow-ups: 3
Deadlines: 2
Open questions: 1

Total Loop items: 13

Source warnings: 0
Detection warnings: 0
Detection completeness: COMPLETE
Private content printed: NO
```

**`npm run loops:correlate`'s default output** extends the same boundary
to Phase 1B. It reads only source/item/Loop counts, Loop lifecycle states,
warning counts, and completeness. It never reads titles, member text,
evidence, owners, counterparties, due dates, transcript/summary content,
locations, raw anchors, or warning messages, and ends with
`Private content printed: NO`. A synthetic test replaces private Loop
properties with throwing getters to verify they cannot be accessed.

Neither default output ever contains a conversation summary, detailed
summary, transcript text, fact text, todo text, speaker name, person's
name, address, latitude, longitude, Loop item text, owner label, or any
other conversational content — architecturally, not just by convention:
`renderConnectivityReport` (`packages/cli/src/presenter.ts`) only ever
reads `.length` off the snapshot's arrays and a fixed set of status
strings, and `renderLoopConnectivityReport`
(`packages/cli/src/loop-presenter.ts`) only ever reads `.length`/
`.filter().length` off the detection result; neither has a code path
that reads a record's `.text`, `.summary`, `.location`, `.utterances`,
`.owner`, or `.evidence`. `packages/cli/src/__tests__/presenter.test.ts`
and `packages/cli/src/__tests__/loop-presenter.test.ts` assert this
directly: each builds a snapshot/result from fixtures containing known
"sensitive" strings and checks the default report contains none of them,
not merely that emails/phones are redacted.

`loops:check` keeps input health visible without exposing input content:
`Source warnings` counts hydration/normalization warnings separately from
engine-level `Detection warnings`, and `Detection completeness` is
`PARTIAL` whenever the source-warning count is non-zero. Only the count is
printed; source-warning messages are not printed even in
`--include-content` mode because a provider warning could contain a value.

## Explicit content inspection

Private content requires deliberate user opt-in via `--include-content`
for any command:

```bash
npm start -- --include-content
npm run loops:check -- --include-content
npm run loops:correlate -- --include-content
npm run loops:review -- --include-content
npm run loops:notifications -- --include-content
npm run loops:notify -- --include-content
npm run loops:watch -- --include-content
```

Even in this mode:

- Email addresses and phone-number-shaped substrings are redacted
  (`[redacted-email]`, `[redacted-number]`) before anything is printed.
- Long values are truncated (with an ellipsis), and redaction always runs
  *before* truncation so a cut can never split a match and leak half of
  it.
- Precise latitude/longitude are **never** printed, even here — only a
  redacted/truncated human-readable location label, if present.

`--include-content` is for deliberate developer content inspection
(verifying the pipeline actually carries real conversational content, or
detects real Loop items, end-to-end); it is still not raw output — see
`packages/cli/src/presenter.ts`'s `renderContentReport`,
`packages/cli/src/loop-presenter.ts`'s `renderLoopContentReport`, and
`correlation-presenter.ts`'s `renderCorrelationContentReport`, which reuse
the same redact-then-truncate helpers. Correlation content mode still omits
evidence, parties, due dates, locations, transcripts, and raw anchors.

## No cloud processing

CueNexa Loop sends no data to AWS, Amazon Bedrock, analytics, telemetry
services, or any third-party API. The only process this codebase talks to
is the locally installed `bee` CLI (via `@beeai/cli/lib`), which in turn
talks to Bee's own servers using credentials CueNexa Loop never sees.
Loop detection and correlation (`@cuenexa-loop/loop-engine`) make no
network call — they are deterministic heuristics over in-memory data, not
LLM calls. Phase 1B derives raw anchors transiently; anchors are not
persisted, included in IDs or public links, or displayed. There is no
telemetry or analytics code anywhere in this repository.

## What a future phase must preserve

Any later native notification or UI boundary should:

- Treat "no persistence by default" as the default to opt out of, not the
  other way around — an explicit, user-initiated action should be required
  before any Bee-derived data is written anywhere.
- Keep the strict/opt-in output split: a default view with no
  conversational content, and any content view requiring explicit
  opt-in — not just for the CLI, but for any future interface.
- Continue keeping synthetic-only fixtures in this repository regardless
  of what real data the running application may later handle.
