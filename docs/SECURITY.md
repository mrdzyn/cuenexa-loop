# Security

## Trust boundaries

```text
[ Bee account, authenticated via `bee login` ]
                    |
                    | device auth, entirely the Bee CLI's responsibility —
                    | this project never sees a credential
                    v
[ bee — the authenticated CLI executable on PATH ]
                    |
                    | subprocess spawn + stdout JSON parse, via @beeai/cli/lib
                    v
[ @cuenexa-loop/bee-adapter — BeeAdapterClient ]
                    |
                    | in-memory only
                    v
[ @cuenexa-loop/cli — redacts, truncates, prints to your terminal ]
```

## Bee authentication stays managed by Bee tooling

Authentication is entirely `bee login`'s responsibility. CueNexa Loop does
not implement a login flow, does not read a token file, does not accept a
credential as configuration, and does not store a Bee credential anywhere
— on disk, in memory beyond the subprocess call itself, or in a log.
`BeeAdapterClient.ensureAuthenticated()` only asks the `bee` CLI to fetch
the developer profile (`auth.getProfile()`) and checks whether that
succeeds; it never touches the underlying session token. (It calls
`getProfile()` rather than `@beeai/cli/lib`'s own `isAuthenticated()`
helper, which internally swallows every failure — including "the `bee`
executable itself is missing" — into a bare `false`; see
`docs/BEE_INTEGRATION.md` for why that distinction matters.)

## No hardcoded secrets

There are no API keys, tokens, or credentials anywhere in this
repository's source, tests, or fixtures. `.env.example` documents exactly
one non-secret setting (`LOOP_MAX_ITEMS`, a display limit).

## No raw transcript logs

`packages/cli/src/error-report.ts` renders a fixed, actionable message per
Bee failure type and deliberately never includes the underlying error's
message — Bee CLI stderr/stdout could in principle contain something
unexpected, and the rule here is to never surface a raw command body to
the console regardless. The default CLI output contains no conversational
content at all (see `docs/PRIVACY.md`); `--include-content` mode redacts
and truncates before printing anything.

## No production network service

Nothing in this codebase binds a port, opens a socket for inbound
connections, or runs as a long-lived service. `@cuenexa-loop/cli` is a
short-lived process that runs once and exits. (An earlier version of this
project ran a local HTTP proxy client; that integration has been removed
entirely — see `docs/BEE_INTEGRATION.md`.)

## No cloud dependency

Phase 0 has no AWS, Amazon Bedrock, or third-party API dependency of any
kind. The only external process this codebase talks to is the locally
installed `bee` CLI.

## Dependency hygiene

Runtime dependencies are kept deliberately minimal:
[`zod`](https://www.npmjs.com/package/zod) for schema validation in
`@cuenexa-loop/contracts`, and [`@beeai/cli`](https://www.npmjs.com/package/@beeai/cli)
(Bee's own official client library) in `@cuenexa-loop/bee-adapter`.
Nothing else at runtime. A smaller dependency tree is a smaller
supply-chain surface for a project that, by its nature, ends up close to
someone's personal data.

**Secret scanning recommendation:** enable GitHub's secret scanning and
push protection on this repository (Settings → Code security). Given the
project's stated rule against committing credentials or private Bee data,
push protection is a reasonable low-cost backstop, not a substitute for
the review discipline described in `docs/PRIVACY.md`.

## Public repository safety

This repository is public. Beyond the `.gitignore` protections
(`.env*`, `data/`, `tmp/`, `exports/`, `bee-data/`, `bee-sync/`,
`*.sqlite`/`*.sqlite3`/`*.db`), contributors are expected to run
`git diff` and `git status` before every commit and check specifically
for API tokens, authentication material, Bee exports, private
transcripts, personal facts/todos, real conversation IDs, database files,
`.env` files, and machine-specific paths — none of which may be
committed. See `docs/PRIVACY.md` for the full data-handling rationale.

## Safe error handling

Every error thrown by `@cuenexa-loop/bee-adapter`
(`BeeCliUnavailableError`, `BeeAuthenticationError`, `BeeCommandError`,
`BeeMalformedResponseError` — see `docs/BEE_INTEGRATION.md`) is rendered
by the CLI as one of four fixed, actionable messages
(`packages/cli/src/error-report.ts`), never as a raw stack trace or
command output. `packages/cli/src/__tests__/error-report.test.ts` asserts
directly that no error message's underlying detail text reaches the
rendered output.

## Synthetic test fixtures

Every fixture used by `npm test` is synthetic — see `docs/PRIVACY.md`
("No real data in this repository") and `docs/BEE_INTEGRATION.md`
("Synthetic-only testing") for what that covers and why.

## Reporting a vulnerability

This is an early-stage, Phase 0 open-source project with no production
deployment. If you find a security issue, please open a GitHub issue on
this repository describing the concern; avoid including any real Bee data
in the report.
