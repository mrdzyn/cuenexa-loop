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
  ↓
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
- An explicit first-person negation ("I won't...", "I will not...")
  suppresses a commitment entirely.
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
Source text (utterance / fact / Bee Todo)
  ↓  detectSentence() — one detector wins per sentence (see "Precedence")
DetectionCandidate  (unvalidated: type, text, confidence, owner, dueAt, evidence)
  ↓  deduplicateCandidates()
Deduplicated candidates
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
- **Negation handling is narrow**, covering explicit first-person
  commitment negation only ("I won't...", "I will not..."). It does not
  attempt cross-utterance retraction reasoning (a later "actually, don't
  send it yet" isn't linked back to an earlier commitment to retract it
  — it simply doesn't produce its own commitment either, since imperative
  "don't X" never matches the positive commitment pattern).
- **Deadline resolution covers a fixed phrase set** (see above) — no
  general natural-language date parsing.

## Explicitly out of scope (belongs to Phase 1B or later)

Cross-conversation correlation and grouping into persistent "Loops",
semantic embeddings, an LLM/AI extraction layer, confidence scoring
beyond the fixed heuristic bands above, any form of persistence, and any
cloud dependency. See the Phase 1A brief for the complete list; none of
it is implemented here, and `packages/loop-engine` has no dependency on
anything Bee-specific — only on `@cuenexa-loop/contracts`.
