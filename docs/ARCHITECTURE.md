# Architecture

## Phase 1 through Phase 4 pipeline

```text
Apple Watch
    ↓
Bee (captures, transcribes, summarizes)
    ↓  bee login (once, out-of-band)
Bee CLI authenticated environment (the `bee` executable on PATH)
    ↓  createBeeClient() — @beeai/cli/lib
BeeAdapterClient (packages/bee-adapter/src/bee-client.ts)
    ↓  fetchBeeSnapshot (list-only, bee:check) OR
       fetchDetectionSnapshot (+ conversations.get(id) hydration,
       loops:check / loops:correlate)
       (packages/bee-adapter/src/service.ts)
    ↓  normalizeConversation / normalizeFact / normalizeTodo
       (packages/bee-adapter/src/normalize/*.ts)
CueNexa Loop contracts — LoopConversation, LoopFact, LoopTodo
     (packages/contracts/src/*.ts)
    ↓  detectLoopItems (packages/loop-engine/src/engine.ts)
Structured Loop Items — LoopItem[]
     (packages/loop-engine/src/types.ts)
    ↓  anchors → eligibility → deterministic score (0.90 threshold)
    ↓  complete-link grouping → stable ID → timeline/lifecycle/title
Structured snapshot-local Loops — Loop[]
     (packages/loop-engine/src/loop-types.ts)
    ↓  renderConnectivityReport / renderContentReport
       renderLoopConnectivityReport / renderLoopContentReport
       renderCorrelationConnectivityReport / renderCorrelationContentReport
       (packages/cli/src/*presenter.ts)
Privacy-Safe CLI output
```

For `loops:sync` only, the adapter uses a separate bounded full-pagination
path, hydrates every fetched conversation, and explicitly marks a snapshot
partial if a cursor repeats or a configured cap is reached. The pure Phase 1
engine remains unchanged. `@cuenexa-loop/loop-store` then reconciles only
the emitted Loop's derived structural fields into a persistent local thread;
it never receives Bee records. `loops:today` ranks those local threads with
fixed deterministic reason codes and makes no Bee request.

Phase 3 keeps three additional layers separate: local user preference state,
a pure actionable-review policy, and a pure notification planner backed by a
structural delivery ledger. User actions never update source-derived thread
lifecycle or emit source events. Review and notification presenters consume
structured models and share the existing redact-before-truncate helper.
There is no daemon, OS notification adapter, or cloud delivery boundary.

Phase 4 adds a separate foreground-only acceleration path:

```text
@beeai/cli 0.7.3 bee.sse.streamJson(...)
    ↓
raw data JSON: { utterance, conversation_uuid } | { conversation }
    ↓
BeeAdapterClient.subscribeRealtime (Bee shapes and UUID↔numeric-ID bridge end here)
    ↓
EphemeralRealtimeEvent (provider-independent, bounded memory)
    ↓
ProvisionalAwareness (no LoopItem/Loop/LoopThread identity)
    ↓
PROVISIONAL privacy-safe presentation
    ↓ idle / processed hint / reconnect gap
syncPersistentLoopsWithDetails
    ↓
existing complete authoritative Phase 1 → Phase 2 → Phase 3 path
```

The provisional path has no store dependency. Only the injected authoritative
refresh calls `fetchCompleteDetectionSnapshot`, detection/correlation, and
`LoopStore.reconcile`. Therefore realtime cannot create, resolve, reopen,
delete, or mutate a persistent thread. Raw realtime transcript content never
enters SQLite, and disconnect means only a possible observation gap.

Everything after "Bee CLI authenticated environment" runs in a single
user-invoked Node process. Most commands are short-lived; `loops:watch` remains
in the foreground until stopped and keeps provisional state only in memory.
Only the established Phase 2/3 `LoopStore` boundary writes minimized derived
state to local SQLite. `@beeai/cli/lib` shells out to the already
locally-authenticated `bee` executable, which is the only thing that talks to
Bee's servers; Loop detection, correlation, and provisional awareness are
deterministic local computations with no I/O.

## Package boundaries

The monorepo is split into five packages, each mapped to a reason
something might need to change independently:

- **`@cuenexa-loop/contracts`** owns the domain model: provider-independent
  normalized objects (`LoopConversation`, `LoopFact`, `LoopTodo`), a
  generic `Page<T>` pagination type, and `NormalizationResult`/
  `NormalizationWarning`. It has no dependency on Bee's wire format and no
  knowledge that Bee is the only source. Contracts are defined once as
  [Zod](https://zod.dev) schemas with inferred TypeScript types, so
  runtime validation and compile-time types can never drift apart.

- **`@cuenexa-loop/bee-adapter`** owns everything specific to Bee:
  - **official Bee integration** — `BeeAdapterClient` wraps
    `createBeeClient()` from `@beeai/cli/lib`; this is the only place in
    the codebase that imports `@beeai/cli`.
  - **interpreting Bee responses** — `raw-types.ts` models Bee's current
    field names, with explicitly-labeled legacy fallbacks.
  - **schema adaptation & normalization** — `normalize/*.ts` maps raw Bee
    shapes onto contracts, never throwing on missing or malformed data.
  - **pagination metadata** — `pagination.ts` extracts a `Page<T>` (items +
    `nextCursor`) from a recognized list-response wrapper shape, so a flat
    array never silently implies a complete dataset. An *unrecognized*
    shape throws rather than becoming an indistinguishable "empty" page —
    see `docs/BEE_INTEGRATION.md#pagination`.
  - **normalization warnings** — collected, never swallowed, surfaced all
    the way up to the CLI as a separate source-warning count. Detection
    reports mark completeness `PARTIAL` whenever source warnings exist,
    independently of detection-engine warnings.

  No Bee response shape leaks past this package — everything above it
  only ever sees `@cuenexa-loop/contracts` types.

  Phase 4 wraps only the public `sse.streamJson({ types, signal })` API.
  Version 0.7.3 exposes parsed `data:` JSON, not SSE `event:`/`id:` metadata,
  so the adapter discriminates documented payload structures and requests only
  `new-utterance`, `new-conversation`, and `update-conversation`. Realtime
  fingerprints are bounded and memory-only; malformed supported events produce
  fixed content-free warnings. A separate 256-entry adapter-process-local bridge
  accepts only provider payloads containing both the realtime UUID and
  processed-history numeric ID. It never correlates identity from content and
  survives bounded reconnects but is never persisted.

- **`@cuenexa-loop/loop-engine`** owns provider-independent Phase 1
  intelligence. Phase 1A's `detectLoopItems()` turns `LoopConversation[]`/
  `LoopFact[]`/`LoopTodo[]` into structured `LoopItem[]` via a
  candidate → dedup → completion-reconciliation → confidence-filter →
  validated-`LoopItem` pipeline (`candidate-builder.ts` → `dedup.ts` →
  `completion.ts` → `engine.ts`), plus a same-conversation-only
  open-question resolution pass (`question-resolution.ts`). It depends
  only on `@cuenexa-loop/contracts` — never on `@cuenexa-loop/bee-adapter`
  or anything Bee-specific, so a future non-Bee data source could feed it
  the same contracts and get the same detection for free. Its input
  requires an explicit IANA `timeZone` (never assumes UTC — see
  `docs/LOOP-DETECTION.md`). No LLM, no network call, no persistence. See
  [docs/LOOP-DETECTION.md](LOOP-DETECTION.md) for the full detection
  philosophy, confidence semantics, and deduplication/reconciliation
  approach.

  Deduplication is semantic-type-aware: decisions/open questions cannot
  be absorbed into action Todos, while compatible action merges preserve
  delegation ownership. Completion reconciliation likewise applies only
  to completable action types (`commitment`, `follow_up`, `delegation`).
  Question reconciliation can use later sentences in the same utterance
  before its bounded same-conversation later-utterance scan.

  Phase 1B's `correlateLoopItems()` operates over preserved LoopItems and
  the same normalized snapshot. It extracts conservative anchors, applies
  hard gates, scores eligible pairs with fixed weights, and accepts only
  scores at or above 0.90. Complete-link grouping requires every pair in a
  Loop to be accepted, preventing weak transitive expansion. Loop
  confidence is the weakest required link. Stable IDs use source/evidence
  digests rather than run-local IDs or raw content. See
  [docs/LOOP-CORRELATION.md](LOOP-CORRELATION.md).

  Phase 4's `ProvisionalAwareness` is deliberately separate from that pipeline.
  It detects four possible signal types in one utterance/conversation at a time,
  assigns no durable Loop identity, performs no cross-conversation correlation
  or resolution inference, and retains at most 128 utterance groups for ten
  minutes in the foreground process.

- **`@cuenexa-loop/loop-store`** owns the existing schema-v2 structural local
  threads, events, preferences, and notification delivery ledger. Phase 4
  introduces no table or migration and never passes realtime records to it.

- **`@cuenexa-loop/cli`** owns orchestration, privacy-safe output, and the
  live acceptance checks (`npm run bee:check`, `npm run loops:check`, and
  `npm run loops:correlate` run this package's default mode for real). It
  has no business logic of its
  own — it composes the other packages and decides, based on
  `--include-content`, which presenter to use.

  Phase 4 also owns `loops:watch`: a foreground runtime with a one-second idle
  tick, 30-second activity idle threshold, 60-second minimum historical-refresh
  interval, and bounded 1/2/5-second reconnect schedule. Merely displaying
  authoritative notification eligibility never records a delivery. A user may
  press `r` and Enter for an explicit refresh subject to the same rate limit.
  A single pending bit coalesces processed, idle, manual, and gap requests that
  arrive during cooldown or an in-flight refresh; the runtime performs one
  deferred attempt when permitted. A failed attempt retains one coalesced retry
  request while the bounded foreground runtime remains active.

## Why normalization never throws

`normalizeConversation`, `normalizeFact`, and `normalizeTodo` never throw
on a malformed or partial raw record. Each returns a
`NormalizationResult<T>` — the best contract-shaped record it could build,
plus a list of `NormalizationWarning`s describing what it had to default
or couldn't find — and then validates that record against the
corresponding Zod schema (`LoopConversationSchema.parse`, etc.) before
returning it. That validation call is a safety net, not a recovery
mechanism: by the time it runs, the normalizer has already guaranteed
every field is present with a correct type, so a validation failure would
indicate a bug in the normalizer itself, not bad Bee data.

```text
Bee response
    ↓
Normalizer
    ↓
safe fallback + NormalizationWarning
    ↓
validated CueNexa contract (Zod .parse)
```

This is deliberate: `@beeai/cli/lib` types the *call* surface precisely
(`DataApi.facts.list()` etc.) but leaves each method's *response* as a
generic, uninspected `T` — Bee itself does not publish a formal JSON
schema for the payloads. See
[docs/BEE_INTEGRATION.md](BEE_INTEGRATION.md) and
[docs/FRICTION-LOG.md](FRICTION-LOG.md) for more on this gap and how the
adapter treats every field as possibly missing or reshaped by a future
Bee release, preferring to degrade one field over discarding an entire
record.

## Why there's no persistence layer

Phase 0 and Phase 1 are scoped to prove the pipeline above end-to-end
without taking on the responsibility of storing anyone's conversational
data. See [docs/PRIVACY.md](PRIVACY.md) for the reasoning;
architecturally, the consequence is that there is no database package, no
file-writing code path in the CLI, and no caching layer — both
`fetchBeeSnapshot` and `fetchDetectionSnapshot` are called fresh on every
run, and `detectLoopItems`/`correlateLoopItems` are pure functions with no
memory of any previous run. Loops therefore describe one hydrated
snapshot; they are not durable records.

## Why default output and `--include-content` are separate code paths

`packages/cli/src/presenter.ts` (Bee snapshots), `loop-presenter.ts`
(LoopItems), and `correlation-presenter.ts` (Loops) each export two
independent render functions — a default connectivity/detection-count
report and a `--include-content` report — rather than one function with
an internal if/else. The default path is built to be structurally
incapable of containing conversational content: it only ever reads
`.length`/`.filter().length` off the result and a fixed set of status
strings, never a record's `.text`, `.summary`, `.owner`, or `.evidence`.
The detection and correlation presenters additionally read only warning counts
to report source health and derives `COMPLETE`/`PARTIAL` from that count;
it never prints source-warning messages in either mode.
See [docs/PRIVACY.md](PRIVACY.md#strict-privacy-by-default-output) and
[docs/LOOP-CORRELATION.md](LOOP-CORRELATION.md#privacy-behavior) for what
this guarantees and how it's tested.
