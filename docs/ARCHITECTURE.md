# Architecture

## Phase 0 + Phase 1A pipeline

```text
Apple Watch
    ↓
Bee (captures, transcribes, summarizes)
    ↓  bee login (once, out-of-band)
Bee CLI authenticated environment (the `bee` executable on PATH)
    ↓  createBeeClient() — @beeai/cli/lib
BeeAdapterClient (packages/bee-adapter/src/bee-client.ts)
    ↓  fetchBeeSnapshot (list-only, bee:check) OR
       fetchDetectionSnapshot (+ conversations.get(id) hydration, loops:check)
       (packages/bee-adapter/src/service.ts)
    ↓  normalizeConversation / normalizeFact / normalizeTodo
       (packages/bee-adapter/src/normalize/*.ts)
CueNexa Loop contracts — LoopConversation, LoopFact, LoopTodo
     (packages/contracts/src/*.ts)
    ↓  detectLoopItems (packages/loop-engine/src/engine.ts)
Structured Loop Items — LoopItem[]
     (packages/loop-engine/src/types.ts)
    ↓  renderConnectivityReport / renderContentReport
       renderLoopConnectivityReport / renderLoopContentReport
       (packages/cli/src/presenter.ts, packages/cli/src/loop-presenter.ts)
Privacy-Safe CLI output
```

Everything after "Bee CLI authenticated environment" runs in a single
short-lived Node process (`npm start`/`npm run loops:check` in
`packages/cli`), in memory, and exits. Nothing in this pipeline writes to
disk, opens a database, or makes any network call itself — `@beeai/cli/lib`
shells out to the already locally-authenticated `bee` executable, which
is the only thing that talks to Bee's servers; Loop detection itself is
pure, deterministic, local computation with no I/O at all.

## Package boundaries

The monorepo is split into four packages, each mapped to a reason
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
    the way up to the CLI's warning count.

  No Bee response shape leaks past this package — everything above it
  only ever sees `@cuenexa-loop/contracts` types.

- **`@cuenexa-loop/loop-engine`** is the Phase 1A deterministic Loop
  detection engine: `detectLoopItems()` turns `LoopConversation[]`/
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

- **`@cuenexa-loop/cli`** owns orchestration, privacy-safe output, and the
  live acceptance checks (`npm run bee:check` / `npm run loops:check` run
  this package's default mode for real). It has no business logic of its
  own — it composes the other packages and decides, based on
  `--include-content`, which presenter to use.

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

Phase 0 and Phase 1A are scoped to prove the pipeline above end-to-end
without taking on the responsibility of storing anyone's conversational
data. See [docs/PRIVACY.md](PRIVACY.md) for the reasoning;
architecturally, the consequence is that there is no database package, no
file-writing code path in the CLI, and no caching layer — both
`fetchBeeSnapshot` and `fetchDetectionSnapshot` are called fresh on every
run, and `detectLoopItems` is a pure function with no memory of any
previous run.

## Why default output and `--include-content` are separate code paths

`packages/cli/src/presenter.ts` (Bee snapshots) and
`packages/cli/src/loop-presenter.ts` (Loop items) each export two
independent render functions — a default connectivity/detection-count
report and a `--include-content` report — rather than one function with
an internal if/else. The default path is built to be structurally
incapable of containing conversational content: it only ever reads
`.length`/`.filter().length` off the result and a fixed set of status
strings, never a record's `.text`, `.summary`, `.owner`, or `.evidence`.
See [docs/PRIVACY.md](PRIVACY.md#strict-privacy-by-default-output) and
[docs/LOOP-DETECTION.md](LOOP-DETECTION.md#privacy-behavior) for what
this guarantees and how it's tested.
