# Friction log

Structured notes on real friction encountered building and remediating
CueNexa Loop Phase 0, for future contributors. Add a new entry rather than
editing history when you hit something new; update severity/workaround if
a later change resolves an earlier entry.

No entry below includes a local username, computer name, filesystem path,
account ID, authentication data, or private Bee data.

---

## Bee CLI npm postinstall script warning

**Date:** 2026-09-09

**Task:** Add `@beeai/cli` as a dependency of `@cuenexa-loop/bee-adapter` and run `npm install` at the repository root.

**Steps taken:**
1. Added `"@beeai/cli": "^0.7.3"` to `packages/bee-adapter/package.json` dependencies.
2. Ran `npm install` from the repository root.

**Expected result:** A clean install with `@beeai/cli` linked into the workspace, ready to import `@beeai/cli/lib`.

**Actual result:** The install succeeded, but npm printed a warning that `@beeai/cli`'s postinstall script was not run:

```
npm warn install-scripts 3 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.21.5 (postinstall: node install.js)
npm warn install-scripts   fsevents@2.3.3 (install: (install scripts present))
npm warn install-scripts   @beeai/cli@0.7.3 (postinstall: node ./scripts/postinstall.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

This is npm's install-scripts allowlist security gate: postinstall scripts are not run automatically unless explicitly approved.

**Effect:** Investigating `@beeai/cli`'s `scripts/postinstall.js` showed it only `chmod`s a bundled platform-specific `bee` binary at `dist/platforms/<platform>-<arch>/bee`, used by that package's own `bin: bee` entry. CueNexa Loop never invokes that bundled binary — it only imports the pure-JS `@beeai/cli/lib` subpath, and `createBeeClient()` spawns whatever `bee` executable is already on `PATH` (i.e. a separately, globally installed and authenticated Bee CLI). So the skipped postinstall step had no effect on this project's functionality. This was verified, not assumed: `npm run typecheck`, `npm test`, and `npm run build` all pass with the postinstall skipped.

**Severity:** Low — cosmetic warning, no functional impact for this project's usage pattern.

**Workaround:** None needed for `@cuenexa-loop/bee-adapter`'s use of `@beeai/cli/lib`. If a future contributor wants the bundled `bin: bee` binary from the workspace-local copy specifically (rather than relying on a separately installed global `bee`), run `npm install-scripts approve @beeai/cli` after reviewing `scripts/postinstall.js`.

**Actionable suggestion:** Document this explicitly in `docs/BEE_INTEGRATION.md` (done) so a future contributor doesn't spend time chasing a warning that doesn't affect this project's integration path. If `@beeai/cli` publishes a version whose postinstall does more than `chmod` a binary this project doesn't use, re-verify this conclusion.

---

## Bee's response shapes are not formally documented

**Date:** 2026-09-08 (originally), confirmed against `@beeai/cli/lib`'s exact TypeScript declarations on 2026-09-09

**Task:** Build `packages/bee-adapter`'s raw types and normalizers to match what Bee actually returns.

**Steps taken:**
1. Read Bee's public developer docs (docs.bee.computer) for the proxy API.
2. After the official-library migration, read `@beeai/cli`'s own `.d.ts` files (`dist/lib/*.d.ts`) directly, since those are authoritative for the *call* shape (`DataApi`), even though the *response* JSON shape (each method returns `Promise<T>` with `T = unknown` by default) is still not formally typed by the library itself.

**Expected result:** A definitive schema to code against.

**Actual result:** The library's own types confirm the call surface (`facts.list()`, `todos.list()`, `conversations.list()/get()`, cursor-based `ListOptions`) precisely, but intentionally leave the *response payload* shape as a generic `T` the caller supplies. The exact field names used in this adapter's `raw-types.ts` come from the Phase 0 audit's description of current Bee record shapes, not from a published JSON schema.

**Severity:** Medium — the adapter is written defensively (every field optional, normalizers never throw, legacy-field fallbacks retained) specifically because of this gap, but a real field-name mismatch would only surface as a `NormalizationWarning`, not a build-time error.

**Workaround:** `packages/bee-adapter/src/raw-types.ts` is the single place to update if a real Bee response uses different field names than documented here. Extend it rather than loosening it to `any`.

**Actionable suggestion:** The first time someone runs `npm run bee:check` (or `npm start`) against a real Bee account and sees non-zero `Normalization warnings`, that is a signal this file has drifted from reality — treat it as a concrete bug report, not noise, and open a PR adjusting `raw-types.ts` and the corresponding synthetic fixtures.

---

## Workspace packages resolve to source in tests, to `dist/` at runtime

**Date:** 2026-09-08

**Task:** Make `npm test` fast to iterate on without requiring a build first.

**Steps taken:** Configured `vitest.config.ts` at the repository root to alias `@cuenexa-loop/contracts` and `@cuenexa-loop/bee-adapter` straight to their `src/index.ts`.

**Expected/actual result:** Works as intended — `npm test` runs against live source. `npm start` and `npm run bee:check`, by contrast, run compiled `dist/` output and do need `npm run build` first (`bee:check` runs it automatically).

**Severity:** Low — just a thing to remember.

**Actionable suggestion:** If a fourth workspace package with tests is added, add its alias to `vitest.config.ts` too, or its tests will try to resolve an unbuilt `dist/` and fail with a confusing module-not-found error.

---

## `exactOptionalPropertyTypes` was turned off

**Date:** 2026-09-08

**Task:** Decide how strict `tsconfig.base.json` should be.

**Steps taken:** Enabled `strict` and `noUncheckedIndexedAccess`; tried `exactOptionalPropertyTypes` and reverted it.

**Expected result:** Maximum type strictness with no downside.

**Actual result:** The contracts use `T | null` (not optional `?:` properties) for "meaningfully absent" fields by design, so `exactOptionalPropertyTypes` — which governs a different distinction — added friction in the normalizers without catching real bugs.

**Severity:** Low.

**Actionable suggestion:** Revisit only if the contracts schema evolves to use optional (`?:`) properties instead of `| null` unions.
