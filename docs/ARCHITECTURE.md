# Architecture

## Phase 0 pipeline

```text
Bee (iOS app + cloud account)
  ↓  bee login (once) / bee proxy (long-running, local-only)
Bee developer proxy — http://127.0.0.1:8787
  ↓  HTTP GET, via BeeProxyClient (packages/bee-adapter/src/client.ts)
Raw Bee responses — conversations, facts, todos
  ↓  normalizeConversation / normalizeFact / normalizeTodo
     (packages/bee-adapter/src/normalize/*.ts)
CueNexa Loop contracts — LoopConversation, LoopFact, LoopTodo
     (packages/contracts/src/*.ts)
  ↓  renderSnapshot (packages/cli/src/presenter.ts)
Privacy-safe console output
```

Everything after "Bee developer proxy" runs in a single short-lived Node
process (`npm start` in `packages/cli`), in memory, and exits. Nothing in
this pipeline writes to disk, opens a database, or makes an outbound
request other than the one to the local proxy.

## Package boundaries

The monorepo is split into three packages specifically so each boundary
maps to a reason something might need to change independently:

- **`@cuenexa-loop/contracts`** owns the domain model. It has no
  dependency on Bee's wire format and no knowledge that Bee is the only
  source — a second capture source (a different device, a manual import)
  would produce the same `LoopConversation`/`LoopFact`/`LoopTodo` shapes.
  Contracts are defined once as [Zod](https://zod.dev) schemas with
  inferred TypeScript types, so runtime validation and compile-time types
  can never drift apart.

- **`@cuenexa-loop/bee-adapter`** owns everything specific to Bee: the
  HTTP client for the local proxy, best-effort raw response types, and the
  normalizers that map those raw types onto contracts. This is the only
  package that imports Bee's shapes. If Bee's response format changes, or
  a second source is added later, the blast radius is contained here.

- **`@cuenexa-loop/cli`** owns presentation and orchestration for Phase 0:
  loading config, calling the adapter, and rendering a privacy-safe
  console report. It has no business logic of its own — it composes the
  other two packages.

This split is also what "easy to extend" concretely means for this
project: adding Loop intelligence (commitment/decision/follow-up
detection) in a later phase means adding a new package that consumes
`LoopConversation`/`LoopFact`/`LoopTodo` from `@cuenexa-loop/contracts`,
without touching the Bee adapter or vice versa. Adding a second data
source later means adding a second adapter package that also produces
contracts, without touching the CLI's presentation logic.

## Why normalization never throws

`normalizeConversation`, `normalizeFact`, and `normalizeTodo` never throw
on a malformed or partial raw record. Each returns a
`NormalizationResult<T>` — the best contract-shaped record it could build,
plus a list of `NormalizationWarning`s describing what it had to default
or couldn't find. This is deliberate: Bee does not publish a formal JSON
schema for these endpoints (see
[docs/BEE_INTEGRATION.md](BEE_INTEGRATION.md)), so the adapter treats every
field as possibly missing or reshaped by a future Bee release, and prefers
degrading one field over discarding an entire conversation.

## Why there's no persistence layer

Phase 0 is scoped to prove the pipeline above end-to-end without taking on
the responsibility of storing anyone's conversational data. See
[docs/PRIVACY.md](PRIVACY.md) for the reasoning; architecturally, the
consequence is that there is no database package, no file-writing code
path in the CLI, and no caching layer — `fetchBeeSnapshot` is called fresh
on every run.
