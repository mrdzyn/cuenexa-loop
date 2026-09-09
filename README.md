# CueNexa Loop

Bee remembers what happened. CueNexa Loop helps you understand what remains unfinished.

CueNexa Loop is an open-source companion project for Amazon Bee. It ingests
Bee-derived data, normalizes it into CueNexa Loop-owned domain contracts,
and — in later phases — will identify commitments, decisions, delegations,
follow-ups, deadlines, open questions, and other unresolved conversational
loops.

## Phase 0 status

This repository currently implements **Phase 0 only**: Bee connectivity,
the Bee adapter, normalization, and privacy-safe local verification. It
does not yet detect, extract, or infer anything — it proves the data
pipeline end-to-end and stops there.

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
Privacy-Safe CLI
```

Phase 0 explicitly does **not** include a UI, AWS, Amazon Bedrock, Strands,
AgentCore, a database, production deployment, persistence of Bee data, or
any AI-driven extraction/Loop intelligence (commitment, decision,
delegation, follow-up, deadline, or open-question detection). See
[docs/PRIVACY.md](docs/PRIVACY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the reasoning behind those boundaries, and
[packages/loop-engine](packages/loop-engine) for the (currently
type-only) architectural placeholder for that future work.

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
- [packages/loop-engine](packages/loop-engine) — a Phase 1 architectural
  placeholder only. Defines domain types (`Commitment`, `Decision`,
  `Delegation`, `FollowUp`, `Deadline`, `OpenQuestion`, `Loop`) with no
  detection logic whatsoever.
- [packages/cli](packages/cli) — the Phase 0 entrypoint: wires the adapter
  to a privacy-safe console presenter. No UI, no persistence.

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

## Configuration

| Env var          | Default | Purpose                                                              |
| ----------------- | ------- | ---------------------------------------------------------------------- |
| `LOOP_MAX_ITEMS`  | `5`     | Max conversations/facts/todos printed per category in `--include-content` mode. |

## Development

```bash
npm run typecheck   # tsc project references, no emit
npm test            # vitest, against synthetic fixtures only
npm run build        # compile all packages to dist/
npm run bee:check    # the real Phase 0 live acceptance test — see below
```

Tests never touch a real Bee account: every fixture under
`packages/bee-adapter/src/fixtures` is synthetic, invented for this repository.

### Live acceptance test

`npm run bee:check` builds the project and runs the same CLI, through the
same Bee adapter, in its default (non-`--include-content`) mode — i.e. it
*is* the connectivity-check output shown above, run for real against your
already-authenticated Bee session. Run it yourself after `bee login`; CI
never runs it (see [.github/workflows/ci.yml](.github/workflows/ci.yml)
and [docs/BEE_INTEGRATION.md](docs/BEE_INTEGRATION.md)).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together and why.
- [docs/PRIVACY.md](docs/PRIVACY.md) — what data this touches, and what it deliberately never does.
- [docs/SECURITY.md](docs/SECURITY.md) — trust boundaries, threat model, and reporting.
- [docs/BEE_INTEGRATION.md](docs/BEE_INTEGRATION.md) — how the Bee adapter uses `@beeai/cli/lib`.
- [docs/FRICTION-LOG.md](docs/FRICTION-LOG.md) — structured friction notes for future contributors.

## License

[MIT](LICENSE)
