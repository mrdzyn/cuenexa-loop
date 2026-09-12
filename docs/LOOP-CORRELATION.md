# Loop correlation

Phase 1B groups separate, preserved Phase 1A `LoopItem`s that represent a
continuing subject across distinct conversations. It is deterministic,
local-only, in-memory, provider-independent above the adapter boundary,
and stateless between hydrated snapshots. Precision is preferred over
recall.

## Deduplication is not correlation

Phase 1A deduplication asks whether two detections describe the same
individual event/action and may combine compatible evidence within a
snapshot. Phase 1B correlation asks whether separate items from distinct
conversations belong to a continuing Loop. Correlation never retypes,
deletes, rewrites, or destructively merges a LoopItem. Every member retains
its original ID, text, state, detection confidence, parties, deadline,
source, evidence, creation time, and resolution time.

## Pipeline

```text
LoopItem[]
  → conservative anchor extraction
  → hard pair eligibility
  → deterministic heuristic score
  → accept at confidence >= 0.90
  → complete-link grouping
  → stable ID + timeline + lifecycle + title
  → Loop[]
```

`correlateLoopItems()` is pure and has no I/O. It uses normalized
conversations only to resolve source occurrence time. It does not import
the Bee adapter.

## Anchors and generic-language protection

Anchors are lowercased, punctuation-normalized tokens and adjacent
two-token phrases derived transiently from item display/evidence text.
Action, timing, and courtesy tokens such as `send`, `check`, `review`,
`follow`, `call`, `email`, `update`, `today`, `tomorrow`, and `please`
cannot strengthen an adjacent phrase. Generic business-context words such
as `vendor` cannot stand alone, but may participate with a genuinely
specific subject/object (`vendor contract`). Raw anchors exist only during
computation: they are not persisted, included in IDs/links, or displayed.

This deliberately rejects generic or misleading matches such as identical
`send report tomorrow`, `follow up with vendor`, `send revised`, or
`review final` fragments while retaining meaningful phrases such as
`pricing deck`, `quarterly forecast`, `vendor contract`, `renewal
proposal`, `security assessment`, and `Azure migration`.

## Hard eligibility gates

Pairs are rejected before scoring when they are the same item, lack two
conversation contexts, come from the same conversation, use different
providers, contain a provisional/dismissed member, or use incompatible
item families. Action types (`commitment`, `follow_up`, `delegation`) may
pair. Decision-to-action pairs require both a shared specific phrase and
at least two shared specific tokens **and** source chronology showing the
decision occurred strictly before the action. Missing, equal, or reversed
decision/action source chronology is rejected as
`decision_action_chronology_required`; `createdAt` is never used. Open
questions remain conservative and do not seed Phase 1B Loops.

Rejections use fixed reason codes such as `same_member`,
`same_conversation`, `different_provider`, `ineligible_item_state`,
`generic_language_only`, and `decision_requires_strong_anchor`; there are
no free-form AI explanations.

## Exact scoring model

Correlation confidence is deterministic heuristic support. It is **not**
probability, Bayesian confidence, ML confidence, or statistical certainty.
Eligible pairs receive:

| Signal | Weight |
| --- | ---: |
| shared exact specific multi-token phrase | +0.65 |
| each shared specific token (maximum two) | +0.10, capped at +0.20 |
| same action family **or** decision-to-action compatibility | +0.10 |
| valid source chronology within 30 days | +0.05 |
| exact normalized `dueAt` match | +0.05 |
| matching normalized owner label | +0.05 |

The score is capped at 1.0. Family compatibility is never double-counted.
Owner strings are compared only in memory and never copied into scoring
metadata. Supporting metadata cannot manufacture correlation: without a
shared specific phrase, the mathematical maximum is 0.45, far below the
single exported threshold `MINIMUM_LOOP_CORRELATION_CONFIDENCE = 0.90`.
Below-threshold evaluations may exist internally but can never become a
schema-valid `LoopCorrelationLink`.

Public reason codes are structural: shared phrase/tokens, family
compatibility, chronology, due-date, and owner support. They never carry
raw text.

## Chronology and timeline

`LoopItem.createdAt` is detection time and is never conversational
chronology. Occurrence timestamps use this precedence:

1. relevant source utterance `spokenAt` from `source.utteranceIndexes`
2. conversation `endedAt`
3. conversation `startedAt`
4. unavailable (`null`; no timestamp is invented)

Known timeline timestamps sort ascending. Stable member identity breaks
equal-time ties. Unavailable events sort after known events, again by
stable member identity. Sequence numbers are assigned only after sorting,
so input order cannot alter the timeline.

## Complete-link grouping

Candidate clusters merge only when **every** cross-cluster pair is accepted
at or above 0.90. At each iteration the correlator enumerates valid merges,
calculates each prospective cluster's weakest required pair confidence, and
selects the strongest such weakest link; stable member/cluster identity
breaks exact ties. It then recomputes candidates. Therefore A-B and B-C
cannot pull A-C into a three-member Loop when A-C fails, and overlapping
complete cliques choose the stronger weakest-link group rather than the
first greedy edge. This is intentionally more conservative than connected
components and may emit a smaller Loop rather than risk a false transitive
merge.

A Loop's `correlationConfidence` is the minimum accepted pair score across
its complete-link cluster—the weakest required relationship, never the
maximum or average. Every emitted link references real members and contains
only confidence, deterministic reason codes, and a shared-anchor count.

## Stable identity

`createStableMemberIdentity()` hashes canonical provider/source IDs,
utterance indexes, item type, and normalized evidence digests.
`createStableLoopId()` hashes sorted stable member identities. IDs are
order-independent and membership-sensitive; they exclude raw text,
parties, timestamps, `createdAt`, and run-local LoopItem IDs. No random UUID
or persistence is required.

## Lifecycle

Lifecycle uses explicit member state and the newest active semantic member:

- `resolved`: every member is terminal; emitted Loops use explicitly
  `resolved` members because `dismissed` items cannot seed correlation.
  `resolvedAt` is the latest explicit member timestamp only when all such
  timestamps are available, otherwise `null`.
- `waiting`: unresolved and the newest active member is explicitly
  `waiting`, a delegation, or an eligible open question.
- `open`: every other unresolved combination, including active commitments,
  follow-ups, and mixed resolved/open work.

Due dates, age, lack of a later mention, and wording never imply completion.

## Deterministic title

Titles are derived locally from shared anchors. Candidates rank by number
of members covered, multi-token phrase over isolated token, token count,
length, then lexical order. Titles are capped at 80 characters. Generic
action language cannot become a title when a specific shared phrase exists.
Titles are private content and are never accessed by default output.

## Privacy behavior

`npm run loops:correlate` fetches one hydrated Bee snapshot, runs Phase 1A,
correlates in memory, prints structural counts/status, and exits. Default
output cannot access title, member text/evidence/parties/deadlines, source
content/location, raw anchors, or warning messages. It prints only counts,
lifecycle totals, completeness, and `Private content printed: NO`.

`npm run loops:correlate -- --include-content` is deliberate opt-in. It may
show redacted/truncated titles and member previews, item types, counts,
confidence, and structural timeline information. Redaction runs before
truncation. Emails and phone-like values are masked; precise coordinates,
evidence, owners, counterparties, due dates, transcripts, and raw anchors
are never displayed.

Completeness is `PARTIAL` when source normalization/hydration, detection,
or correlation reports degraded context. Ordinary hard-gate and
below-threshold rejections are expected behavior, not warnings. Correlation
warning messages are content-free; default output prints counts only.

## Limitations and accepted false negatives

Phase 1B recognizes exact normalized tokens/adjacent phrases, not synonyms,
pronouns, aliases, spelling variants, paraphrases, or semantic similarity.
The 30-day chronology window is supporting-only. Open questions are excluded
from correlation, and complete-link grouping may split a real topic when any
pair lacks enough direct evidence. Loops are rebuilt from the current first
page hydrated snapshot on every invocation, so membership may change as the
snapshot changes. These false negatives are accepted to avoid unsafe false
correlations.

There is no persistence, database, cache of Bee-derived content, cloud
processing, AWS, Bedrock, LLM, embedding/vector search, external NLP,
telemetry, analytics, UI, user account system, background sync, or Bee
write-back in Phase 1.
