# Bee integration

## What Phase 0 talks to

CueNexa Loop talks to Bee through the **official `@beeai/cli/lib`
library**, not a hand-rolled HTTP client. This is the primary and only
integration path — there is no local proxy to run, no HTTP endpoint to
manage, and no bespoke authentication flow.

```ts
import { createBeeClient } from "@beeai/cli/lib";

const bee = createBeeClient();

await bee.auth.getProfile(); // used for the auth preflight — see below for why not isAuthenticated()
await bee.api.conversations.list();
await bee.api.conversations.get(id);
await bee.api.facts.list();
await bee.api.todos.list();
```

`createBeeClient()` returns a client whose `api` methods run the
already-installed, already-authenticated `bee` CLI executable as a
subprocess in JSON mode (`bee <command> --json`) and parse its stdout.
Authentication is entirely the Bee CLI's responsibility:

1. `npm install -g @beeai/cli`
2. `bee login` — one-time device authentication.
3. `bee status` — confirms an authenticated session exists.

CueNexa Loop never reads, stores, or transmits a Bee credential itself —
`BeeAdapterClient.ensureAuthenticated()` calls `bee.auth.getProfile()` and
lets a real failure classify itself (see "Error handling" below).
Deliberately, it does **not** call `bee.auth.isAuthenticated()`: that
helper wraps the same profile check in a bare `try { … } catch { return
false }`, which collapses "Bee CLI isn't installed," "Bee CLI returned
something unparseable," and "you haven't run `bee login`" into a single
boolean — making it impossible to tell a missing CLI from a missing
session. Calling `getProfile()` directly preserves that distinction, and
— as a bonus from the same call — `ensureAuthenticated()` returns an
`AuthenticationInfo` carrying Bee's own account `timeZone` (verified
present as a `"timezone"` field on the real, authenticated `bee me --json`
response) when the profile response includes one, used for timezone-aware
Loop detection (see `docs/LOOP-DETECTION.md`).

`BeeAdapterClient` (`packages/bee-adapter/src/bee-client.ts`) is the sole
wrapper around this library in the codebase:

| Bee capability                        | `BeeAdapterClient` method       |
| --------------------------------------- | ---------------------------------- |
| Authentication check + account time zone | `ensureAuthenticated()`        |
| `bee.api.conversations.list()`         | `listConversations(options?)`   |
| `bee.api.conversations.get(id)`        | `getConversation(id)`            |
| `bee.api.facts.list()`                 | `listFacts(options?)`            |
| `bee.api.todos.list()`                 | `listTodos(options?)`             |

No Bee response shape leaks past this file: everything above it in
`@cuenexa-loop/cli` only ever sees `@cuenexa-loop/contracts` types.

`@cuenexa-loop/bee-adapter`'s `service.ts` composes these into two
snapshot builders with different scopes — `fetchBeeSnapshot` (list-only,
used by `bee:check`) and `fetchDetectionSnapshot` (additionally hydrates
each conversation's full detail via `getConversation(id)`, used by
`loops:check` and `loops:correlate`). See `docs/LOOP-DETECTION.md` ("Full
conversation hydration") for why the distinction exists and how hydration
failures are handled.

## Optional proxy fallback: none

An earlier version of this adapter talked to Bee's local `bee proxy` HTTP
server directly. That integration has been **fully removed**, not merely
demoted — see [docs/FRICTION-LOG.md](FRICTION-LOG.md) for the history.
There was no remaining justification for maintaining two integration
paths once the official library covered the same functionality with a
smaller trust surface (no locally-bound, unauthenticated HTTP server).
Running `bee proxy` is not required for any part of the normal CueNexa
Loop workflow.

## Which `bee` actually runs

`createBeeClient()` spawns the bare command name `"bee"` and lets the OS
resolve it via `PATH`. Under any `npm run`/`npm exec`/`npm start`
invocation — i.e. every way this project runs — npm prepends
`node_modules/.bin` to `PATH`, and because `@beeai/cli` declares
`"bin": { "bee": "bin/bee.js" }`, npm workspace hoisting puts a
**workspace-local** `bee` there. Verify this yourself: `npm exec -- which
bee` resolves to `<repo>/node_modules/.bin/bee`, not a separately
installed global `bee`, even if you also have one on your system `PATH`
from `npm install -g @beeai/cli`.

In practice this has not caused a problem: the workspace-local wrapper
execs the platform binary bundled in `node_modules/@beeai/cli/dist/
platforms/<platform>-<arch>/bee`, which authenticates against the exact
same stored session as a separately-installed global `bee` (Bee CLI's
credential storage is not per-install). But it does mean **the Bee CLI
version this project actually talks to is whatever `@beeai/cli` version
is pinned in `packages/bee-adapter/package.json`**, not necessarily
whatever `bee --version` reports globally on your system. If those two
ever drift, the symptom would show up as `npm run bee:check` behaving
differently than a manually-run global `bee` command — check
`node_modules/.bin/bee --version` against your global `bee --version` if
that ever happens. See `docs/FRICTION-LOG.md` for how this was discovered
(a claim in an earlier version of this document asserted the global CLI
was used, and was wrong).

## Why the raw types are defensive, not authoritative

`@beeai/cli/lib`'s own TypeScript declarations type the *call* surface
precisely (`DataApi.facts.list(options?): Promise<T>`, etc.), but each
method's *response* is a generic, caller-supplied `T` — the library itself
does not publish a JSON schema for what Bee actually returns. The field
names in `packages/bee-adapter/src/raw-types.ts` come from Bee's current
record shapes as documented in the Phase 0 audit, not from a schema Bee
has committed to. Consequently:

- Every field on `BeeConversation`, `BeeFact`, and `BeeTodo` is optional
  and possibly-null.
- **Facts**: `created_at` and `confirmed` (boolean) are the current,
  authoritative fields, mapped to `capturedAt` and `status`
  (`confirmed: true` → `"confirmed"`, `confirmed: false` → `"pending"`).
  `timestamp` and `confirmation_status` are read only as a legacy
  fallback when the current fields are absent — a real `confirmed: true`
  fact never normalizes to `"unknown"`.
- **Todos**: `created_at`, `alarm_at`, and `completed` (boolean) are
  current and authoritative, mapped to `createdAt`, `dueAt`, and `status`.
  `created`, `alarm`, and `completion_status` are legacy fallbacks only.
- **Conversations**: utterances are nested two levels deep —
  `transcriptions[]`, each with its own `utterances[]` — not a flat list.
  The normalizer flattens `transcriptions[].utterances[]` into
  `LoopConversation.utterances[]`, preferring each utterance's
  `spoken_at` and falling back to `start` when `spoken_at` is absent. A
  transcription with malformed or missing `utterances` contributes zero
  utterances rather than throwing; it never silently drops a
  well-formed sibling transcription's utterances.
- **Conversation detail wrapper**: `bee.api.conversations.get(id)` may
  return the conversation wrapped under a `"conversation"` key
  (`{ "conversation": { "id": 123, ... } }`) rather than bare.
  `BeeAdapterClient.getConversation` unwraps this — see the regression
  tests in `packages/bee-adapter/src/__tests__/bee-client.test.ts`.
- **Timestamps**: every timestamp field accepts an ISO 8601 string, an
  epoch-milliseconds number, an epoch-*seconds* number, or a numeric
  string of either (`coerceTimestamp` in `normalize/util.ts`). Bee's
  numeric timestamp fields are realistic epoch-seconds values (~1.7e9,
  not ~1.7e12) — a value's magnitude decides whether it's treated as
  seconds (magnitude < 1e12, multiplied by 1000) or already-milliseconds.
  This matters because `new Date(value)` on a bare number always assumes
  milliseconds: feeding it an epoch-*seconds* value directly silently
  produces a date in January 1970 instead of an error, which is worse
  than throwing — see `docs/FRICTION-LOG.md` for how this was caught.
  A numeric-looking *string* (e.g. `"1735689600"`) is parsed as a number
  first, since `new Date("1735689600")` does not reliably parse a bare
  digit string as an epoch value either.
- `normalizeConversation` / `normalizeFact` / `normalizeTodo`
  never throw on a missing or unexpected field — they default it, record
  a `NormalizationWarning`, and validate the final record against its
  Zod contract schema before returning.

If your local `bee <command> --json` output uses different field names
than what's in `raw-types.ts`, that file is the one place to update —
extend it rather than loosening it to `any`, so the normalizer's
defensiveness stays meaningful.

## Pagination

Bee's list endpoints are cursor-paginated (`{ limit?, cursor? }` in,
`next_cursor` out). Phase 0 does not implement historical synchronization
— `fetchBeeSnapshot` fetches only the first page of conversations, facts,
and todos. It does not silently imply that page is the whole dataset: each
category's `Page<T>` carries a `nextCursor`, surfaced on
`BeeSnapshot.pagination`, so a later phase (or a future Phase 0 change)
has what it needs to page further without re-deriving it. A non-null
`nextCursor` today just means "there's more" — nothing in Phase 0 acts on
it yet.

`extractPage` (`packages/bee-adapter/src/pagination.ts`) reads a list
response defensively — a bare JSON array, or an object wrapping the array
under `conversations`/`facts`/`todos`/`items`/`data` — but **a
recognized wrapper with an empty array and an unrecognized shape are not
treated the same way**. `{ "facts": [] }` is a legitimate, successful
empty page. A response matching none of those keys (or not an
object/array at all) throws `BeeMalformedResponseError` instead of
quietly returning an empty page — an earlier version of this adapter
conflated the two, which would have silently reported "0 facts" for a
response that was actually broken or reshaped by a future Bee release,
indistinguishable from a real "you have no facts" answer. See the
regression tests in `packages/bee-adapter/src/__tests__/bee-client.test.ts`.

## Error handling

`BeeAdapterClient` classifies every failure from the underlying `bee`
subprocess into one of four errors
(`packages/bee-adapter/src/errors.ts`), so the CLI can give fixed,
actionable, privacy-safe guidance instead of a raw stack trace or Bee CLI
stderr text:

- **`BeeCliUnavailableError`** — the `bee` executable itself could not be
  spawned (`ENOENT`); most commonly, Bee CLI isn't installed or isn't on
  `PATH`.
- **`BeeAuthenticationError`** — thrown by `ensureAuthenticated()` when
  `bee.auth.getProfile()` fails for a reason that isn't clearly "CLI
  unavailable" or "malformed response" (`classifyAuthError` in
  `errors.ts`) — the user needs to run `bee login`. This is deliberately
  a different, stricter classification path than ordinary data calls use
  (see above) specifically so it doesn't collapse CLI-missing into
  auth-missing the way `@beeai/cli/lib`'s own `isAuthenticated()` does.
- **`BeeCommandError`** — `bee` ran and exited non-zero for any other
  reason (network issue, session expired mid-command, etc.), for an
  ordinary data call (not the authentication preflight).
- **`BeeMalformedResponseError`** — `bee` exited zero but its stdout
  wasn't valid JSON (likely a Bee CLI version mismatch), **or** a list
  response's JSON was valid but didn't match any recognized wrapper shape
  (see "Pagination" above).

None of these error messages include the underlying command's raw
stdout/stderr — see `packages/cli/src/error-report.ts` and
`docs/SECURITY.md`.

## Synthetic-only testing

Every fixture in `packages/bee-adapter/src/fixtures/synthetic-bee-data.ts`
is invented for this repository: synthetic conversation list/detail
responses (including the nested-transcription and wrapped-detail shapes
above), fact and todo list responses, empty responses, missing-field
records, malformed-field records, and pagination metadata (`next_cursor`).
No real Bee transcripts, facts, todos, IDs, names, locations, or account
information appear anywhere in this repository. `npm test` runs entirely
against these fixtures; the only things that touch a real, authenticated
Bee session are `npm run bee:check`, `npm run loops:check`, and
`npm run loops:correlate`, all run manually by the repository owner. Both
Loop commands hydrate full conversation detail (see "Full conversation hydration" in
`docs/LOOP-DETECTION.md`) — real transcript content passes through
process memory during that run, but is never written to disk and never
printed unless `--include-content` is explicitly passed (and even then,
redacted/truncated).
