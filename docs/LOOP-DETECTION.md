# Loop Detection (Phase 1A)

## What a Loop item is

Bee remembers what happened. CueNexa Loop helps you understand what
remains unfinished. A **Loop item** is one structured, individual piece
of that: a commitment, decision, delegation, follow-up, or open question
that CueNexa Loop found explicit evidence for in your normalized Bee
data. Phase 1A produces individual `LoopItem` records only — it does not
yet group related items across conversations into a persistent "Loop"
(that's Phase 1B; see "Explicitly out of scope" below).

```text
Bee
  ↓  conversations.list() + conversations.get(id) hydration — see "Full conversation hydration"
Bee Adapter
  ↓
Normalized CueNexa Contracts (LoopConversation / LoopFact / LoopTodo)
  ↓
Loop Detection Engine  (packages/loop-engine)
  ↓
Structured Loop Items (LoopItem[])
```

## Supported Phase 1A types

`LoopItemType` is `"commitment" | "decision" | "delegation" | "follow_up" | "deadline" | "open_question"`.

Phase 1A's detectors emit five of these six directly: commitment,
decision, delegation, follow_up, and open_question. **`"deadline"` is
never emitted as an item type by Phase 1A** — it's kept in the type union
for schema completeness (matching the domain model as specified), but a
deadline is represented as the `dueAt`/`dueAtPhrase` attributes on
whichever other item type it belongs to, not as a standalone item. The
"Deadlines: N" count in the CLI report counts items with a resolved
`dueAt`, cross-cutting all types, not a count of `type === "deadline"`
items. See "Deadline resolution" below.

## Full conversation hydration: `bee:check` vs. `loops:check`

Bee's `conversations.list()` endpoint returns **summary-only** records —
verified against a live account: no nested `transcriptions[]` at all, only
`id`, timestamps, summary text, and location. Only
`conversations.get(id)` returns the full detail with
`transcriptions[].utterances[]`. This matters a great deal for detection:
without fetching that detail, every `LoopConversation.utterances` array
normalizes to empty, and conversation-derived detection can never fire —
only Bee Todos and Facts would ever produce items, silently.

Two functions in `@cuenexa-loop/bee-adapter` reflect this:

- **`fetchBeeSnapshot`** — list-only. Used by `npm run bee:check`, which
  only needs counts for a connectivity check, not conversation content.
- **`fetchDetectionSnapshot`** — additionally hydrates each listed
  conversation's full detail via `conversations.get(id)`. Used by
  `npm run loops:check`, since Loop detection is meaningless without
  actual utterance text.

Hydration (`packages/bee-adapter/src/service.ts`) is:

- **Per-conversation and non-fatal.** A conversation whose detail fetch
  fails (throws, or returns nothing) falls back to its list-summary data
  — included in the snapshot with empty utterances, plus a warning
  explaining why — rather than being dropped or aborting the whole
  snapshot.
- **Bounded-concurrency**, not serial or unbounded-parallel — at most 4
  concurrent `conversations.get(id)` calls by default (configurable via
  `fetchDetectionSnapshot`'s `concurrency` option), via a small
  dependency-free `mapWithConcurrency` helper.
- **Content-silent in its warnings.** A hydration warning names the
  conversation id and a generic reason; it never includes summary or
  transcript text.
- **Pagination-preserving.** The `next_cursor` from the original
  `conversations.list()` call is carried through unchanged —
  hydration only affects each already-listed conversation's detail, not
  which page of conversations was fetched.

See the orchestration test in `packages/cli/src/__tests__/
detection-orchestration.test.ts` (a fake Bee client whose `list()` returns
a summary-only conversation and whose `get(id)` returns the same
conversation with real utterances) and the hydration-mechanics tests in
`packages/bee-adapter/src/__tests__/service.test.ts`.

## Detection philosophy: precision over recall

CueNexa Loop is not a meeting summarizer or a generic todo app — its
value depends on not crying wolf. **It is better to miss a weak possible
commitment than to create a misleading one.** Concretely, this means:

- Every detector looks for **structural/linguistic signals**, not broad
  keyword matching — "I'll", "I will", "I can <verb>" as a first-person
  future-commitment trigger; "we're going with", "we decided to" as an
  explicit-decision trigger; direct address or third-person "will" as a
  delegation trigger; a genuine question mark, minus recognizable
  rhetorical shapes, for open questions.
- Hedged language ("maybe", "perhaps", "might", "could possibly", "we
  should consider") suppresses an otherwise-matching commitment or
  decision entirely, rather than lowering its confidence — a hedge means
  "this isn't firm," not "this is a slightly-less-firm commitment."
- An explicit negation suppresses a commitment, follow-up, or delegation
  entirely — see "Negation" below for exactly which forms.
- Bee Facts are conservative by design: a fact only becomes a Loop item
  when the fact text itself matches one of the same structural detectors
  used for conversation text (an explicit question, decision, etc.) — a
  purely descriptive fact like "Prefers morning meetings" never becomes
  one, because it never matches any detector's pattern in the first
  place. There's no separate "is this fact actionable" heuristic; the
  same conservatism that governs conversation text governs facts.
- Low-confidence candidates are suppressed by default (see "Confidence
  semantics" below) rather than shown with a caveat.

## Candidate → validation → LoopItem pipeline

```text
Per conversation:
  utterances → detectSentence() per sentence (see "Precedence") → candidates
    → suppressResolvedOpenQuestions() — drops questions answered later in the *same* conversation

Facts, open Bee Todos: candidates directly (no per-conversation step)
Completed Bee Todos: CompletionSignal (never becomes a candidate or a LoopItem)

All candidates
  ↓  deduplicateCandidates()
Deduplicated candidates
  ↓  reconcileCompletions() — drops candidates a completed Todo's CompletionSignal matches
  ↓  confidence filter (SUPPRESSION_THRESHOLD)
  ↓  LoopItemSchema.parse()
LoopItem[]  (validated, id-assigned, state: "open")
```

This two-stage design (`packages/loop-engine/src/types.ts`'s
`DetectionCandidate` vs. `LoopItem`) exists specifically so a later phase
(1B's cross-conversation correlation) has a clean seam to plug into
between "raw detections" and "accepted items," without having to unpick
validated, id-assigned `LoopItem`s.

### Follow-up vs. commitment precedence

A single sentence never produces more than one candidate
(`detectSentence` in `detectors/index.ts` runs every detector and returns
the first match in a fixed order). Follow-up and commitment are mutually
exclusive by construction: `detectCommitment` explicitly declines a
sentence that also carries an explicit follow-up verb ("check back",
"check in", "check with", "circle back", "revisit", "follow up"),
deferring to `detectFollowUp` instead. When a follow-up sentence *also*
carries an explicit "I'll"/"I will" trigger (e.g. "I'll check with the
vendor tomorrow."), it's still classified `follow_up`, but keeps the
higher, explicit-commitment confidence tier — it's still a strong,
explicit self-commitment, just to a follow-up action specifically.

## Confidence semantics

Confidence is a **deterministic heuristic score, not a calibrated ML
probability** (`packages/loop-engine/src/confidence.ts`). It encodes a
fixed ranking of "how explicit was the structural signal":

| Range       | Meaning                                            |
| ----------- | --------------------------------------------------- |
| 0.90 - 1.00 | Explicit Bee Todo, or explicit first-person commitment ("I'll"/"I will") |
| 0.80 - 0.89 | Strong explicit linguistic signal (decision, delegation) |
| 0.70 - 0.79 | Moderately clear signal (follow-up, open question) |
| below 0.70  | Suppressed from output entirely                     |

All Phase 1A detectors use fixed, named constants from `confidence.ts` —
there is no scattered magic-number tuning per detector. `SUPPRESSION_THRESHOLD`
(0.70) is applied once, centrally, in `engine.ts`, after deduplication.

## Negation

`packages/loop-engine/src/negation.ts` covers, for a given subject, a
modal-verb negation with an allowed short adverbial gap: `<subject>
won't...`, `<subject> will not...`, `<subject> will <=2 words> not...`
(e.g. "will definitely not"), and `<subject> will never...`. This is
applied to:

- **First-person commitments and follow-ups** ("I will never send the
  proposal.", "I will definitely not send the proposal.", "I will never
  follow up with the vendor.") — `hasCommitmentNegation` is checked first
  in both `detectCommitment` and `detectFollowUp`, so a negated sentence
  is suppressed before either detector's positive pattern is even
  consulted.
- **Third-person delegation** ("Sarah will not prepare the report.") —
  `detectDelegation`'s third-person-"will" pattern now also captures the
  text immediately following "will" and checks it for a negated
  continuation (`isNegatedContinuation`) before treating the sentence as
  an assignment of responsibility; without this, "Sarah will not prepare
  the report" would otherwise read as delegating exactly the opposite of
  what was said.

This stays a narrow, deterministic pattern — not general NLP negation —
by design; the two-word gap cap exists specifically so it doesn't drift
into open-ended negation-scope detection. See "Limitations" for the
known false-positive this accepts as a tradeoff ("not only X but also
Y").

## Deduplication

Deduplication is **within-snapshot only, deterministic, and
token-overlap based** — no embeddings, no cross-conversation matching
(that's explicitly Phase 1B's job; see below).

`deduplicateCandidates` (`packages/loop-engine/src/dedup.ts`) compares
each pair of candidates' raw evidence text (not their cleaned display
text) using Jaccard similarity over a stopword-filtered token set, and
merges when similarity is ≥ 0.7. That threshold was tuned deliberately
conservative: short action sentences share a lot of boilerplate ("I'll
send the ___ tomorrow"), so *three different* commitments — "send the
estimate/invoice/contract tomorrow" — measure ~0.6 similarity against
each other, while the true positive this mechanism exists for (a
conversation commitment and its matching Bee Todo, which typically
differ only by the todo lacking a leading "I'll") measures ~0.75. See
the regression tests in `packages/loop-engine/src/__tests__/dedup.test.ts`
for both cases locked in as tests, not just tuned by feel.

**Bee Todos are treated as high-confidence evidence, not ignored**: an
open Bee Todo almost always produces a `commitment` (or `follow_up`, if
its text matches follow-up verbs) candidate on its own, with Bee's own
already-resolved `dueAt` preferred over re-parsing the todo text. When a
conversation utterance and a Bee Todo describe the same action, dedup
merges them into one `LoopItem` carrying evidence from both sources,
rather than reporting the same task twice.

A merge is only attempted between candidates that could plausibly be "the
same snapshot action" — two candidates from two **different**, named
conversations never merge, even with identical text; a todo or fact
(no `conversationId` of its own) can still merge with a
conversation-sourced candidate. See `eligibleToMerge` in `dedup.ts`.

## Completion reconciliation

CueNexa Loop's purpose is surfacing what remains *unfinished*. Without
reconciliation, a completed Bee Todo and its matching conversation
commitment would disagree: the todo says done, but the conversation-
derived candidate has no way to know that, and would still surface as an
open item. `packages/loop-engine/src/completion.ts` fixes this:

- A **completed** Bee Todo never becomes a candidate or a `LoopItem`
  itself — it becomes a `CompletionSignal` (just its text and todo id),
  used only to check other candidates against.
- `reconcileCompletions`, run after deduplication, drops any candidate
  whose evidence text conservatively matches (same 0.7 Jaccard threshold
  and comparison approach as deduplication itself — this is the same
  "same action?" judgment, just against a completion signal instead of
  another open candidate) a completion signal's text.
- An unrelated completed todo never affects an unrelated open candidate:
  "Send the estimate tomorrow." (completed) does not suppress "I'll send
  the *invoice* tomorrow." (open) — these measure ~0.4 similarity,
  comfortably below the 0.7 threshold. See the "completion reconciliation"
  tests in `__tests__/engine.test.ts`, which cover both the audit's
  required cases exactly.

## Deadline resolution

`packages/loop-engine/src/deadline.ts` is a small, isolated temporal
resolver — deliberately not a general natural-language date engine.
It recognizes: `tomorrow`, `today`, `by end of day`, `next week`, a bare
or "next"-prefixed weekday name, and an explicit `Month Day` phrase
(e.g. "September 15"). Anything else is left unresolved: the engine never
invents a date. When a phrase is recognized but not confidently
resolvable, it's preserved as `dueAtPhrase` on the `LoopItem` even though
`dueAt` stays `null` — so the raw temporal language isn't silently lost,
just not converted to an absolute timestamp CueNexa Loop isn't sure
about.

For commitment/follow-up items specifically, once a deadline phrase is
extracted, it's also stripped from the item's displayed `text` (e.g. "I'll
send the revised proposal tomorrow." → text: "Send the revised proposal",
`dueAt`: the resolved timestamp) — for decision/delegation/open_question
items, the text is left as-is.

### Time zone awareness

Calendar phrases ("today", "tomorrow", weekday names, "by end of day")
mean the *local* calendar day where the conversation happened, not the
UTC calendar day — these differ near local-midnight boundaries. Example
from the audit that caught this: at `2026-09-09T17:00:00Z` it's already
`2026-09-10 01:00` local in `Asia/Manila` (UTC+8); "I'll send it
tomorrow." must resolve to the local Sep 11, not a UTC-derived Sep 10. A
naive UTC-only implementation gives `2026-09-10T00:00:00.000Z` here
instead of the correct `2026-09-10T16:00:00.000Z` — see the regression
test in `__tests__/deadline.test.ts` built directly from this example.

`LoopDetectionInput.timeZone` (an IANA identifier, e.g.
`"America/Los_Angeles"`) is now a required field. `extractDeadline` uses
only built-in `Intl`/`Date` (no new dependency) to compute a zone's UTC
offset *at the specific instant in question* — correctly reflecting DST —
and to determine "today" from that zone's perspective before resolving
any relative phrase. See the `getTimeZoneOffsetMinutes` /
`localDateInZone` / `zonedMidnightUTC` helpers in `deadline.ts`.

CueNexa Loop resolves which time zone to use, in priority order
(`packages/cli/src/timezone.ts`):

1. An explicit `LOOP_TIMEZONE` environment variable override.
2. **Bee's own account time zone** — verified present as a `timezone`
   field (e.g. `"America/Los_Angeles"`) on the real, authenticated `bee me
   --json` profile response, surfaced through
   `BeeAdapterClient.ensureAuthenticated()`'s return value (a bonus from
   the same profile call already needed for the auth check — see
   `docs/BEE_INTEGRATION.md`).
3. The local system's IANA time zone
   (`Intl.DateTimeFormat().resolvedOptions().timeZone`), as a documented
   last-resort fallback when neither of the above is available.

CueNexa Loop never silently assumes UTC.

### Invalid dates are never invented

The absolute month/day resolver validates that the constructed calendar
date's year/month/day still exactly match what was requested —
JavaScript's `Date` silently *normalizes* an invalid date instead of
rejecting it (e.g. `new Date(Date.UTC(2026, 8, 31))`, "September 31",
quietly becomes October 1), which would otherwise invent a deadline that
was never actually said. "September 31", "April 31", and "February 30"
always resolve to `dueAt: null` (with `dueAtPhrase` preserved);
"February 29" resolves only when the calendar year actually being
targeted is a real leap year. See `isValidCalendarDate` in `deadline.ts`
and the regression tests covering all five cases in
`__tests__/deadline.test.ts`.

## Open-question reconciliation

Sentence-by-sentence detection alone means almost any non-rhetorical
sentence ending in "?" becomes `open_question` — including one immediately
answered in the very next line ("Who owns deployment?" / "Alex owns
deployment."). That's not actually unresolved, so surfacing it as an open
Loop item would be misleading.

`packages/loop-engine/src/question-resolution.ts` adds a conservative,
**same-conversation-only** resolution pass — this is not Phase 1B
cross-conversation correlation, it never looks outside the single
conversation the question came from:

- For each `open_question` candidate, look forward up to 5 utterances
  within the *same* conversation.
- Skip any later utterance that is itself a question — a question is
  never treated as an answer to another question.
- If a later, non-question sentence shares enough vocabulary with the
  question (Jaccard similarity ≥ 0.4 — lower than dedup/completion's 0.7,
  because a real answer replaces the interrogative word with new
  information rather than restating the sentence: "who owns deployment"
  → "Alex owns deployment" only overlaps on "owns"/"deployment"), the
  question is suppressed as resolved.
- "No one knows yet." does **not** resolve "Who owns deployment?" — zero
  token overlap, comfortably below the threshold — so the question
  correctly stays open. Precision over recall: when in doubt, the
  question stays open.

Rhetorical-question exclusion (see "Detection philosophy" above) runs
independently at the per-sentence detector level and is unaffected by
this pass.

## Provenance and evidence are mandatory

Every `LoopItem` carries a non-empty `evidence` array and a `source`
object (`provider`, `conversationId`/`factId`/`todoId`,
`utteranceIndexes`) — the Zod schema (`LoopItemSchema`) enforces
`evidence.min(1)` at the type level, so a `LoopItem` can never be produced
without an answer to "why did CueNexa Loop think this was a commitment?"
Evidence text is the **raw** source sentence/fact/todo text, not the
cleaned display text — this is also what deduplication compares against
(see above).

## Privacy behavior

Phase 1A maintains every Phase 0 privacy guarantee (see `docs/PRIVACY.md`)
and applies the same strict-default / explicit-opt-in split to detection
output:

- **`npm run loops:check`** (default) prints only structural counts:
  conversations/facts/todos processed, a count per Loop item type, a
  cross-cutting count of items with a resolved deadline, total item
  count, and a warning count. It never prints an item's `text`, `owner`,
  `dueAt`, or `evidence` — architecturally, not just by convention:
  `renderLoopConnectivityReport` only ever calls `.length` and `.filter().length`
  on the result, never reads a `LoopItem`'s content fields.
- **`npm run loops:check -- --include-content`** is required to see
  redacted/truncated item text, owner labels, resolved due dates, and
  evidence quotes. It reuses the exact same redact-then-truncate
  presenter helpers as Phase 0's `bee:check --include-content`
  (`packages/cli/src/presenter.ts`'s `previewText`), so email addresses
  and phone numbers are masked and long values are truncated before
  anything is printed.
- No Loop item, candidate, or detection result is ever written to disk.
  `detectLoopItems` is pure and stateless — call it again, get a fresh
  result, nothing persists between runs.
- No cloud service, LLM API, or telemetry is involved anywhere in
  detection. It's deterministic regex/heuristic matching running entirely
  in the same local process as Phase 0's adapter.
- **Hydration doesn't change these guarantees, it just means more real
  content flows through the same in-memory pipeline.** `loops:check` now
  fetches full conversation detail (not just summaries) to make
  conversation-derived detection possible at all — but that detail is
  still never written to disk, still never printed by default, and
  redaction/truncation still apply identically in `--include-content`
  mode. Hydration warnings (see "Full conversation hydration" above)
  never include summary or transcript text, only conversation ids and a
  generic reason.

## Limitations

- **Naive sentence splitting.** `splitSentences` treats `.`/`!`/`?`
  followed by whitespace-or-end-of-string as a sentence boundary — this
  correctly avoids breaking mid-email/mid-domain ("jordan@example.com"),
  but has no real abbreviation handling ("Dr. Smith" would still split).
- **"Next `<weekday>`" is genuinely ambiguous in English** and this
  resolver picks one simple, documented convention (always skip today's
  occurrence) rather than attempting to infer intent from context.
- **Rhetorical-question detection is shallow.** Only a small set of
  recognizable tag-question and negative-polarity-opener shapes are
  excluded; a purely social "How's it going?" is structurally
  indistinguishable from a real open question and would be detected as
  one.
- **No speaker-identity resolution.** Delegation `owner` labels are
  whatever name/label literally appears in the source text — no
  resolution against a contact list or speaker diarization beyond what
  Bee itself already provides.
- **Negation handling is still pattern-based, not general NLP negation**,
  even after the audit-remediation expansion (`will never`, `will <=2
  words> not`, third-person `will not`/`won't`). A known accepted false
  positive: idiomatic "I will not only send the proposal but also follow
  up." would still be read as negated, since "not" appears within the gap
  allowance regardless of the "not only... but also" construction. Cross-
  utterance retraction reasoning is still not attempted (a later
  "actually, don't send it yet" isn't linked back to an earlier
  commitment to retract it — it simply doesn't produce its own commitment
  either, since imperative "don't X" never matches the positive
  commitment pattern).
- **Deadline resolution covers a fixed phrase set** (see above) — no
  general natural-language date parsing.
- **Time zone resolution has a fallback chain, not a guarantee of
  correctness**: `LOOP_TIMEZONE` override → Bee's account time zone (from
  the live profile response — verified present, but the response shape
  isn't formally published by `@beeai/cli`, so a future change there
  could silently drop it) → local system time zone. If Bee's own time
  zone is ever wrong or stale for a given conversation (e.g. the user
  travels), deadline resolution inherits that inaccuracy — this module
  has no per-conversation location/time zone signal to fall back to.
- **Open-question resolution uses a bounded 5-utterance forward window**
  within the same conversation, not the entire remaining conversation —
  an answer given further away than that is not recognized. This is a
  deliberate conservatism, not an oversight: a wider window risks
  false-positive resolutions from unrelated later content.
- **Completion reconciliation and open-question resolution both use fixed
  similarity thresholds** (0.7 and 0.4 respectively) tuned against the
  audit's specific worked examples and locked in as regression tests —
  like deduplication's threshold, they are heuristic judgment calls, not
  guarantees against every possible phrasing.
- **Conversation-detail hydration adds real Bee CLI subprocess calls**
  (`conversations.get(id)`, bounded to 4 concurrent by default) that
  `bee:check`'s list-only path doesn't make — `loops:check` is
  correspondingly slower and more subprocess-call-heavy for accounts with
  many recent conversations. Phase 1A does not implement caching between
  runs.

## Explicitly out of scope (belongs to Phase 1B or later)

Cross-conversation correlation and grouping into persistent "Loops",
semantic embeddings, an LLM/AI extraction layer, confidence scoring
beyond the fixed heuristic bands above, any form of persistence, and any
cloud dependency. See the Phase 1A brief for the complete list; none of
it is implemented here, and `packages/loop-engine` has no dependency on
anything Bee-specific — only on `@cuenexa-loop/contracts`.
