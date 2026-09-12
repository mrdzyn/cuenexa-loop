# CueNexa Loop

Bee remembers what happened. CueNexa Loop helps you understand what remains unfinished.

CueNexa Loop is an open-source companion project for Amazon Bee. It
ingests Bee-derived data, normalizes it into CueNexa Loop-owned domain
contracts, and deterministically identifies individual commitments,
decisions, delegations, follow-ups, and open questions (with deadlines
resolved where confidently possible). Grouping related items across
conversations into persistent, trackable "Loops" is a later phase (1B).

## Status: Phase 0 + Phase 1A

This repository implements **Phase 0** (Bee connectivity, normalization,
privacy-safe local verification) and **Phase 1A** (deterministic Loop
detection: commitments, decisions, delegations, follow-ups, and open
questions, with deadline resolution where confidently possible).

```text
Apple Watch
    ↓
Bee
    ↓
Bee CLI authenticated environment
    ↓
@beeai/cli/lib
    ↓
CueNexa Loop Bee Adapter
    ↓
Normalized Contracts
    ↓
Loop Detection Engine
    ↓
Structured Loop Items
    ↓
Privacy-Safe CLI
```

Phase 1A is a **deterministic, local-only heuristic engine — not an LLM**.
It does not yet correlate items across conversations into persistent
"Loops" (that's Phase 1B). Neither phase includes a UI, AWS, Amazon
Bedrock, Strands, AgentCore, a database, production deployment,
persistence of Bee data, or any cloud/LLM-based extraction. See
[docs/PRIVACY.md](docs/PRIVACY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
and [docs/LOOP-DETECTION.md](docs/LOOP-DETECTION.md) for the reasoning
behind those boundaries and exactly what the detection engine does and
does not do.

## Repository layout

This is an npm-workspaces monorepo:

- [packages/contracts](packages/contracts) — CueNexa Loop-owned domain
  types (`LoopConversation`, `LoopFact`, `LoopTodo`, `Page<T>`),
  independent of Bee's wire format, plus their [Zod](https://zod.dev)
  schemas.
- [packages/bee-adapter](packages/bee-adapter) — wraps the official
  `@beeai/cli/lib` client and normalizes Bee's responses onto the
  contracts above, defensively and without throwing on missing or
  reshaped fields. The only package that knows Bee's response shapes.
- [packages/loop-engine](packages/loop-engine) — the Phase 1A Loop
  detection engine: deterministic, regex/heuristic detectors that turn
  `LoopConversation`/`LoopFact`/`LoopTodo` into structured `LoopItem[]`.
  No LLM, no persistence, no dependency on anything Bee-specific — only
  on `@cuenexa-loop/contracts`. See [docs/LOOP-DETECTION.md](docs/LOOP-DETECTION.md).
- [packages/cli](packages/cli) — the CLI entrypoint: wires the adapter and
  the detection engine to privacy-safe console presenters. No UI, no
  persistence.

## Prerequisites

- Node.js 22+ and npm.
- The [Bee](https://bee.computer) app and a Bee account.
- Bee Developer Mode enabled (tap the app version number five times in
  Settings).
- The [Bee CLI](https://docs.bee.computer/docs) (`@beeai/cli`), installed
  and with an authenticated session (`bee login`).

## Quickstart

```bash
# 1. Authenticate the Bee CLI once (if you haven't already)
npm install -g @beeai/cli
bee login
bee status   # confirms you're authenticated

# 2. Install dependencies and build the workspace packages
npm install
npm run build

# 3. Run CueNexa Loop's Phase 0 CLI
npm start
```

CueNexa Loop never runs `bee login` or a local Bee proxy for you, and never
handles a Bee credential itself — it only asks the already-authenticated
`bee` CLI (via `@beeai/cli/lib`) to fetch your recent conversations, facts,
and todos, normalizes the result, and prints a report.

### Default output vs. `--include-content`

By default, `npm start` prints a **structural connectivity check only** —
counts and status, never conversation content:

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

To deliberately inspect redacted, truncated content (summaries, fact/todo
text, transcript utterances — never precise coordinates), opt in
explicitly:

```bash
npm start -- --include-content
```

See [docs/PRIVACY.md](docs/PRIVACY.md) for exactly what each mode does and
does not print.

### Loop detection

```bash
npm run loops:check                    # structural counts only
npm run loops:check -- --include-content  # redacted/truncated item text and evidence
```

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

Same privacy split as `bee:check`: the default output never contains an
item's text, owner, or evidence — see [docs/LOOP-DETECTION.md](docs/LOOP-DETECTION.md).

Unlike `bee:check` (list-only, counts only), `loops:check` fetches each
conversation's **full detail** (not just the list summary) so
conversation-derived detection has real utterance text to work with — see
[docs/LOOP-DETECTION.md](docs/LOOP-DETECTION.md#full-conversation-hydration-bee-check-vs-loops-check).
If hydration or normalization degrades that source snapshot,
`loops:check` reports a non-zero source-warning count and
`Detection completeness: PARTIAL` without printing source content.
Calendar phrases ("today", "tomorrow", weekday names) resolve against an
explicit `LOOP_TIMEZONE` override if you set one, otherwise Bee's own
account time zone when available, otherwise your local system time zone
— never UTC by default.

## Configuration

| Env var          | Default | Purpose                                                              |
| ----------------- | ------- | ---------------------------------------------------------------------- |
| `LOOP_MAX_ITEMS`  | `5`     | Max conversations/facts/todos/Loop items printed per category in `--include-content` mode. |
| `LOOP_TIMEZONE`   | (Bee's account time zone, else local system time zone) | IANA time zone override for resolving calendar phrases ("today", "tomorrow", weekday names) in `loops:check`. |

## Development

```bash
npm run typecheck   # tsc project references, no emit
npm test            # vitest, against synthetic fixtures only
npm run build        # compile all packages to dist/
npm run bee:check    # live Bee connectivity check — see below
npm run loops:check   # live Loop detection check — see below
```

Tests never touch a real Bee account: every fixture under
`packages/bee-adapter/src/fixtures` and `packages/loop-engine/src/fixtures`
is synthetic, invented for this repository.

### Live acceptance tests

`npm run bee:check` and `npm run loops:check` both build the project and
run the CLI for real against your already-authenticated Bee session, in
each command's default (non-`--include-content`) mode — i.e. they *are*
the connectivity-check / detection-check outputs shown above, run for
real. Run them yourself after `bee login`; CI never runs either (see
[.github/workflows/ci.yml](.github/workflows/ci.yml) and
[docs/BEE_INTEGRATION.md](docs/BEE_INTEGRATION.md)).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together and why.
- [docs/PRIVACY.md](docs/PRIVACY.md) — what data this touches, and what it deliberately never does.
- [docs/SECURITY.md](docs/SECURITY.md) — trust boundaries, threat model, and reporting.
- [docs/BEE_INTEGRATION.md](docs/BEE_INTEGRATION.md) — how the Bee adapter uses `@beeai/cli/lib`.
- [docs/LOOP-DETECTION.md](docs/LOOP-DETECTION.md) — what Loop items are, detection philosophy, confidence, dedup, and limitations.
- [docs/FRICTION-LOG.md](docs/FRICTION-LOG.md) — structured friction notes for future contributors.

## License

[MIT](LICENSE)
