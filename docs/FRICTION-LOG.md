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

**Effect (corrected on re-audit — the original entry here was wrong about the mechanism):** The first version of this entry claimed `createBeeClient()` "spawns whatever `bee` executable is already on `PATH` (i.e. a separately, globally installed and authenticated Bee CLI)" and that the workspace-local copy was therefore never invoked. That is **false**, and was asserted without checking. Verifying directly:

```
$ npm exec -- which bee
/…/cuenexa-loop/node_modules/.bin/bee
```

Because `@beeai/cli` declares `"bin": { "bee": "bin/bee.js" }`, npm workspace hoisting links that script at `node_modules/.bin/bee`, and any command run through `npm run`/`npm exec`/`npm start` gets `node_modules/.bin` prepended to `PATH`. `createBeeClient()` spawns the bare command name `"bee"`, so under every npm script in this project, the **workspace-local** `bin/bee.js` resolves first — not a separately-installed global `bee`. `bin/bee.js` then execs the bundled platform binary at `node_modules/@beeai/cli/dist/platforms/<platform>-<arch>/bee`, the exact file the skipped postinstall script would have `chmod`ed.

That bundled binary was still executable (`-rwxr-xr-x`) despite the skipped postinstall — npm's tarball extraction preserved the packed executable bit on this platform/npm version, making the postinstall's `chmod` redundant here, not necessary. Running it directly (`node_modules/.bin/bee status`) also authenticated against the same account as the separately-installed global `bee`, meaning Bee CLI's credential storage lives outside the package directory (not per-install), so a real user's `bee login` session is shared regardless of which physical binary copy runs it. All three facts were demonstrated, not assumed, before writing this correction.

**Severity:** Low in practice (demonstrated working end-to-end via `npm run bee:check` against a real session) — but Medium as a *documentation* finding, since the original claim was confidently wrong about which binary actually runs. See `docs/BEE_INTEGRATION.md` ("Which `bee` actually runs") for the corrected, permanent explanation and the version-drift risk this creates.

**Workaround:** None needed today — it works. If a future npm version stops preserving the executable bit on extraction, or ships a `@beeai/cli` version whose postinstall does more than `chmod`, the workspace-local `bee` could fail even though a global `bee` works fine. `npm install-scripts approve @beeai/cli` (after reviewing `scripts/postinstall.js`) removes that risk.

**Actionable suggestion:** Never assert "X spawns Y" for a subprocess-based integration without actually resolving what `PATH` puts there under the real invocation context (`npm exec -- which <cmd>`, not just "it should resolve to the global one"). Re-verify this conclusion if `@beeai/cli`'s postinstall or packaging changes.

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

---

## `npm audit` findings were all in the vitest/vite/esbuild dev toolchain

**Date:** 2026-09-09

**Task:** Resolve the 4 advisories (2 moderate, 1 high, 1 critical) `npm audit` reported after Phase 0's first audit pass.

**Steps taken:**
1. Ran `npm audit` and `npm audit --omit=dev` — the latter reported 0 vulnerabilities, confirming all 4 were dev-only (`vitest`/`vite`/`vite-node`/`esbuild`, pulled in transitively by `vitest`).
2. Read each advisory: a critical arbitrary-file-read/execute in Vitest's UI server (GHSA-5xrq-8626-4rwp, fixed at vitest ≥3.2.6), a high/moderate set of Vite path-traversal issues (fixed at vite ≥6.4.3), and a moderate `@vitest/mocker` path-traversal issue with a separate, *later* fix boundary (GHSA-82fw-gwwq-j7x9, fixed at vitest ≥4.1.11 on the 4.x line, not 3.2.6).
3. Rejected `npm audit fix --force`'s suggestion (jump straight to `vitest@5.0.0`, a two-major bump) in favor of the smallest version that actually clears every advisory: `vitest@^4.1.11`.
4. Bumped the root `vitest` devDependency, reinstalled, and re-ran `npm audit` (0 vulnerabilities), then the full `typecheck`/`test`/`build` sequence to confirm the 1.x→4.x jump didn't break anything (`vitest.config.ts`'s minimal `test.include`/`resolve.alias` surface carried over without changes needed).

**Expected result:** A single-command fix.

**Actual result:** The two advisory chains had *different* fix boundaries (vite needed ≥6.4.3, `@vitest/mocker` needed vitest ≥4.1.11 specifically — 3.2.7 alone still left the mocker advisory open), so getting a truly minimal fix took two iterations rather than accepting the first "clean audit" result at 3.2.7.

**Severity:** Low (dev-only; exploitability required manually running `vitest --ui` or a Vite dev server, which no script in this repository does) — worth fixing anyway to remove the residual risk of a developer running either manually.

**Actionable suggestion:** When `npm audit fix --force` suggests a major bump, check whether a smaller major (or even a patch within the *next* major, as here) already clears the advisory before accepting the aggressive suggestion — `npm view <pkg>@<version> version` and reading the linked GHSA's exact patched-version field (not just its severity) is enough to check.

---

## Defensive code that was too defensive, and hid real failures

**Date:** 2026-09-09

**Task:** A second audit pass found three places where "never throw, degrade gracefully" — the right default for a single malformed *field* — had been over-applied to situations where silence was actively misleading.

**Steps taken / what was found:**
1. `coerceTimestamp` fed any numeric value straight into `new Date(value)`, which always interprets a bare number as epoch *milliseconds*. Bee's numeric timestamp fields are epoch *seconds* (~1e9), so every one of them silently normalized to a date in January 1970 instead of throwing or warning — the single most dangerous kind of bug for "never throw" code, because the wrong answer looks exactly like a right one. Fixed by detecting the magnitude (< 1e12 ⇒ seconds) and applying it to numbers *and* numeric-looking strings alike (`new Date("1735689600")` parses as an invalid date, not the number 1,735,689,600 — a separate trap in the same function).
2. `extractPage` (list-response unwrapping) returned an empty page for both a genuinely empty `{ facts: [] }` *and* a completely unrecognized response shape. Both looked identical to a caller: "0 items, everything's fine." Fixed by throwing `BeeMalformedResponseError` for the unrecognized case, keeping the recognized-but-empty case as a real success.
3. `ensureAuthenticated()` called `@beeai/cli/lib`'s own `auth.isAuthenticated()` helper, which internally wraps the profile check in a bare `try { … } catch { return false }` — collapsing "Bee CLI isn't installed", "Bee CLI returned garbage", and "you haven't run `bee login`" into the exact same boolean. Fixed by calling the underlying `auth.getProfile()` directly (bypassing that collapsing wrapper) and classifying the real error.

**Expected result (before this pass):** All three appeared correct — normalizer tests were green because every test fixture happened to use ISO timestamp strings, not numeric epoch-seconds ones; pagination tests only exercised recognized wrappers; and there was no authenticated-vs-unavailable regression test because both cases had never been observed to behave differently.

**Actual result:** Each was silently wrong in a way unit tests didn't catch until fixtures were added specifically shaped like the buggy case (a numeric epoch-seconds timestamp, an unrecognized wrapper object, an ENOENT rejection from the profile check specifically).

**Severity:** High for (1) — silent data corruption with no signal at all; Medium for (2) and (3) — silent loss of a real distinction, not silent corruption of a value.

**Actionable suggestion:** For any "never throw, degrade gracefully" code path, ask specifically: *is there an input shape where the graceful fallback looks identical to a correct, successful result?* If yes, that's not resilience, it's a masked bug — add a fixture for exactly that input shape before trusting the code path. This is different from "missing field ⇒ warn and default," which is fine because the caller can see the warning.
