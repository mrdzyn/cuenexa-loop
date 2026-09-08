# CueNexa Loop

Ambient follow-through intelligence powered by [Bee](https://bee.computer).

CueNexa Loop is an open-source companion project for Amazon Bee. It ingests
Bee-derived data, normalizes it into CueNexa Loop-owned domain contracts,
and — in later phases — will detect commitments, decisions, delegations,
follow-ups, deadlines, open questions, and other unresolved conversational
loops.

## Phase 0 status

This repository currently implements **Phase 0 only**: the data foundation.
It can connect to your own locally authenticated Bee developer environment,
read your recent conversations, facts, and todos, normalize them into
CueNexa Loop contracts, and print a privacy-safe summary to the console.

```text
Bee
  ↓
Bee Adapter
  ↓
Normalized CueNexa Loop Contracts
  ↓
Privacy-safe console output
```

Phase 0 explicitly does **not** include a UI, AWS, Amazon Bedrock, a
database, authentication, production deployment, persistence of Bee data,
or any AI-driven extraction/Loop intelligence. See
[docs/PRIVACY.md](docs/PRIVACY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the reasoning behind those boundaries.

## Repository layout

This is an npm-workspaces monorepo:

- [packages/contracts](packages/contracts) — CueNexa Loop-owned domain
  types (`LoopConversation`, `LoopFact`, `LoopTodo`), independent of Bee's
  wire format, plus their [Zod](https://zod.dev) schemas.
- [packages/bee-adapter](packages/bee-adapter) — a client for the local Bee
  developer proxy and a normalizer that maps Bee's raw responses onto the
  contracts above, defensively and without throwing on missing fields.
- [packages/cli](packages/cli) — the Phase 0 entrypoint: wires the adapter
  to a privacy-safe console presenter. No UI, no persistence.

## Prerequisites

- Node.js >= 18.17 (native `fetch` and ESM support).
- The [Bee](https://bee.computer) iOS app, with Developer Mode enabled
  (tap the app version number five times in Settings).
- The [Bee CLI](https://docs.bee.computer/docs) (`@beeai/cli`), authenticated
  locally.

## Quickstart

```bash
# 1. Install dependencies and build the workspace packages
npm install
npm run build

# 2. In a separate terminal: authenticate once, then start the local proxy
npm install -g @beeai/cli   # or: yarn global add @beeai/cli
bee login                    # one-time device authentication
bee proxy                    # starts a local, unauthenticated HTTP server on 127.0.0.1:8787

# 3. (optional) copy the example env file if you want to override defaults
cp .env.example .env

# 4. Run CueNexa Loop's Phase 0 CLI
npm start
```

`bee proxy` must be running in its own terminal for the CLI to have
anything to read. If it isn't, the CLI reports that clearly rather than
failing with a raw network error — see
[docs/BEE_INTEGRATION.md](docs/BEE_INTEGRATION.md).

## Configuration

| Env var          | Default                 | Purpose                                                        |
| ----------------- | ------------------------ | ---------------------------------------------------------------- |
| `BEE_PROXY_URL`   | `http://127.0.0.1:8787` | Base URL of the local Bee proxy.                                |
| `LOOP_MAX_ITEMS`  | `5`                      | Max conversations/facts/todos printed per category.             |

## Development

```bash
npm run typecheck   # tsc project references, no emit
npm test            # vitest, against synthetic fixtures only
npm run build        # compile all packages to dist/
npm run bee:check    # preflight: is a local `bee proxy` reachable? reads no data
```

Tests never touch a real Bee account: every fixture under
`packages/bee-adapter/src/fixtures` is synthetic, invented for this repository.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together and why.
- [docs/PRIVACY.md](docs/PRIVACY.md) — what data this touches, and what it deliberately never does.
- [docs/SECURITY.md](docs/SECURITY.md) — trust boundaries, threat model, and reporting.
- [docs/BEE_INTEGRATION.md](docs/BEE_INTEGRATION.md) — how the Bee adapter talks to `bee proxy`.
- [docs/DEVELOPER_FRICTION.md](docs/DEVELOPER_FRICTION.md) — rough edges encountered building Phase 0, for future contributors.

## License

[MIT](LICENSE)
