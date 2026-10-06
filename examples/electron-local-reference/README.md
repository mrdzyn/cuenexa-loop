# CueNexa Loop — Electron Local Integration Reference (P4-R1A)

Executable architecture reference showing how a **local Electron Main Process** embeds CueNexa Loop using **authoritative processed Bee history only**.

This is not a finished CueNexa desktop product. Realtime / provisional awareness is intentionally absent (P4-R1B, unauthorized until P4-R1A is audited and accepted).

## What it demonstrates

- Bee authentication check
- `fetchCompleteDetectionSnapshot` → `detectLoopItems` → `correlateLoopItems` → `LoopStore.reconcile` → `buildReviewModel`
- Host-owned sanitized DTOs over a narrow IPC bridge
- Read-only renderer (structural metadata only)

## Architecture

```text
Bee processed history
        ↓
@cuenexa-loop/bee-adapter
        ↓
Electron Main Process
        ↓
detectLoopItems
        ↓
correlateLoopItems
        ↓
LoopStore.reconcile
        ↓
buildReviewModel
        ↓
sanitized IPC
        ↓
Electron Renderer
```

## Privacy boundary

- Processed Bee history is the only authority for persistent threads.
- Renderer never talks to Bee or SQLite.
- No raw transcripts, utterances, evidence, summaries, locations, or auth material cross IPC.
- No cloud API, telemetry, CDN, or external LLM.

## Prerequisites

- Node.js 22+
- Repository installed from the monorepo root (`npm ci`)
- Bee desktop app with Developer Mode
- Official `@beeai/cli` on PATH
- Authenticated Bee session: `bee status`

## Install / build / run

From the repository root:

```bash
npm ci
npm run build
npm start --workspace @cuenexa-loop/electron-local-reference
```

Example-only tests:

```bash
npx vitest run examples/electron-local-reference
```

## Storage

SQLite is owned by the Electron Main Process and stored under Electron `userData`:

`cuenexa-loop-electron-reference.sqlite`

This is separate from the CLI database (`~/.cuenexa-loop/cuenexa-loop.sqlite`). Override with `CUENEXA_LOOP_ELECTRON_DB_PATH` for tests.

Timezone resolution: valid `LOOP_TIMEZONE` → Bee account timezone → system timezone.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Bee unavailable | Install Bee CLI; confirm `bee` is on PATH |
| Unauthenticated | Run `bee login`, then `bee status` |
| Sync failed / empty loops | Wait for Bee processed history; use **Process now** in the Bee app if needed |
| Partial snapshot banner | Completeness is intentionally not claimed; do not infer resolution |

## Realtime

P4-R1A does **not** subscribe to Bee realtime, does not use `ProvisionalAwareness`, and does not show PROVISIONAL UI.
