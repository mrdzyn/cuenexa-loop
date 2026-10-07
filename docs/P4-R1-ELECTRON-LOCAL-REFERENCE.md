# P4-R1 — Electron Local Integration Reference

This is the bounded implementation contract for embedding CueNexa Loop in a local Electron host. It is a post-submission **executable architecture reference**, not a CueNexa desktop product and **not Phase 5**.

Authority: `docs/STATUS.md` P4-R1 contract, `docs/APP-INTEGRATION-GUIDE.md`, and `AGENTS.md` invariants.

`config/project-profile.json` does **not** exist in this repository. P4-R1 does not require it.

Location: `examples/electron-local-reference/` (private npm workspace). CueNexa packages remain `"private": true` and unpublished.

---

## Phases

| Phase | Scope | State |
| --- | --- | --- |
| **P4-R1A** | Authoritative processed-history Electron integration | MERGED |
| **P4-R1B** | Provisional realtime awareness in the same reference | MERGED |
| **P4-R1C** | Final developer documentation and acceptance polish | MERGED |

P4-R1A must be fully usable with historical sync alone. The host remains correct if Bee realtime is absent, disconnected, or never implemented.

---

## P4-R1A — authoritative historical path

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

Header (title, Bee auth state, timezone, Sync), review section counts, structural loop cards, empty/error states. No transcript viewer, content toggle, editing, or ack/snooze/pin actions. P4-R1A remains fully usable without the P4-R1B PROVISIONAL section.

---

## P4-R1B — provisional realtime (merged)

Authorized baseline: `bf5d93ea27865b18ace5022befd06c6d8b217600` (`origin/main` at authorization). P4-R1A remains the mandatory authoritative historical path.

### Purpose

Demonstrate optional, memory-only Bee realtime awareness in `examples/electron-local-reference/` using package-root APIs only.

### Non-goals

Not Phase 5. Not a CueNexa desktop product. Not a persistence model. Not realtime-created `LoopThread` state. Not a daemon, cloud service, public SDK, LLM, tray, notifications, or installer.

### Architecture

```text
Bee realtime
→ BeeAdapterClient.subscribeRealtime()
→ Electron Main Process
→ ProvisionalAwareness (one in-memory instance)
→ host-owned sanitized provisional DTO
→ narrow IPC / event
→ Electron Renderer PROVISIONAL UI
→ never persisted
```

Tracks stay separate. Authoritative Sync must work if realtime was never started, is unsupported, disconnects, warns, or fails.

### Package-root APIs

- `@cuenexa-loop/bee-adapter`: `BeeAdapterClient.subscribeRealtime(options?: BeeRealtimeSubscribeOptions): BeeRealtimeSubscription` (`{ events, close() }`).
- `@cuenexa-loop/loop-engine`: `ProvisionalAwareness` — `ingest`, `list`, `pruneExpired`, `retireConversations`, `resolveConversationIdentity`.

Do not import CLI `watch-runtime`. Do not deep-import `@cuenexa-loop/cli`. Do not expose `BeeConversationIdentityBridge` to the renderer. Do not call `subscribeToBeeRealtime` from the example (use `BeeAdapterClient.subscribeRealtime`).

### Ownership

Electron Main owns the Bee subscription, exactly one `ProvisionalAwareness`, warning handling, pruning, lifecycle, and cleanup. Renderer never receives `BeeAdapterClient`, the subscription, raw events, `ProvisionalAwareness`, SQLite, `LoopStore`, or identity-bridge internals.

Application restart clears all provisional state (expected).

### Authority rule

Processed Bee history is the only authority for persistent `LoopThread` state. Realtime must never create, mutate, reopen, resolve, or delete persistent threads, structural history, user-state, or notification-ledger rows. **Zero `LoopStore` writes from realtime events.** Realtime health must not change authoritative completeness.

### IPC / events

Preserve P4-R1A invoke channels. Add only:

- `cuenexa:start-realtime`
- `cuenexa:stop-realtime`
- `cuenexa:get-provisional`
- `cuenexa:provisional-updated` (Main → trusted renderer event)

Fixed allowlist. No generic dispatcher. Trusted bundled renderer only. Untrusted senders receive zero CueNexa data.

### Provisional DTO

Renderer may receive:

```text
health: off | connecting | active | disconnected
warningCode / sanitized warningMessage
signals: { id, kind, observedAt, state: "active", label: "PROVISIONAL", confidence }
```

Do not expose raw transcript, utterance text, evidence, summaries, facts/todo source, location, speaker names/IDs, auth material, raw Bee payloads, correlation anchors, identity-bridge state, or raw realtime conversation UUIDs.

### Identity and retirement

Never guess realtime UUID ↔ historical numeric-ID mappings (no time, title, speaker, transcript, or sequence heuristics).

`resolveConversationIdentity(sessionId, conversationId)` only when a single supported `conversation_state` event already contains both identifiers.

`retireConversations` only from conversation IDs detected on an **authoritative Sync**. Do not auto-refresh persistence from realtime idle. Do not retire because a signal disappeared, history omitted it, or a heuristic match seems likely. Bounded TTL/pruning may expire memory-only signals.

### Duplicate / bounded memory

Use existing `ProvisionalAwareness` dedupe, buffer, and TTL. Do not add a daemon.

### Disconnect / warnings

Malformed or unsupported realtime events: skip/warn; no persistence. Disconnect: provisional health becomes disconnected; authoritative review unchanged. Authoritative Sync failure uses existing P4-R1A degraded behavior and does not depend on realtime health.

### Shutdown

Close the Bee subscription, remove listeners, release in-memory provisional state. No orphan stream or background runtime.

### Renderer

Distinct **PROVISIONAL** section, never mixed into Due Now / Needs Attention / Waiting / Snoozed / Recently Resolved. States: off/not started, connecting, active, disconnected/degraded, no signals, one or more signals.

### Tests

Synthetic fixtures only. Host-boundary coverage: no `LoopStore` writes from realtime; DTO privacy; IPC trust; disconnect isolation; pruning/dedupe; retirement only via explicit historical IDs; P4-R1A regressions remain green.

### Live Bee acceptance

PASSED on 2026-10-07 after independent engineering audit. See `docs/audit/P4-R1B-LIVE-ACCEPTANCE-2026-10-07.md`. P4-R1B was squash-merged in PR #18 at main `a938001abd232ddd6d4a2aab1fa6af0a8aad842e`.

### P4-R1B is not Phase 5

Phase 5 remains NOT DEFINED / NOT AUTHORIZED.

---

## P4-R1C — final developer documentation and acceptance polish (authorized)

Authorized baseline: `bb94ee9cbeb243b6c0043dbacbf33a277c575e40` (`origin/main` at authorization).

### Purpose

Close P4-R1 as a developer-usable Electron integration reference by polishing the example documentation, consolidating already-completed acceptance evidence, documenting troubleshooting and known limitations, and adding sanitized screenshots only when they can be produced without exposing private Bee-derived content.

P4-R1A and P4-R1B remain MERGED. Their live Bee acceptance is already PASS. P4-R1C consolidates and presents that evidence; it does not reopen architecture or require another live Bee acceptance campaign.

### Allowed scope

- `docs/P4-R1-ELECTRON-LOCAL-REFERENCE.md`;
- `docs/STATUS.md`;
- `examples/electron-local-reference/README.md`;
- documentation-only supporting files;
- optional sanitized screenshots under `examples/electron-local-reference/` or `docs/` when privacy-safe.

### Screenshot privacy rules

Any committed screenshot must omit or sanitize:

- transcripts, utterances, evidence, summaries, and private conversation titles;
- Bee authentication material or tokens;
- realtime conversation UUIDs, session IDs, speaker identifiers, or precise location;
- any other Bee-derived personal content that is not necessary to demonstrate the structural UI.

If a screenshot cannot be produced safely, omit it and document that decision. Screenshots are polish, not an acceptance requirement.

### Required developer documentation

The Electron reference documentation must explain:

- prerequisites, install, build, test, and run commands;
- authoritative Sync and optional realtime Start/Stop behavior;
- the authoritative-history and memory-only provisional architecture tracks;
- storage path and disposable DB override;
- timezone resolution hierarchy;
- IPC/trust boundary and sanitized renderer DTOs;
- failure isolation and expected restart behavior;
- troubleshooting for Bee unavailable/unauthenticated, partial history, realtime disconnect, empty provisional state, and restart-before-Sync;
- pointers to P4-R1A and P4-R1B live acceptance evidence.

### Non-goals and stop condition

No new product features, Electron UI behavior, persistence model, realtime architecture, IPC channels, CLI behavior, cloud/API/LLM/telemetry, tray/notifications/autostart, installer/updater/signing, or public npm publishing.

Production package/code changes are not authorized. If a genuine documentation-blocking product defect is discovered, STOP and escalate for a separate owner decision rather than silently fixing it in P4-R1C.

P4-R1C is not Phase 5. Phase 5 remains NOT DEFINED / NOT AUTHORIZED.

### Completion gate

P4-R1C becomes READY FOR REVIEW only when:

1. the contract and example README are internally consistent with merged P4-R1A/P4-R1B behavior;
2. acceptance evidence is linked without reproducing private Bee content;
3. screenshot handling follows the privacy rules above;
4. documentation-only scope is confirmed;
5. `docs/STATUS.md` records P4-R1C READY FOR REVIEW and P4-R1 remains IN PROGRESS pending independent audit/merge.

---

## Invariants (non-negotiable)

- Processed Bee history is the only authority for persistent `LoopThread` state.
- Realtime remains provisional and memory-only.
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
