# Privacy

CueNexa Loop exists to help someone follow through on their own
commitments, using their own Bee data. That only works if it is
trustworthy with data that is, by nature, extremely personal — ambient
transcripts of someone's conversations. Phase 0 and Phase 1A set the
privacy posture the rest of the project builds on, around six principles.

## No persistence

No Bee content, and no detected Loop item, is written to disk. There is
no database, no cache, no file CueNexa Loop writes containing Bee data or
detection results. `fetchBeeSnapshot`, `fetchDetectionSnapshot`, and
`detectLoopItems` are all called fresh every run; every result lives only
in process memory for the lifetime of a single CLI invocation, then
exits. `detectLoopItems` is a pure function — it has no side effects and
no I/O of its own at all. `fetchDetectionSnapshot` additionally fetches
full conversation detail (not just list summaries — see
`docs/LOOP-DETECTION.md`, "Full conversation hydration") so
conversation-derived detection has real utterance text to work with, but
that fuller content is held under the exact same "in memory only, this
run only" rule — it is never cached to disk between runs, and hydration
failures are reported only as a generic, content-free warning.

## No real data in this repository

Every fixture under `packages/bee-adapter/src/fixtures` and
`packages/loop-engine/src/fixtures` is synthetic — invented names
("Speaker A", "Speaker B"), invented text, invented IDs
(`fact_synthetic_001`, `todo_synthetic_001`), invented addresses ("123
Fictional Avenue, Sampletown") — specifically so this public repository
never ships with anyone's real conversations, facts, todos, or account
information. `npm test` and CI run entirely against these fixtures; only
`npm run bee:check` and `npm run loops:check`, run manually by the
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

Detection warnings: 0
Private content printed: NO
```

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

## Explicit content inspection

Private content requires deliberate user opt-in via `--include-content`,
for either command:

```bash
npm start -- --include-content
npm run loops:check -- --include-content
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
`packages/cli/src/presenter.ts`'s `renderContentReport` and
`packages/cli/src/loop-presenter.ts`'s `renderLoopContentReport`, which
reuses the same redact-then-truncate helpers.

## No cloud processing

CueNexa Loop sends no data to AWS, Amazon Bedrock, analytics, telemetry
services, or any third-party API. The only process this codebase talks to
is the locally installed `bee` CLI (via `@beeai/cli/lib`), which in turn
talks to Bee's own servers using credentials CueNexa Loop never sees.
Loop detection (`@cuenexa-loop/loop-engine`) makes no network call at
all — it's deterministic regex/heuristic matching over data already in
process memory, not an LLM call. There is no telemetry or analytics code
anywhere in this repository.

## Future cloud features

Any future cloud processing (Phase 1B cross-conversation correlation or
beyond) must require explicit user consent and be documented separately
from this file — this document describes Phase 0 and Phase 1A's
guarantees, not a promise about what a consenting user might opt into
later.

## What a future phase must revisit

Persistence, multi-source data, cross-conversation correlation, and
AI/LLM-driven extraction are explicitly out of scope for Phase 0 and
Phase 1A. When a future phase introduces any of them, it should:

- Treat "no persistence by default" as the default to opt out of, not the
  other way around — an explicit, user-initiated action should be required
  before any Bee-derived data is written anywhere.
- Keep the strict/opt-in output split: a default view with no
  conversational content, and any content view requiring explicit
  opt-in — not just for the CLI, but for any future interface.
- Continue keeping synthetic-only fixtures in this repository regardless
  of what real data the running application may later handle.
