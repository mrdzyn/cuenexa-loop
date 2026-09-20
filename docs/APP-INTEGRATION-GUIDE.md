# CueNexa Loop Application Integration Guide

## 1. Purpose and audience

This document is the canonical guide for integrating CueNexa Loop into external host applications.

It is written for:
- **Application developers** embedding CueNexa Loop into local desktop applications, Electron utilities, or personal workflow tools.
- **AI coding agents** tasked with designing, scaffolding, implementing, or reviewing a CueNexa Loop integration.
- **Reviewers and auditors** independently verifying that a host integration preserves CueNexa Loop's architectural and privacy invariants.
- **QA operators** conducting automated integration testing and live acceptance validation.

### Core architectural premise and package status

CueNexa Loop is a **local-first follow-through engine**, not a cloud service, transcript warehouse, or autonomous background daemon. It operates exclusively on the user's local machine under the user's authenticated Amazon Bee developer session.

> [!IMPORTANT]
> **Package Status Notice:** All packages in this repository (`@cuenexa-loop/contracts`, `@cuenexa-loop/bee-adapter`, `@cuenexa-loop/loop-engine`, `@cuenexa-loop/loop-store`, `@cuenexa-loop/cli`) are currently marked `"private": true`. They are workspace-exported packages intended for composition within this repository or through explicitly arranged local/source dependencies. They are **not** currently published to the public npm registry. Developers and AI agents must not assume `npm install @cuenexa-loop/...` works from public npm. Publishing or versioning a standalone public SDK is a future product/architecture decision requiring explicit human authorization.

The cardinal rule of all integrations is:
> **Processed Bee history is the only authority for persistent `LoopThread` state. Bee realtime is optional, ephemeral, provisional acceleration only.**

---

## 2. Integration principles

Every host integration must strictly adhere to these non-negotiable invariants:

1. **Processed Bee history is authoritative:** Persistent `LoopThread` state and history events may only be created, updated, or resolved from processed Bee conversation history reconciled via `@cuenexa-loop/loop-store`.
2. **Realtime is provisional acceleration only:** Ephemeral observations from the Bee realtime stream may surface provisional awareness, but must **never** directly create, mutate, reopen, resolve, or delete a persistent `LoopThread`.
3. **Resilience to realtime absence:** Host applications must remain fully functional using historical synchronization (`loops:sync` / `fetchCompleteDetectionSnapshot`) even if the realtime stream is disconnected, unsupported, or never started.
4. **Strict privacy minimization:** Never persist raw Bee transcripts, summaries, utterances, evidence text, realtime conversation UUIDs, precise geolocation coordinates, or authentication credentials.
5. **Privacy-safe presentation by default:** Default user interfaces, notifications, and logs must display structural metadata only (e.g., Loop title, state, due date, attention level). Private conversational excerpts require explicit user opt-in (`--include-content` equivalent) and must apply redaction prior to truncation.
6. **No identity guessing:** Never attempt to guess or heuristically bridge Bee realtime UUIDs and historical numeric IDs. Mappings are only valid when explicitly supplied together by Bee within a single payload, and must remain bounded and memory-only.
7. **No resolution by disappearance:** A loop or commitment disappearing from a subsequent snapshot or realtime window must **never** be inferred as resolved. Resolution requires explicit historical completion evidence.
8. **No unapproved network services:** Integrators must not wrap CueNexa Loop in an unauthenticated network server, background daemon, remote database, telemetry collector, or external LLM service unless explicitly approved by architectural review.
9. **Synthetic test fixtures only:** Automated tests must use synthetic mock fixtures exclusively. Real personal Bee transcripts must **never** be committed or executed in CI.

---

## 3. Repository and package map

CueNexa Loop is structured as an npm workspaces monorepo. Integrators must understand the distinct role and current exported surface of each package:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Host Application                              │
└────────────────┬───────────────────────────────────────┬────────────────┘
                 │ (authoritative sync)                  │ (realtime awareness)
                 ▼                                       ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│    @cuenexa-loop/bee-adapter    │     │    @cuenexa-loop/bee-adapter    │
│  fetchCompleteDetectionSnapshot │     │        subscribeRealtime        │
└────────────────┬────────────────┘     └────────────────┬────────────────┘
                 │ BeeSnapshot                           │ EphemeralRealtimeUtterance
                 ▼                                       ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│    @cuenexa-loop/loop-engine    │     │    @cuenexa-loop/loop-engine    │
│   detectLoopItems / correlate   │     │      ProvisionalAwareness       │
└────────────────┬────────────────┘     └────────────────┬────────────────┘
                 │ Loop[]                                │ ProvisionalSignal[]
                 ▼                                       ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│     @cuenexa-loop/loop-store    │     │    Host UI (PROVISIONAL only)   │
│       LoopStore.reconcile       │     │     ephemeral, memory-only      │
└────────────────┬────────────────┘     └─────────────────────────────────┘
                 │ LoopThread[], ReviewModel
                 ▼
┌─────────────────────────────────┐
│     Host UI (Authoritative)     │
│   Actionable Review & Ledger    │
└─────────────────────────────────┘
```

### 3.1 `@cuenexa-loop/contracts` (Workspace-Exported Library Surface)
- **Role:** Pure TypeScript types and runtime Zod schemas defining provider-independent domain models.
- **Exported APIs:**
  - Historical domain types: `LoopConversation`, `LoopFact`, `LoopTodo`, `Page<T>`, `NormalizationWarning`.
  - Ephemeral realtime types: `EphemeralRealtimeEvent`, `EphemeralRealtimeUtterance`, `EphemeralRealtimeConversationState`.
  - Schemas: `LoopConversationSchema`, `EphemeralRealtimeEventSchema`, `EphemeralRealtimeUtteranceSchema`, `EphemeralRealtimeConversationStateSchema`, etc.
- **Realtime Warnings:** Realtime transport warnings belong to `@cuenexa-loop/bee-adapter` as `BeeRealtimeWarning` (not `@cuenexa-loop/contracts`).
- **Surface:** Package-root exported surface (`"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`).

### 3.2 `@cuenexa-loop/bee-adapter` (Workspace-Exported Library Surface)
- **Role:** The only package in the repository with knowledge of Bee's wire format and CLI subprocess client.
- **Exported APIs:**
  - `BeeAdapterClient`: Primary client wrapper around official `@beeai/cli/lib`.
    - `ensureAuthenticated(): Promise<AuthenticationInfo>`: Validates active Bee authentication and returns `{ timeZone: string | null }`.
    - `listConversations(options?: ListPageOptions): Promise<Page<BeeConversation>>`.
    - `getConversation(id: string): Promise<BeeConversation | null>`.
    - `listFacts(options?: ListPageOptions): Promise<Page<BeeFact>>`.
    - `listTodos(options?: ListPageOptions): Promise<Page<BeeTodo>>`.
    - `subscribeRealtime(options?: BeeRealtimeSubscribeOptions): BeeRealtimeSubscription`: High-level subscription returning `{ events: AsyncIterable<EphemeralRealtimeEvent>, close(): void }`.
  - Snapshot fetchers:
    - `fetchBeeSnapshot(client)`: Lightweight single-page fetch (list records only, empty utterances). Used for connectivity checks.
    - `fetchDetectionSnapshot(client, options)`: Hydrates full conversation detail for first page.
    - `fetchCompleteDetectionSnapshot(client, options)`: Full, bounded pagination across all processable pages with hydration and deduplication. **This is the required authoritative synchronization entry point.**
  - Lower-level realtime helper and bridge:
    - `subscribeToBeeRealtime(client, options, identities)`: Package-root helper operating against the underlying Bee SSE client surface.
    - `BeeRealtimeWarning`, `BeeRealtimeWarningCode`: Warning models emitted during realtime stream decoding and SSE handling.
    - `BeeConversationIdentityBridge`: Bounded memory-only map between realtime UUIDs and historical numeric IDs.
  - Error classes: `BeeError`, `BeeCliUnavailableError`, `BeeAuthenticationError`, `BeeMalformedResponseError`, `classifyBeeError`.
- **Surface:** Package-root exported surface (`"main": "./dist/index.js"`).

### 3.3 `@cuenexa-loop/loop-engine` (Workspace-Exported Library Surface)
- **Role:** Pure, deterministic detection, correlation, and provisional awareness logic. Has no I/O, database, network, or Bee-specific dependency.
- **Exported APIs:**
  - Detection: `detectLoopItems(input: LoopDetectionInput): LoopDetectionResult` (where `LoopDetectionInput` accepts `{ conversations, facts, todos, now, timeZone }`).
  - Correlation: `correlateLoopItems(input: LoopCorrelationInput): LoopCorrelationResult` (where `LoopCorrelationInput` accepts `{ items, conversations, facts, todos, now, snapshot }`).
  - Primitives: `extractDeadline()`, `scoreCorrelationPair()`, `deriveLoopLifecycle()`, `deriveLoopTitle()`, `buildLoopTimeline()`.
  - Ephemeral Awareness:
    - `ProvisionalAwareness`: In-memory state machine for foreground realtime awareness.
    - `ingest(event: EphemeralRealtimeUtterance, timeZone: string): ProvisionalIngestResult` (returns `{ emitted, active }`).
    - `list(): ProvisionalSignal[]`.
    - `retireConversations(conversationIds: ReadonlySet<string>): number`: Retires provisional signals for conversations confirmed by authoritative processed history.
    - `resolveConversationIdentity(sessionId: string, conversationId: string): number`.
    - `pruneExpired(now: string): number`.
- **Surface:** Package-root exported surface (`"main": "./dist/index.js"`).

### 3.4 `@cuenexa-loop/loop-store` (Workspace-Exported Library Surface)
- **Role:** Local SQLite persistence using Node.js built-in `node:sqlite` (`DatabaseSync`). Manages schema v2 tables (`loop_threads`, `loop_events`, `loop_thread_user_state`, `loop_notification_deliveries`).
- **Exported APIs:**
  - `LoopStore`: Persistent local store.
    - `constructor(options?: { path?: string; retentionDays?: number })`.
    - `reconcile(input: ReconcileInput): ReconcileResult`: The core reconciliation engine. Reconciles authoritative snapshot Loops against existing threads, detects changes, manages retention, and records structural history events.
    - Inspection: `listThreads()`, `getThread(id)`, `listEvents(limit)`, `getThreadUserState(id)`, `listThreadUserStates()`.
    - User Actions: `acknowledgeThread(id, at)`, `snoozeThread(id, until, now)`, `unsnoozeThread(id, at)`, `pinThread(id, at)`, `unpinThread(id, at)`, `dismissThread(id, at)`, `restoreThread(id, at)`.
    - Notification Ledger: `listNotificationDeliveries(limit)`, `hasNotificationDelivery(threadId, type, triggerKey)`, `recordNotificationDeliveries(inputs, deliveredAt)`.
    - Retention: `purgeResolved(now): number`.
  - Review & Planning Primitives:
    - `buildReviewModel(threads, events, userStates, now): ReviewModel` (groups into `dueNow`, `needsAttention`, `waiting`, `snoozed`, `recentlyResolved`).
    - `rankAttention(threads, events, now): AttentionItem[]`.
    - `planNotifications(threads, events, userStates, deliveries, now): NotificationPlan`.
  - Helpers: `resolveLoopStorePath()`, `resolveRetentionDays()`.
- **Surface:** Package-root exported surface (`"main": "./dist/index.js"`). Requires Node.js >= 22 runtime.

### 3.5 `@cuenexa-loop/cli` (Internal Reference Application — NOT an Exported Library)
- **Role:** Command-line executable application, human inspection commands, console presenters, and reference orchestration runtime.
- **Package Status:** Marked `"private": true` with no `"main"` or `"exports"`. Exposes no public library entry points.
- **Reference Orchestration:**
  - CLI orchestration modules (such as `packages/cli/src/persistent-orchestration.ts`, `packages/cli/src/correlation-orchestration.ts`, `packages/cli/src/timezone.ts`, and `packages/cli/src/watch-runtime.ts`) serve as **reference implementations**.
  - Host applications must compose the four library packages (`contracts`, `bee-adapter`, `loop-engine`, `loop-store`) directly, rather than attempting deep imports into `@cuenexa-loop/cli`.

---

## 4. Supported integration model

Host applications integrate with CueNexa Loop through a dual-track model: an authoritative historical track and an optional provisional realtime track.

### 4.1 Authoritative Historical Track (Mandatory)

The authoritative track is the backbone of all persistent follow-through. It runs periodically, on host launch, or upon explicit refresh:

```typescript
import { BeeAdapterClient, fetchCompleteDetectionSnapshot } from "@cuenexa-loop/bee-adapter";
import { detectLoopItems, correlateLoopItems } from "@cuenexa-loop/loop-engine";
import { LoopStore, buildReviewModel } from "@cuenexa-loop/loop-store";

// Host-owned helper implementing the 3-tier timezone hierarchy without CLI imports:
function isValidTimeZone(candidate: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

function resolveHostTimezone(beeTimezone: string | null): string {
  const override = process.env.LOOP_TIMEZONE?.trim();
  if (override && isValidTimeZone(override)) {
    return override;
  }
  if (beeTimezone && isValidTimeZone(beeTimezone)) {
    return beeTimezone;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// 1. Authenticate and resolve timezone
const client = new BeeAdapterClient();
const auth = await client.ensureAuthenticated();
const timeZone = resolveHostTimezone(auth.timeZone);

// 2. Fetch full authoritative processed history
const completeSnapshot = await fetchCompleteDetectionSnapshot(client);
const now = new Date().toISOString();

// 3. Deterministic detection
const detection = detectLoopItems({
  conversations: completeSnapshot.snapshot.conversations,
  facts: completeSnapshot.snapshot.facts,
  todos: completeSnapshot.snapshot.todos,
  now,
  timeZone,
});

// 4. Deterministic cross-conversation correlation
const completeness =
  completeSnapshot.snapshot.warnings.length > 0 || detection.warnings.length > 0
    ? "partial"
    : "complete";

const correlation = correlateLoopItems({
  items: detection.items,
  conversations: completeSnapshot.snapshot.conversations,
  facts: completeSnapshot.snapshot.facts,
  todos: completeSnapshot.snapshot.todos,
  now,
  snapshot: { observedAt: now, completeness },
});

// 5. Reconcile with local SQLite persistent store
const complete =
  completeSnapshot.complete &&
  correlation.snapshot.completeness === "complete";

const store = new LoopStore();
const reconcileResult = store.reconcile({
  loops: correlation.loops,
  observedAt: now,
  complete,
});

// 6. Build actionable review model for Host UI
const reviewModel = buildReviewModel(
  store.listThreads(),
  store.listEvents(),
  store.listThreadUserStates(),
  now,
);
```

### 4.2 Provisional Realtime Track (Optional)

The realtime track provides fast, in-flight conversational awareness without durable persistence:

```typescript
import { BeeAdapterClient } from "@cuenexa-loop/bee-adapter";
import { ProvisionalAwareness } from "@cuenexa-loop/loop-engine";

const client = new BeeAdapterClient();
const provisionalAwareness = new ProvisionalAwareness();
const auth = await client.ensureAuthenticated();
const timeZone = resolveHostTimezone(auth.timeZone);

// Subscribe to Bee SSE stream via high-level client wrapper
const subscription = client.subscribeRealtime({
  onWarning: (warning) => console.warn("Realtime warning:", warning.code),
});

// Ingest incoming ephemeral utterances
for await (const event of subscription.events) {
  if (event.kind === "utterance") {
    const { emitted, active } = provisionalAwareness.ingest(event, timeZone);
    // Display provisional signals in host UI with explicit PROVISIONAL styling.
    // NEVER write these signals to SQLite or external durable storage.
  }
}

// When processed history confirms conversations, retire provisional state using detected conversation IDs:
const detectedConversationIds = new Set(
  detection.items
    .map((item) => item.source.conversationId)
    .filter((id): id is string => id !== null),
);
provisionalAwareness.retireConversations(detectedConversationIds);

// If Bee explicitly supplies a dual session/conversation identity mapping within a single payload:
// provisionalAwareness.resolveConversationIdentity(sessionId, conversationId);
```

---

## 5. Integration decision tree

Before designing an integration, identify the host application's execution environment.

```text
What is the host application runtime?
├── Node.js 22+ local application / CLI
│   └── Direct in-process composition of workspace-exported packages. (See Section 5.1)
├── Electron desktop application (Main Process)
│   └── Direct composition in Main Process; sanitized IPC to Renderer. (See Section 5.2)
├── Other desktop runtimes (macOS Swift, Tauri, Rust, Go)
│   └── STOP. No supported programmatic integration boundary exists. Architecture decision required. (See Section 5.3)
├── Browser-only web application
│   └── STOP. Cannot run Bee CLI subprocess or SQLite. Architecture decision required. (See Section 5.4)
├── Mobile application (iOS / Android)
│   └── STOP. Mobile sandboxes cannot run desktop Bee CLI. Architecture decision required. (See Section 5.5)
└── Multi-tenant cloud / remote server
    └── PROHIBITED. Violates CueNexa local-first privacy model. (See Section 5.6)
```

### 5.1 Node.js 22+ Local Application
- **Status:** Directly supported for in-process composition when packages are available in the workspace or linked locally.
- **Runtime requirements:** Node.js >= 22 (for built-in `node:sqlite`).

### 5.2 Electron Desktop Application
- **Status:** Supported via Main Process composition when packages are available locally.
- **Architecture:**
  - **Main Process (Node.js 22+):** Composes `BeeAdapterClient`, `LoopStore`, and `ProvisionalAwareness`. Manages Bee CLI subprocess and SQLite database file.
  - **Preload / IPC:** Exposes sanitized structural data (`ReviewModel`, `LoopThread[]`, ephemeral `ProvisionalSignal[]`) to Renderer.
  - **Renderer Process:** Renders UI controls (snooze, acknowledge, pin).
- **Rule:** Never invoke Bee CLI or access SQLite directly from the Renderer.

### 5.3 Other Desktop Runtimes (macOS Swift/AppKit, Tauri, Rust, Go)
- **Status:** **No supported structured integration boundary currently exists in the repository.**
- **Action:** **STOP and request an architectural decision from the human operator.**
- **Note:** Potential approaches (such as designing an IPC bridge, subprocess runner, or sidecar protocol) are speculative architectural options and must not be unilaterally implemented by AI agents without human authorization.

### 5.4 Browser-Only Web Applications
- **Status:** Unsupported directly.
- **Constraint:** Browsers lack access to local subprocess spawning (`bee` CLI) and the user's local filesystem (`node:sqlite`).
- **Action:** STOP. Do not attempt to transmit personal conversation data to a cloud backend. Propose an architectural decision to the human operator.

### 5.5 Mobile Applications (iOS / Android)
- **Status:** Unsupported directly.
- **Constraint:** The `@beeai/cli` tool is designed for desktop environments with user login sessions. Mobile sandboxing prevents running local desktop CLI subprocesses.
- **Action:** STOP. Do not fabricate an unapproved mobile sync protocol.

### 5.6 Multi-Tenant Cloud / Server Applications
- **Status:** Strictly prohibited.
- **Constraint:** CueNexa Loop is an individual-user, local-first system. Streaming personal conversations or storing conversational tokens on a shared remote server violates the CueNexa trust and privacy model.

---

## 6. AI-agent integration workflow

AI coding agents integrating CueNexa Loop into a host project must follow this exact step-by-step workflow:

1. **Read Core Contracts:** Read `AGENTS.md`, `docs/STATUS.md`, and this guide (`docs/APP-INTEGRATION-GUIDE.md`).
2. **Identify Host Runtime:** Confirm the host environment is Node.js 22+ capable (Category A or B). If Category C, D, E, or F, STOP and escalate.
3. **Inspect Actual Exports:** Verify that every imported symbol exists in the package root exports of `@cuenexa-loop/contracts`, `bee-adapter`, `loop-engine`, or `loop-store`.
4. **No Deep Imports:** Do not import from internal paths (e.g. `@cuenexa-loop/cli/src/...`).
5. **Establish Privacy Boundaries:** Ensure the host application never leaks transcripts, never persists provisional text, and contains no remote telemetry.
6. **Implement Authoritative Path First:** Build and verify historical synchronization (`fetchCompleteDetectionSnapshot` -> `detectLoopItems` -> `correlateLoopItems` -> `reconcile`) before touching realtime.
7. **Add Realtime Acceleration Second:** Implement ephemeral realtime awareness only after authoritative persistence is verified and tested.
8. **Add Synthetic Automated Tests:** Write unit and integration tests using synthetic fixtures covering normalization, detection, correlation, reconciliation, user state mutations, and continuity across restarts.
9. **Execute Repository Quality Gates:** Run `npm run typecheck`, `npm test`, `npm run build`, and `npm audit` from the root.
10. **Perform Live Acceptance Validation:** Guide human verification against live Bee using the reference acceptance procedure.
11. **Prepare Structured Handoff:** Submit the integration via a bounded branch and PR with full evidence.

---

## 7. Human setup prerequisites

Host developers must have the following environment prepared:

1. **Node.js:** Version 22.0.0 or higher (`node -v`). Required for native `node:sqlite`.
2. **Repository Build:** Clean workspace build:
   ```bash
   npm ci
   npm run build
   ```
3. **Bee Installation & Authentication:**
   - Bee desktop/mobile application installed.
   - Developer Mode enabled in Bee app.
   - Official `@beeai/cli` installed globally or available in PATH.
   - Active authenticated session confirmed:
     ```bash
     bee status
     ```
     Must report valid login status and account details.
4. **Timezone Configuration:**
   - CueNexa Loop resolves timezone from `LOOP_TIMEZONE` env variable, Bee account timezone, or system local timezone. Set `LOOP_TIMEZONE` (e.g. `export LOOP_TIMEZONE="America/Los_Angeles"`) if overriding is required.
5. **Credentials:**
   - CueNexa Loop does **not** manage or store API keys, secrets, or tokens. Authentication is managed solely by Bee CLI.

---

## 8. Reference CLI validation path

CueNexa Loop provides human validation commands and reference orchestration. Integrators can run these to verify expected behavior:

| Command | Role & Verification Purpose |
| --- | --- |
| `bee status` | Verifies Bee CLI installation and active authentication. |
| `npm run bee:check` | Validates lightweight Bee connectivity and fetches list metadata. |
| `npm run loops:check` | Validates Phase 1A detection by hydrating full conversation utterances and detecting LoopItems. |
| `npm run loops:correlate` | Validates Phase 1B cross-conversation deterministic correlation. |
| `npm run loops:sync` | Validates Phase 2 persistent reconciliation, writing structural threads to SQLite. |
| `npm run loops:today` | Lists open Loops due today or overdue. |
| `npm run loops:review` | Validates Phase 3 actionable review model (`dueNow`, `needsAttention`, `waiting`). |
| `npm run loops:ack <id>` | Acknowledges attention reasons on a thread. |
| `npm run loops:snooze <id>` | Snoozes attention on a thread until a specified duration. |
| `npm run loops:pin <id>` | Pins a thread to the top of attention review. |
| `npm run loops:dismiss <id>` | Dismisses a thread from normal review. |
| `npm run loops:restore <id>` | Restores a dismissed thread to active review. |
| `npm run loops:history` | Displays local SQLite structural audit events (`thread_created`, `due_date_changed`, etc.). |
| `npm run loops:notifications` | Shows deduplicated notification candidates derived from the review model. |
| `npm run loops:notify` | Simulates delivery of notification candidates, recording entries in the local ledger. |
| `npm run loops:watch` | Runs the reference Phase 4 foreground realtime watcher with live provisional detection and bounded refresh. |
| `npm run loops:realtime-demo` | Executes an end-to-end synthetic demonstration of provisional awareness without requiring live Bee. |

> [!NOTE]
> The CLI currently supports only `--include-content` (for opt-in redacted preview) and `--yes` (for reset confirmation). It does **not** provide a `--json` or NDJSON output mode. It is a human validation tool and behavioral reference, not a machine-readable IPC interface.

---

## 9. Automated integration testing

Host integrations must include automated test coverage using synthetic fixtures.

### 9.1 Mandatory Test Categories
- **Provider Normalization:** Test mapping from raw Bee shapes to `LoopConversation`, `LoopFact`, and `LoopTodo`.
- **Detection Invariants:** Verify that commitments, delegations, follow-ups, and deadlines are extracted accurately without hallucination.
- **Correlation Grouping:** Verify deterministic complete-link clustering across multi-conversation fixtures with fixed thresholds (0.90 threshold, complete-linkage clusters, continuation window).
- **Persistence & Reconciliation:** Verify that new loops create `LoopThread` rows, updated loops emit `due_date_changed` or `state_changed`, and existing threads preserve stable IDs.
- **Restart Continuity:** Verify that reconciling identical snapshots across store restarts produces `Changes recorded: 0` and preserves thread IDs.
- **Provisional Isolation:** Verify that provisional signals never write rows to SQLite tables (`loop_threads`, `loop_events`, `loop_thread_user_state`, `loop_notification_deliveries`).
- **Partial Snapshot Handling:** Verify that partial snapshots are marked `completeness: "partial"` and do not infer loop resolution.
- **Privacy Controls:** Verify that default serializers omit conversation text, and redaction is applied when content is displayed.

### 9.2 Injected Clocks
All time-dependent tests must inject fixed reference instants (`now = "2026-09-20T12:00:00.000Z"`) to eliminate wall-clock flakiness.

---

## 10. Human live acceptance procedure

Live acceptance testing exercises the integration against a real, authenticated Bee environment.

### 10.1 Historical-Only Acceptance Scenario (Minimum Viable Integration)
1. Confirm Bee login: `bee status`.
2. Record Conversation #1 in Bee with a clear spoken commitment (e.g., *"I will send the revised project roadmap tomorrow morning"*).
3. Wait for Bee to process Conversation #1 (use manual **Process now** in Bee app if needed).
4. Run authoritative sync in the host application.
5. Verify that the commitment appears as an authoritative `LoopItem` and is displayed in the host review UI.
6. Record Conversation #2 in Bee following up on the same work (e.g., *"Following up on the project roadmap, I sent the first draft"*).
7. Process Conversation #2 and trigger authoritative sync.
8. Verify that the two conversations correlate into a single stable `LoopThread` (e.g. `"Project Roadmap"`).
9. Restart the host application and repeat sync.
10. Confirm that thread IDs remain stable and no duplicate threads or change events are generated.

### 10.2 Realtime Acceptance Scenario (When Host Supports Realtime)
1. Start the host application with realtime monitoring enabled.
2. Verify that an initial authoritative sync completes before realtime connects.
3. Record a live Bee conversation.
4. Verify that the host UI displays a prominent **PROVISIONAL** awareness badge as phrases are spoken.
5. Verify that persistent storage contains **zero** durable records for the provisional item while recording.
6. Stop recording and allow Bee to process the conversation.
7. Trigger an authoritative historical refresh.
8. Confirm that the provisional badge disappears and is replaced by an authoritative `LoopThread`.
9. Restart the host application.
10. Verify that `Changes recorded: 0` is reported on restart, confirming persistent continuity.

*(Reference: See [`docs/audit/PHASE-4-LIVE-ACCEPTANCE-2026-09-20.md`](audit/PHASE-4-LIVE-ACCEPTANCE-2026-09-20.md) for recorded Phase 4 live acceptance evidence and observed terminal verification.)*

---

## 11. Integration acceptance checklist

Use this checklist during PR review and independent auditing:

- [ ] **Host Runtime Identified:** Host execution model verified as Node.js 22+ compatible (Category A or B).
- [ ] **Real Exports Only:** Integration imports only from documented package root exports; no deep imports into `@cuenexa-loop/cli` or internal directories.
- [ ] **Historical Authority Intact:** Processed history is the sole trigger for durable database persistence.
- [ ] **Realtime Failure-Safe:** Host remains completely functional if realtime stream disconnects or fails.
- [ ] **Provisional State Ephemeral:** Ephemeral signals exist in memory only; zero writes to SQLite tables from realtime events.
- [ ] **No Raw Transcripts Stored:** No conversation text, transcripts, summaries, or evidence stored in persistent database.
- [ ] **No ID Guessing:** No heuristic mapping between realtime UUIDs and historical numeric IDs.
- [ ] **No Resolution from Absence:** Items not present in subsequent snapshots remain open unless explicitly resolved.
- [ ] **Degraded State Handled:** Incomplete or partial snapshots are clearly flagged in host UI.
- [ ] **Restart Continuity Verified:** Restarting host produces `Changes recorded: 0` when snapshot is unchanged.
- [ ] **Privacy-Safe UI:** Default views display structural titles and dates; conversation previews are opt-in and redacted.
- [ ] **Quality Gates Green:** `npm run typecheck`, `npm test`, `npm run build`, `npm audit` pass cleanly.
- [ ] **Automated Tests Synthetic:** All automated unit/integration tests use synthetic fixtures.
- [ ] **Live Acceptance Conducted:** Human QA executed against live Bee before final release.

---

## 12. Troubleshooting guide

### 12.1 Bee Processing Latency
- **Symptom:** Spoken conversation ended, but historical sync does not detect the loop.
- **Cause:** Bee processed conversation history may not become available immediately after recording. Conversations are not queryable via `conversations.list()` until processing completes.
- **Solution:** Wait until Bee has processed the conversation. During live testing, manual **Process now** in the Bee app may sometimes be required before new processed history becomes available.

### 12.2 Realtime Disconnections
- **Symptom:** SSE stream drops with connection error.
- **Cause:** Network interruption, sleep/wake cycle, or Bee CLI subprocess restart.
- **Solution:** Treat realtime as lossy/at-most-once. The host should attempt bounded reconnect with backoff, and run a historical sync upon reconnect to repair any missed events.

### 12.3 Unsupported Realtime Events
- **Symptom:** Console logs `Realtime event ignored: unsupported_event`.
- **Cause:** The incoming realtime payload did not normalize to one of CueNexa Loop’s supported realtime event shapes.
- **Solution:** Safely ignore. Non-utterance events do not compromise provisional awareness.

### 12.4 SQLite Lock Errors
- **Symptom:** `LoopStoreError: database is locked`.
- **Cause:** Two processes attempting concurrent write transactions against `~/.cuenexa-loop/cuenexa-loop.sqlite`.
- **Solution:** CueNexa Loop is designed for single-process write access. In Electron apps, confine `LoopStore` to the Main Process. Set `CUENEXA_LOOP_DB_PATH` to isolate test databases.

---

## 13. Date and time handling

CueNexa Loop provides deterministic date/time parsing for conversational phrases ("today", "tomorrow", "next Monday at 3pm").

### Timezone Resolution Hierarchy
When parsing dates, timezone is resolved in this order:
1. `LOOP_TIMEZONE` environment variable (if valid IANA identifier, e.g. `"America/New_York"`).
2. Bee account timezone (`(await client.ensureAuthenticated()).timeZone`).
3. Host system timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).

Host applications should ensure the resolved timezone matches the user's expectations. Never default to UTC.

### Known Finding: Spoken Time Fidelity
As documented in [`docs/audit/PHASE-4-LIVE-ACCEPTANCE-2026-09-20.md`](audit/PHASE-4-LIVE-ACCEPTANCE-2026-09-20.md), spoken time-of-day phrases (e.g. `"September 23 at 3 PM"`) may be normalized by Bee into abbreviated transcript text (e.g. `"September 23 at 3 p."`), which can cause downstream date parsers to record midnight UTC (`00:00:00.000Z`) rather than 15:00:00. Host applications should test spoken date/time fidelity end-to-end.

---

## 14. Privacy and security checklist for host applications

Host applications inherit the trust model defined in `docs/PRIVACY.md` and `docs/SECURITY.md`.

- [ ] **Local Storage Path:** Store SQLite database in user-private storage (`~/.cuenexa-loop/cuenexa-loop.sqlite` with `0700` directory permissions).
- [ ] **No Content in Logs:** Never log raw Bee event payloads, conversation transcriptions, or utterance strings.
- [ ] **No Cloud Analytics on Loops:** Do not attach Loop titles, member summaries, or user action history to external telemetry services.
- [ ] **IPC Boundary Security:** In Electron architectures, sanitize IPC messages. Renderers must receive only structural data.
- [ ] **Subprocess Isolation:** Execute Bee CLI without shell interpolation (`child_process.spawn` with array arguments, never `child_process.exec` with raw string concatenation).
- [ ] **Redaction Before Truncation:** If a host UI offers an opt-in content preview, run sensitive data redaction (emails, phone numbers, credentials) before truncating text.

---

## 15. What an AI agent must never do

When assisting a developer with CueNexa Loop integration, an AI agent must **NEVER**:

1. **Never invent imaginary APIs:** Do not fabricate methods like `client.checkAuthentication()`, `provisionalAwareness.clear()`, or `loopStore.sync()`. Use only verified package root exports.
2. **Never import CLI internals:** Do not write `import { ... } from "@cuenexa-loop/cli/src/..."` in host applications.
3. **Never persist provisional realtime data:** Do not insert realtime events into SQLite or local caches.
4. **Never bypass processed history:** Do not create a `LoopThread` directly from realtime utterances.
5. **Never guess conversation mappings:** Do not match realtime UUIDs to numeric IDs with string distance or heuristics.
6. **Never create a network daemon or sidecar protocol without approval:** Do not wrap CueNexa Loop in an unauthenticated HTTP server or invent an NDJSON protocol without explicit human authorization.
7. **Never introduce external LLMs:** Do not add OpenAI, Anthropic, or external model API calls into the loop detection/correlation pipeline.
8. **Never transmit Bee data to cloud backends:** Do not upload transcripts or normalized loop data to remote servers.
9. **Never use real personal data in tests:** Synthetic test fixtures are strictly required.
10. **Never declare integration complete without testing restart continuity:** Always verify that restarting the host produces `Changes recorded: 0` on an unchanged snapshot.
11. **Never assume packages are published to public npm:** All packages are private workspace packages.
12. **Never invent Phase 5 scope:** Keep work bounded to the existing Phase 0–4 architecture.

---

## 16. Example agent handoff

AI agents completing integration tasks should use this structured handoff template:

```text
Host application: [Name and repository path of host app]
Runtime: [e.g., Node.js 22 desktop application / Electron Main Process]
Integration surface: [Direct in-process composition of workspace-exported packages]
CueNexa packages used:
- @cuenexa-loop/contracts
- @cuenexa-loop/bee-adapter
- @cuenexa-loop/loop-engine
- @cuenexa-loop/loop-store
Historical authority path: [fetchCompleteDetectionSnapshot -> detectLoopItems -> correlateLoopItems -> LoopStore.reconcile]
Realtime path: [BeeAdapterClient.subscribeRealtime -> ProvisionalAwareness (memory-only)]
Persistence: [Local SQLite at ~/.cuenexa-loop/cuenexa-loop.sqlite via loop-store]
Privacy boundary: [Zero transcripts persisted; structural UI by default; IPC sanitized]
Tests added: [Unit tests covering normalization, detection, correlation, and restart continuity]
Quality gates: [npm run typecheck, npm test, npm run build, npm audit all passed]
Live acceptance: [Manual Bee acceptance verified with loops:sync and loops:watch]
Known limitations: [e.g. Spoken time fidelity under investigation]
PR: [PR URL or branch name]
Exact head SHA: [Full 40-character SHA]
Recommended next step: [Independent audit of PR head]
```
