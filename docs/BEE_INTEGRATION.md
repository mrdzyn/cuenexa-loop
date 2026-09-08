# Bee integration

## What Phase 0 talks to

CueNexa Loop talks to the **local Bee developer proxy**, not a hosted Bee
API. This is the flow documented at
[docs.bee.computer/docs/proxy](https://docs.bee.computer/docs/proxy) and
[docs.bee.computer/docs](https://docs.bee.computer/docs):

1. Install the Bee CLI: `npm install -g @beeai/cli`.
2. Enable Developer Mode in the Bee iOS app (tap the version number five
   times in Settings).
3. `bee login` — one-time device authentication against your Bee account.
4. `bee proxy` — starts a local HTTP server, bound to `127.0.0.1`, default
   port `8787` (or the next free port; a Unix domain socket at
   `~/.bee/proxy.sock` is also available). This server is local-only and
   unauthenticated by design — see [docs/SECURITY.md](SECURITY.md).

`BeeProxyClient` (`packages/bee-adapter/src/client.ts`) is a thin wrapper
around three of that proxy's read endpoints:

| Endpoint               | Client method          |
| ------------------------ | ------------------------- |
| `GET /v1/conversations` | `listConversations()`   |
| `GET /v1/facts`         | `listFacts()`            |
| `GET /v1/todos`         | `listTodos()`             |

The proxy also exposes write endpoints (`POST`/`PUT`/`DELETE` for facts and
todos) and `GET /v1/conversations/:id`. Phase 0's client includes
`getConversation(id)` for completeness but the CLI only reads list
endpoints — Phase 0 has no reason to mutate Bee data.

## Why the raw types are defensive, not authoritative

Bee does not publish a formal JSON schema for these endpoints. The field
names in `packages/bee-adapter/src/raw-types.ts` (`short_summary`,
`primary_location`, `transcriptions`, `confirmation_status`,
`completion_status`, and so on) are a best-effort reconstruction from
Bee's own developer documentation as of this writing, not a contract Bee
has committed to. Consequently:

- Every field on `BeeConversation`, `BeeFact`, and `BeeTodo` is optional
  and possibly-null.
- `normalizeConversation` / `normalizeFact` / `normalizeTodo`
  (`packages/bee-adapter/src/normalize/`) never throw on a missing or
  unexpected field — they default it and record a
  `NormalizationWarning` instead. One field Bee renames in a future
  release should degrade one field of one record, not crash the pipeline.
- List endpoints are read defensively too: `BeeProxyClient` accepts either
  a bare JSON array or an object wrapping the array under a named key
  (`{ "conversations": [...] }`), since the exact wrapping wasn't
  confirmed from documentation alone.

If your local `bee proxy --json` output uses different field names than
what's in `raw-types.ts`, that file is the one place to update — extend
it rather than loosening it to `any`, so the normalizer's defensiveness
stays meaningful.

## Preflight check

`npm run bee:check` (`scripts/bee-check.mjs`) is a standalone script that
only checks whether `BEE_PROXY_URL` responds to an HTTP request — it does
not go through `BeeProxyClient` and does not read or print any
conversation, fact, or todo content. Use it to confirm `bee proxy` is
running before troubleshooting the CLI itself.

## Error handling

`BeeProxyClient` distinguishes two failure modes so the CLI can give
actionable guidance instead of a raw stack trace:

- **`BeeConnectionError`** — the proxy couldn't be reached at all (most
  commonly: `bee proxy` isn't running). The message tells the user to run
  `bee login` once and `bee proxy` in a separate terminal.
- **`BeeResponseError`** — the proxy responded, but with a non-2xx status.
  Carries the HTTP status code for callers that want to branch on it.

## Known limitations of this integration (Phase 0)

- Only the three read endpoints above are used; no writes, no
  location-only endpoint, no daily-summary endpoint.
- No pagination handling — `listConversations()` etc. return whatever the
  proxy returns for an unparameterized `GET`. If your Bee history is large
  and the proxy paginates, only the first page is read today.
- No retry/backoff — a single failed request surfaces immediately as an
  error rather than being retried.

These are reasonable gaps for a Phase 0 foundation and are documented here
so they're deliberate choices, not silent ones.
