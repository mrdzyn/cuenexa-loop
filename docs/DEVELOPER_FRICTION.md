# Developer friction log

Notes for future contributors on rough edges hit while building Phase 0,
and why the current tradeoffs were made. Add to this file rather than
silently working around a new one.

## Bee's API surface isn't formally documented

Bee's public developer docs (docs.bee.computer) describe the proxy's
endpoints and give example output, but stop short of a JSON schema or
OpenAPI spec. There was no way to confirm exact field names
(`short_summary` vs `summary_short`, epoch-ms vs ISO timestamps, whether
list endpoints return a bare array or a wrapped object) without a live,
authenticated Bee proxy to inspect — which isn't available in this
development environment.

**Consequence for the code:** `packages/bee-adapter/src/raw-types.ts` is
explicitly labeled best-effort, every field is optional, and
`packages/bee-adapter/src/normalize/` is written to degrade gracefully
field-by-field rather than assume any field is present. If you have a real
Bee account, running `bee proxy` and comparing its actual JSON against
`raw-types.ts` would be a high-value first contribution — please open a PR
adjusting the raw types (and adding a regression fixture) rather than just
noting the mismatch, since fixtures must stay synthetic-only.

## No live Bee proxy available while building this

Because of the above, `packages/bee-adapter`'s test suite
(`src/__tests__/`) is built entirely against synthetic fixtures
(`fixtures/synthetic-bee-data.ts`) and an injectable `fetchImpl` on
`BeeProxyClient`, rather than against a real running proxy. This is also
the right long-term testing strategy for a project that must never depend
on real personal data to run its test suite (see
[docs/PRIVACY.md](PRIVACY.md)) — but it does mean an actual end-to-end run
against a live `bee proxy` has not been exercised by the author of this
foundation, only by the unit tests. Treat a first real run as a
verification step, not a formality.

## `exactOptionalPropertyTypes` was turned off

The base `tsconfig` (`tsconfig.base.json`) enables `strict` and
`noUncheckedIndexedAccess`, but deliberately leaves
`exactOptionalPropertyTypes` off. The normalizers assign `null` to a lot of
optional-looking fields (timestamps, location, detailed summary) by
design — contracts use `T | null` rather than `T | undefined` for "this
field is meaningfully absent" so a value is always present at the key,
just possibly `null`. `exactOptionalPropertyTypes` is about a different
distinction (`undefined`-typed optional properties) and added friction
without value here; revisit if the contracts schema evolves to use
optional (`?:`) properties instead of `| null` unions.

## Workspace packages resolve to source in tests, to `dist/` at runtime

`vitest.config.ts` at the repository root aliases `@cuenexa-loop/contracts`
and `@cuenexa-loop/bee-adapter` straight to their `src/index.ts`, so
`npm test` works without a prior `npm run build`. The CLI's `npm start`,
by contrast, runs compiled `dist/` output and does need a build first.
If you add a fourth workspace package, add its alias to
`vitest.config.ts` too, or its tests will try to resolve an unbuilt
`dist/` and fail with a confusing module-not-found error.
