# Bee integration

## What Phase 0 talks to

CueNexa Loop talks to Bee through the **official `@beeai/cli/lib`
library**, not a hand-rolled HTTP client. This is the primary and only
integration path — there is no local proxy to run, no HTTP endpoint to
manage, and no bespoke authentication flow.

```ts
import { createBeeClient } from "@beeai/cli/lib";

const bee = createBeeClient();

await bee.auth.isAuthenticated();
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
`BeeAdapterClient.ensureAuthenticated()` only calls
`bee.auth.isAuthenticated()` and checks the boolean it returns.

`BeeAdapterClient` (`packages/bee-adapter/src/bee-client.ts`) is the sole
wrapper around this library in the codebase:

| Bee capability                        | `BeeAdapterClient` method       |
| --------------------------------------- | ---------------------------------- |
| Authentication check                   | `ensureAuthenticated()`          |
| `bee.api.conversations.list()`         | `listConversations(options?)`   |
| `bee.api.conversations.get(id)`        | `getConversation(id)`            |
| `bee.api.facts.list()`                 | `listFacts(options?)`            |
| `bee.api.todos.list()`                 | `listTodos(options?)`             |

No Bee response shape leaks past this file: everything above it in
`@cuenexa-loop/cli` only ever sees `@cuenexa-loop/contracts` types.

## Optional proxy fallback: none

An earlier version of this adapter talked to Bee's local `bee proxy` HTTP
server directly. That integration has been **fully removed**, not merely
demoted — see [docs/FRICTION-LOG.md](FRICTION-LOG.md) for the history.
There was no remaining justification for maintaining two integration
paths once the official library covered the same functionality with a
smaller trust surface (no locally-bound, unauthenticated HTTP server).
Running `bee proxy` is not required for any part of the normal CueNexa
Loop workflow.

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
- `normalizeConversation` / `normalizeFact` / `normalizeTodo`
  never throw on a missing or unexpected field — they default it, record
  a `NormalizationWarning`, and validate the final record against its
  Zod contract schema before returning.
- List responses are read defensively: `extractPage` accepts a bare JSON
  array or an object wrapping the array under `conversations`/`facts`/
  `todos`/`items`/`data`, alongside an optional `next_cursor` — an
  unrecognized wrapper shape produces an empty page rather than throwing.

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

## Error handling

`BeeAdapterClient` classifies every failure from the underlying `bee`
subprocess into one of four errors
(`packages/bee-adapter/src/errors.ts`), so the CLI can give fixed,
actionable, privacy-safe guidance instead of a raw stack trace or Bee CLI
stderr text:

- **`BeeCliUnavailableError`** — the `bee` executable itself could not be
  spawned (`ENOENT`); most commonly, Bee CLI isn't installed or isn't on
  `PATH`.
- **`BeeAuthenticationError`** — `bee.auth.isAuthenticated()` returned
  `false`; the user needs to run `bee login`.
- **`BeeCommandError`** — `bee` ran and exited non-zero for any other
  reason (network issue, session expired mid-command, etc.).
- **`BeeMalformedResponseError`** — `bee` exited zero but its stdout
  wasn't valid JSON, most likely a Bee CLI version mismatch.

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
against these fixtures; the only thing that touches a real, authenticated
Bee session is `npm run bee:check`, run manually by the repository owner.
