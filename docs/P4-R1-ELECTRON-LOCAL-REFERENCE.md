# P4-R1 — Electron Local Integration Reference

This is the bounded implementation contract for embedding CueNexa Loop in a local Electron host. It is a post-submission **executable architecture reference**, not a CueNexa desktop product and **not Phase 5**.

Authority: `docs/STATUS.md` P4-R1 contract, `docs/APP-INTEGRATION-GUIDE.md`, and `AGENTS.md` invariants.

`config/project-profile.json` does **not** exist in this repository. P4-R1 does not require it.

Location: `examples/electron-local-reference/` (private npm workspace). CueNexa packages remain `"private": true` and unpublished.

---

## Phases

| Phase | Scope | State |
| --- | --- | --- |
| **P4-R1A** | Authoritative processed-history Electron integration | This task |
| **P4-R1B** | Provisional realtime awareness in the same reference | Unauthorized until P4-R1A is independently audited and accepted |
| **P4-R1C** | Final developer documentation, live Bee acceptance, screenshots | After P4-R1A (and P4-R1B if authorized) |

P4-R1A must be fully usable with historical sync alone. The host remains correct if Bee realtime is absent, disconnected, or never implemented.

---

## P4-R1A — authoritative historical path (this task)

Mandatory flow:

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
host-owned sanitized DTO mapping
        ↓
narrow Electron IPC bridge
        ↓
Electron Renderer
```

Use only package-root exports from `@cuenexa-loop/bee-adapter`, `@cuenexa-loop/loop-engine`, `@cuenexa-loop/loop-store`, and `@cuenexa-loop/contracts` as needed.

Do **not** deep-import `@cuenexa-loop/cli`. Host-owned timezone resolution copies the documented hierarchy; it does not import CLI helpers.

### Completeness

A snapshot is complete only when all of the following hold:

1. `fetchCompleteDetectionSnapshot().complete` is true;
2. Bee snapshot warnings are empty;
3. detection warnings are empty;
4. correlation snapshot completeness is `"complete"`.

Otherwise mark the result **partial**. Never infer resolution from absence. Never claim completeness when any warning or pagination bound made the scan partial.

### Timezone hierarchy (host-owned)

1. Valid `LOOP_TIMEZONE` override, if supplied;
2. Valid timezone from Bee authentication;
3. System timezone fallback.

Never assume UTC.

### Storage

Electron Main Process owns `LoopStore`. Default path is under Electron `userData` (application-specific file, not the CLI `~/.cuenexa-loop/cuenexa-loop.sqlite` path). Override with `CUENEXA_LOOP_ELECTRON_DB_PATH` for tests. No schema changes.

### IPC / renderer

Expose only:

- `cuenexa.getStatus()`
- `cuenexa.sync()`
- `cuenexa.getReview()`

Renderer receives sanitized structural DTOs only. No `ipcRenderer`, Node, filesystem, Bee client, SQLite, raw Bee payloads, transcripts, utterances, evidence, facts/todo source text, summaries, precise location, speaker names, auth material, or realtime UUIDs.

### Window security

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. No `webviewTag`, remote module, arbitrary navigation, or arbitrary window creation. Restrictive local CSP. No CDN, telemetry, analytics, or remote fonts.

### UI (read-only)

Header (title, Bee auth state, timezone, Sync), review section counts, structural loop cards, empty/error states. No transcript viewer, content toggle, editing, ack/snooze/pin actions, or PROVISIONAL UI.

---

## P4-R1B — provisional realtime (future, not authorized)

```text
Bee realtime
→ ProvisionalAwareness
→ memory-only PROVISIONAL UI
→ never directly persisted
```

P4-R1A must not call `subscribeRealtime`, `subscribeToBeeRealtime`, `ProvisionalAwareness`, realtime UUID mapping, watch loops, or show PROVISIONAL UI.

---

## P4-R1C — documentation / live acceptance (future)

Human/live Bee acceptance of the reference app after engineering audit. Screenshots and final developer polish. Not part of P4-R1A.

---

## Invariants (non-negotiable)

- Processed Bee history is the only authority for persistent `LoopThread` state.
- Realtime remains provisional and memory-only (when later authorized).
- Electron Main Process owns Bee access and `LoopStore`.
- Renderer receives sanitized derived DTOs only.
- No raw transcripts persisted.
- No direct Renderer access to Bee or SQLite.
- No external LLM, cloud API, background daemon, HTTP/WebSocket server, or new persistence schema.
- No guessing realtime UUID ↔ historical numeric-ID mappings.
- No deep imports from `@cuenexa-loop/cli`.
- Tests use synthetic fixtures only.
- P4-R1 is not Phase 5. Phase 5 remains NOT DEFINED / NOT AUTHORIZED.

---

## Out of scope for all of P4-R1 unless separately authorized

Cloud API, daemon, tray, native notifications, auto-start, mobile, public npm SDK, package publishing, custom auth, LLM/summarization, telemetry, updater, installer/signing, production packaging, user mutation actions, Phase 5.
