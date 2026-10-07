# CueNexa Loop — Electron Local Integration Reference

Executable architecture reference showing how a **local Electron Main Process** embeds CueNexa Loop using **authoritative processed Bee history** plus optional **memory-only provisional realtime awareness**.

P4-R1A and P4-R1B are merged and live-accepted. P4-R1C is documentation/acceptance polish only. This example is **not** a finished CueNexa desktop product and is **not Phase 5**.

## What this reference demonstrates

- Bee authentication and host-owned timezone resolution.
- Authoritative processed-history flow:
  `fetchCompleteDetectionSnapshot` → `detectLoopItems` → `correlateLoopItems` → `LoopStore.reconcile` → `buildReviewModel`.
- Optional realtime flow:
  `BeeAdapterClient.subscribeRealtime()` → `ProvisionalAwareness` → sanitized **PROVISIONAL** UI.
- Electron Main ownership of Bee access and SQLite.
- Narrow, sanitized IPC to a read-only renderer.
- Failure isolation: authoritative Sync remains usable when realtime is off, disconnected, unsupported, or never started.
- Restart behavior: persistent authoritative state remains in SQLite; provisional state is memory-only and is cleared.

## Architecture

### Authoritative history — persistence authority

```text
Bee processed history
        ↓
BeeAdapterClient.ensureAuthenticated()
        ↓
fetchCompleteDetectionSnapshot()
        ↓
detectLoopItems()
        ↓
correlateLoopItems()
        ↓
LoopStore.reconcile()
        ↓
buildReviewModel()
        ↓
host-owned sanitized DTO
        ↓
Electron IPC
        ↓
Authoritative review UI
```

Processed Bee history is the **only** source allowed to create or reconcile persistent `LoopThread` state.

### Provisional realtime — memory only

```text
Bee realtime
        ↓
BeeAdapterClient.subscribeRealtime()
        ↓
Electron Main Process
        ↓
ProvisionalAwareness
        ↓
sanitized provisional DTO
        ↓
cuenexa:provisional-updated
        ↓
PROVISIONAL renderer section
        ↓
never persisted
```

Realtime never writes `LoopStore`, never changes authoritative completeness, and never guesses realtime UUID ↔ historical conversation-ID mappings.

## Prerequisites

- Node.js 22 or newer.
- npm compatible with the repository lockfile.
- Bee desktop app with Developer Mode enabled.
- Official `@beeai/cli` available on `PATH`.
- Authenticated Bee session.

From the repository root:

```bash
node --version
npm --version
bee status
npm ci
```

If `bee status` reports unauthenticated, complete Bee CLI authentication before launching the example.

## Build and run

From the repository root:

```bash
npm run build
npm start --workspace @cuenexa-loop/electron-local-reference
```

Example-only automated tests use synthetic fixtures:

```bash
npx vitest run examples/electron-local-reference
```

The repository-wide implementation quality gates are:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

## Using the reference

### 1. Authoritative Sync

Launch the app and use **Sync**.

Sync authenticates with Bee, fetches complete processed history, runs deterministic detection/correlation, reconciles persistent local state, builds the review model, and sends only sanitized structural DTOs to the renderer.

The review UI separates:

- Due Now
- Needs Attention
- Waiting
- Snoozed
- Recently Resolved

A partial/degraded historical snapshot stays visibly partial. The host never resolves work merely because an item disappears from a later snapshot.

### 2. Optional provisional realtime

Use **Start Realtime** to begin the optional Bee realtime subscription.

Expected health states are:

`off → connecting → active`

The **PROVISIONAL** section is visually separate from authoritative review sections. It may show structural fields such as signal kind, observation time, confidence, and the fixed `PROVISIONAL` label. It does not show raw utterance text, transcript/evidence text, Bee session IDs, or realtime conversation UUIDs.

Use **Stop Realtime** to close the subscription and return health to `off`.

Start/Stop/Start is supported. A terminal stream disconnect is isolated from authoritative Sync and a later Start can establish a fresh subscription.

### 3. Restart behavior

After application restart:

- realtime starts `off`;
- provisional signals are empty because they were memory-only;
- persistent authoritative SQLite state remains available to the Main Process;
- the renderer's in-memory review begins empty until the next authoritative **Sync**.

That empty-until-Sync renderer state is expected for this reference and is documented in P4-R1A live acceptance.

## Storage

Electron Main owns `LoopStore`.

Default Electron database location:

`<Electron userData>/cuenexa-loop-electron-reference.sqlite`

This is intentionally separate from the CLI database:

`~/.cuenexa-loop/cuenexa-loop.sqlite`

For disposable/manual testing, override the Electron database path:

```bash
export CUENEXA_LOOP_ELECTRON_DB_PATH="/tmp/cuenexa-loop-electron-reference.sqlite"
npm start --workspace @cuenexa-loop/electron-local-reference
```

P4-R1 adds no persistence schema.

## Timezone hierarchy

The host resolves timezone in this order:

1. valid `LOOP_TIMEZONE` environment override;
2. valid Bee account timezone from authentication;
3. system timezone.

The reference does not assume UTC.

## IPC and renderer trust boundary

P4-R1A invoke channels:

- `cuenexa:get-status`
- `cuenexa:sync`
- `cuenexa:get-review`

P4-R1B adds only:

- `cuenexa:start-realtime`
- `cuenexa:stop-realtime`
- `cuenexa:get-provisional`
- `cuenexa:provisional-updated` — Main → trusted renderer event

The renderer receives sanitized derived DTOs only. It does not receive Bee clients, SQLite handles, raw Bee payloads, transcripts, utterances, evidence, summaries, precise locations, authentication material, identity-bridge internals, or realtime UUIDs.

Window hardening remains:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- no `webviewTag`
- no arbitrary navigation/window creation
- restrictive local CSP
- no CDN, telemetry, analytics, or remote fonts

## Failure isolation

| Symptom | Expected behavior / action |
| --- | --- |
| Bee CLI unavailable | App reports a sanitized unavailable state. Install/restore Bee CLI and confirm `bee` is on `PATH`. |
| Bee unauthenticated | Complete Bee CLI authentication, then verify with `bee status`. |
| Sync returns no new history | Bee processed history may lag; wait or use **Process now** in Bee when appropriate, then Sync again. |
| Partial snapshot | Treat as partial. Do not infer resolution from absence. |
| Realtime disconnected | PROVISIONAL health may show disconnected; authoritative review remains usable. Start realtime again when appropriate. |
| Realtime warning / unsupported event | Warning is sanitized; unsupported realtime data is ignored and never persisted. |
| No provisional signals while realtime is active | Realtime is best-effort/lossy. A supported ingestible utterance may not have arrived; authoritative Sync remains the repair/authority path. |
| App restarted and renderer is empty | Expected until authoritative Sync rebuilds the in-memory review. Persistent SQLite state has not been converted into a renderer snapshot automatically. |

## Privacy and security boundary

The reference intentionally minimizes content exposure:

- no raw transcripts, utterances, evidence, summaries, private Bee payloads, auth material, or realtime UUIDs cross the renderer IPC boundary;
- realtime provisional state is memory-only;
- processed history is the only persistence authority;
- no Bee-derived data is uploaded to a cloud service or external LLM;
- no telemetry or analytics is included;
- tests use synthetic fixtures only;
- identity mappings are accepted only when Bee explicitly supplies both identifiers in one supported payload.

## Acceptance evidence

Live acceptance is already complete; P4-R1C consolidates the evidence rather than reopening architecture.

- [P4-R1A live acceptance — authoritative historical path](../../docs/audit/P4-R1A-LIVE-ACCEPTANCE-2026-10-06.md)
- [P4-R1B live acceptance — provisional realtime path](../../docs/audit/P4-R1B-LIVE-ACCEPTANCE-2026-10-07.md)
- [P4-R1 contract](../../docs/P4-R1-ELECTRON-LOCAL-REFERENCE.md)
- [Application Integration Guide](../../docs/APP-INTEGRATION-GUIDE.md)

P4-R1B live acceptance directly verified that real Bee realtime produced sanitized provisional signals, realtime alone made zero persistent thread/event changes, and provisional state disappeared after restart.

## Screenshots

No screenshots are committed in P4-R1C.

P4-R1A acceptance screenshots were captured locally and intentionally not committed, and P4-R1B acceptance recorded structural evidence without committed screenshots. There is no existing repository screenshot artifact that can be independently verified as sanitized, so P4-R1C omits screenshots rather than risk committing private Bee-derived content.

A future documentation-only screenshot may be added only if it contains no transcript/utterance/evidence content, private titles, tokens, realtime UUIDs, session IDs, speaker identifiers, precise location, or other unnecessary Bee-derived personal data.

## Known limitations

- Bee processed-history availability may lag realtime; manual **Process now** may sometimes be useful during testing.
- Realtime is provisional, best-effort, and not persistence authority.
- Realtime UUIDs and historical numeric conversation IDs are separate namespaces; CueNexa does not guess mappings.
- The renderer does not reconstruct the review snapshot from SQLite on startup; run Sync after restart.
- Spoken time-of-day fidelity remains a known non-blocking integration issue documented in the Phase 4 acceptance record.
- The workspace packages are private and are not published as a public npm SDK.

## Non-goals

This reference is not a production desktop application. P4-R1 does not authorize:

- new persistence or realtime architecture;
- cloud/API services or telemetry;
- external LLMs;
- tray, native notifications, or autostart;
- installer, updater, signing, or production packaging;
- public npm publishing;
- Phase 5.

Phase 5 remains **NOT DEFINED / NOT AUTHORIZED**.
