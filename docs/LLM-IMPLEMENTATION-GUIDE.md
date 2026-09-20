# CueNexa Loop — LLM Implementation Guide

> **Start here if you are an LLM, coding agent, or new contributor who needs to understand, reproduce, extend, or audit CueNexa Loop quickly.**
>
> This document is the canonical orientation guide. It explains the product contract, architectural boundaries, implementation order, critical invariants, and acceptance path. It intentionally points to the deeper design documents instead of duplicating every algorithmic detail.

## 1. What CueNexa Loop is

CueNexa Loop is an open-source, local-first follow-through system powered by Bee.

Bee captures and processes conversations. CueNexa Loop answers a different question:

> **What still needs to happen?**

It detects unfinished conversational work such as commitments, follow-ups, delegations, deadlines, open questions, and decisions that lead to actions. It can correlate strongly related work across multiple conversations, persist a privacy-minimized structural thread locally, surface what deserves attention, and show conservative provisional signals while a Bee conversation is still happening.

CueNexa Loop is **not** a transcript viewer, generic meeting summarizer, cloud task service, or LLM-first assistant.

## 2. The architecture in one picture

```text
                   AUTHORITATIVE PATH

Apple Watch / Bee device
        ↓
       Bee
        ↓
Authenticated Bee CLI environment
        ↓
@beeai/cli/lib
        ↓
Bee Adapter
        ↓
Normalized CueNexa contracts
        ↓
Deterministic LoopItem detection
        ↓
Deterministic cross-conversation correlation
        ↓
Snapshot Loops
        ↓
Local reconciliation
        ↓
Persistent LoopThreads in SQLite
        ↓
Attention / review / user actions / notifications


                   PROVISIONAL PATH

Bee realtime stream
        ↓
Normalized ephemeral realtime events
        ↓
Conservative provisional awareness
        ↓
PROVISIONAL foreground presentation
        ↓
Authoritative historical refresh
        ↓
Rejoins the authoritative path above
```

The architectural rule that matters most is:

> **Processed Bee history is authoritative. Realtime is only an acceleration layer.**

Realtime data must never directly create, resolve, reopen, delete, or otherwise mutate a persistent `LoopThread`.

## 3. Non-negotiable invariants

Any implementation or extension must preserve these rules.

### 3.1 Authority

- Processed Bee history is the only authority for persistent state.
- Realtime observations are provisional and memory-only.
- Missing realtime events must not corrupt persistent state.
- A realtime disconnect is an observation gap, never evidence that a conversation or Loop is complete.

### 3.2 Privacy

- Default CLI output is structural only.
- Human-readable source content is shown only after explicit `--include-content` opt-in.
- Content shown in opt-in mode must be redacted before truncation/presentation.
- SQLite must not contain raw Bee transcripts, summaries, utterances, evidence text, precise location, raw anchors, credentials, or raw realtime payloads.
- Realtime conversation UUIDs and provisional content remain process-memory only.

### 3.3 Determinism

- Core Loop detection and correlation are deterministic heuristics, not LLM inference.
- The same authoritative input should produce the same structural result.
- Correlation must prefer precision over recall.
- Ambiguous continuity must produce a new local thread rather than a guessed merge.

### 3.4 Failure behavior

- Never let a degraded or partial result look identical to a complete result.
- Complete bounded historical pagination must finish before absence has authoritative meaning.
- Never infer resolution merely because an item disappeared from a later snapshot.
- Malformed individual fields may degrade with warnings; failures that invalidate snapshot authority must remain visible as partial/incomplete results.

### 3.5 Scope

The current project has no cloud backend, no telemetry, no analytics, no Bee writeback, no background daemon, and no external LLM dependency in the core pipeline.

Do not add any of those casually. They change the trust model and require an explicit architectural decision.

## 4. Technology baseline

- Node.js 22+
- TypeScript
- npm Workspaces
- `@beeai/cli`
- Zod
- built-in `node:sqlite`
- Vitest
- GitHub Actions

Root package scripts are the operational contract. See [`package.json`](../package.json).

## 5. Repository responsibilities

The repository is an npm-workspaces monorepo.

### `packages/contracts`

Owns provider-independent CueNexa domain contracts and Zod schemas.

Examples include:

- normalized Bee-derived conversations, facts, and todos;
- pages/cursors;
- Loop detection/correlation structures;
- clearly named ephemeral realtime events.

**Rule:** Bee wire-format details must not leak into higher packages.

### `packages/bee-adapter`

The only package allowed to know Bee response and event shapes.

Responsibilities:

- use the official `@beeai/cli/lib` client;
- authenticate through the existing Bee CLI session;
- list/hydrate conversations;
- list facts and todos;
- normalize Bee data into CueNexa contracts;
- expose the supported realtime stream;
- surface normalization/source warnings;
- bridge realtime UUIDs to historical numeric IDs only when Bee explicitly provides both.

See [`BEE_INTEGRATION.md`](BEE_INTEGRATION.md).

### `packages/loop-engine`

Owns deterministic intelligence.

Responsibilities include:

- LoopItem detection;
- deadline/date interpretation;
- semantic deduplication;
- anchor extraction;
- correlation eligibility and scoring;
- complete-link grouping;
- timeline/lifecycle derivation;
- provisional realtime awareness.

It should remain independent of Bee wire formats, network calls, SQLite, and external LLMs.

See [`LOOP-DETECTION.md`](LOOP-DETECTION.md) and [`LOOP-CORRELATION.md`](LOOP-CORRELATION.md).

### `packages/loop-store`

Owns persistent local follow-through state.

Responsibilities include:

- SQLite schema/migrations;
- stable `LoopThread` identity;
- conservative snapshot reconciliation;
- structural history events;
- local user state;
- deterministic attention;
- review policy;
- notification deduplication and retention.

It stores privacy-minimized derived state, not Bee records.

See [`LOOP-PERSISTENCE.md`](LOOP-PERSISTENCE.md) and [`PROACTIVE-FOLLOW-THROUGH.md`](PROACTIVE-FOLLOW-THROUGH.md).

### `packages/cli`

Composition root and user-facing local interface.

Responsibilities include:

- wiring Bee adapter → engine → store;
- privacy-safe presenters;
- synchronization/review/action commands;
- foreground realtime orchestration;
- deterministic demo flows.

## 6. Bee integration contract

Use the official library:

```ts
import { createBeeClient } from "@beeai/cli/lib";

const bee = createBeeClient();
```

The current integration uses these capabilities:

```ts
await bee.auth.getProfile();
await bee.api.conversations.list();
await bee.api.conversations.get(id);
await bee.api.facts.list();
await bee.api.todos.list();
bee.sse.streamJson({ types, signal });
```

CueNexa Loop never reads or stores Bee credentials. Authentication stays with Bee CLI.

### Important Bee-specific behavior

The library strongly defines the call surface but does not provide a canonical strongly typed response schema for every payload. Keep Bee raw types defensive and normalize at the adapter boundary.

For `@beeai/cli` 0.7.3 realtime:

- `streamJson().events[].data` is parsed SSE `data:` JSON;
- transport-level SSE `event:` and `id:` metadata are not preserved in that returned object;
- supported CueNexa payloads are structurally discriminated from documented forms such as `{ utterance, conversation_uuid }` and `{ conversation }`;
- do not invent a top-level `event`, `type`, or provider event ID.

Realtime `conversation_uuid` and processed-history numeric conversation `id` are different namespaces. Maintain only a bounded in-memory mapping when a Bee payload explicitly proves the pair. Never infer the mapping from text, timestamps, similarity, or order.

## 7. Implementation order

If rebuilding CueNexa Loop from an empty repository, implement in this order. Each phase depends on the invariants of the earlier phases.

### Phase 0 — Foundation

Goal: establish a trusted Bee boundary.

Implement:

1. workspace/TypeScript structure;
2. provider-independent contracts;
3. Bee adapter using `@beeai/cli/lib`;
4. defensive normalization plus Zod validation;
5. structural-only connectivity CLI;
6. explicit redacted `--include-content` mode;
7. privacy/security documentation and synthetic fixtures.

Acceptance:

- `bee:check` works against an authenticated Bee session;
- default mode prints counts/status only;
- malformed fields are visible as warnings;
- tests never require real personal Bee data.

### Phase 1A — LoopItem detection

Goal: answer **“What unfinished work exists in this snapshot?”**

Supported LoopItem families include:

- commitment;
- decision;
- delegation;
- follow-up;
- open question.

Dates/deadlines should resolve using this precedence:

1. explicit `LOOP_TIMEZONE` override;
2. Bee account timezone when available;
3. local system timezone.

Do not default calendar phrases to UTC.

Deduplication must distinguish a restatement of the same action from different actions that share boilerplate wording. Preserve regression cases for both true-positive and false-positive similarity.

Acceptance:

- `loops:check` hydrates full conversation detail;
- source incompleteness becomes visible as `PARTIAL` rather than silently succeeding;
- evidence/provenance are retained in memory for detection while default presentation remains structural.

### Phase 1B — Deterministic cross-conversation correlation

Goal: answer **“Which detected items belong to the same ongoing piece of work?”**

Key rules:

- correlation is not deduplication;
- a Loop requires at least two items from at least two distinct conversation IDs;
- at least one member must be actionable;
- `open_question` is excluded from cross-conversation grouping;
- action↔action relationships are allowed;
- decision→action relationships require strong semantics and decision chronology;
- correlation requires strong shared anchors and a high confidence threshold;
- current threshold is `>= 0.90`;
- grouping is complete-link, not transitive chaining;
- timeline ordering prefers utterance `spokenAt`, then conversation end, then start, then deterministic tie-breaks;
- lifecycle is derived from the member snapshot, not stored as an independent truth.

See [`LOOP-CORRELATION.md`](LOOP-CORRELATION.md) before modifying scores or grouping semantics.

### Phase 2 — Persistent local follow-through

Goal: answer **“What changed since last time, and what deserves attention now?”**

Introduce a persistent `LoopThread` identity that is intentionally different from a snapshot `Loop.id`.

Continuity strategy:

1. prefer exact known snapshot continuity;
2. otherwise use conservative strong stable-member overlap;
3. if multiple candidates are plausible, do not merge;
4. never match by title alone.

Persist only privacy-minimized structural information.

Structural history events include concepts such as:

- `thread_created`;
- `member_added`;
- `state_changed`;
- `due_date_changed`;
- `reopened`;
- `resolved`;
- `new_activity`.

Absence from a snapshot must never by itself resolve a thread.

Attention should remain deterministic, prioritizing urgent due/overdue work before recent activity and lower-priority stale/waiting cases.

### Phase 3 — Proactive follow-through

Goal: answer **“What should I do about it?”**

Keep source lifecycle separate from local user state.

Local user state includes:

- acknowledged;
- snoozed-until;
- pinned;
- dismissed;
- restored/cleared variants.

These actions do **not** mutate Bee or source lifecycle.

Preserve the precedence model:

1. resolved threads are excluded from active attention;
2. snooze hides normal attention;
3. urgent due/overdue signals can bypass dismissal;
4. pin can bypass dismissal but not snooze;
5. newer meaningful source activity invalidates an old dismissal;
6. acknowledgement suppresses already-reviewed recent-change reasons but does not suppress deadlines/staleness/waiting;
7. normal attention policy applies last.

Review output groups work into human-actionable sections such as due now, needs attention, waiting, snoozed, and recently resolved.

Notification planning is deterministic and deduplicated structurally. Previewing notifications must not record delivery; delivery commands may record the dedupe key.

### Phase 4 — Ambient realtime awareness

Goal: answer **“Can CueNexa notice it while the conversation is happening?”**

Realtime is a foreground acceleration layer around the existing system, not a second authority.

The runtime must:

- subscribe through the official Bee realtime API;
- normalize ephemeral events;
- render conservative `PROVISIONAL` awareness;
- keep raw/provisional content out of SQLite;
- periodically or conditionally request the existing authoritative historical refresh path;
- coalesce refresh hints that arrive during cooldown or an in-flight refresh instead of silently dropping them;
- recover from possible realtime gaps using historical sync;
- preserve already proven process-local UUID↔historical-ID mappings across reconnects in that same process only.

`loops:watch` currently uses a sequential event pump plus an independent periodic control ticker. Do not reintroduce repeated `Promise.race()` listeners against one unresolved `iterator.next()`; that previously created an unbounded reaction-retention problem during long periods of silence.

Authoritative refreshes are rate-limited; realtime reconnect attempts use bounded backoff. Read [`AMBIENT-REALTIME-AWARENESS.md`](AMBIENT-REALTIME-AWARENESS.md) before changing orchestration behavior.

## 8. Commands an implementation must support

The current root scripts include:

```bash
npm run build
npm run typecheck
npm test

npm run bee:check
npm run loops:check
npm run loops:correlate
npm run loops:sync
npm run loops:today
npm run loops:review
npm run loops:ack -- <thread-id>
npm run loops:snooze -- <thread-id> --for 2h
npm run loops:unsnooze -- <thread-id>
npm run loops:pin -- <thread-id>
npm run loops:unpin -- <thread-id>
npm run loops:dismiss -- <thread-id>
npm run loops:restore -- <thread-id>
npm run loops:notifications
npm run loops:notify
npm run loops:history
npm run loops:reset -- --yes
npm run loops:demo
npm run loops:watch
npm run loops:realtime-demo
```

Treat [`package.json`](../package.json) as the canonical list if this guide and the scripts ever drift.

## 9. Build and test gates

For any material change, run:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Tests must use synthetic fixtures only. CI must not require access to a real Bee account.

Live acceptance is separate and manual because it uses the developer's authenticated Bee session.

Recommended live acceptance sequence:

```bash
bee status
npm run bee:check
npm run loops:check
npm run loops:correlate
npm run loops:sync
npm run loops:review
npm run loops:watch
```

When validating Phase 4, exercise the full handoff:

1. start `loops:watch`;
2. create a real conversation containing an obvious commitment/follow-up;
3. observe a `PROVISIONAL` signal if the supported realtime event arrives;
4. allow Bee to process the conversation;
5. run/allow the authoritative refresh;
6. verify the persistent result comes only from processed history;
7. verify provisional state disappears or is superseded without directly mutating SQLite.

Bee processing can take time. During development a manual Bee processing action may be needed before processed history becomes available. Never interpret temporary absence from processed history as resolution.

## 10. Privacy checklist for every change

Before merging a feature, ask:

- Does this write raw Bee content to disk?
- Does it write a realtime UUID to persistent storage?
- Does default output expose source content?
- Is redaction performed before truncation/presentation?
- Could a warning/fallback look like a complete authoritative result?
- Does this create a second path around the Bee adapter?
- Does it weaken the processed-history authority boundary?
- Does it introduce cloud/telemetry/LLM/writeback behavior without an explicit design decision?

If any answer is unsafe or ambiguous, stop and resolve the architecture first.

## 11. Recommended reading order for an LLM or coding agent

Read these files in this order:

1. **This file** — `docs/LLM-IMPLEMENTATION-GUIDE.md`
2. [`README.md`](../README.md) — commands, current project status, repository map
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — system boundaries and flows
4. [`BEE_INTEGRATION.md`](BEE_INTEGRATION.md) — exact Bee behavior and adapter contract
5. [`PRIVACY.md`](PRIVACY.md) and [`SECURITY.md`](SECURITY.md) — non-negotiable trust boundaries
6. [`LOOP-DETECTION.md`](LOOP-DETECTION.md) — Phase 1A semantics
7. [`LOOP-CORRELATION.md`](LOOP-CORRELATION.md) — Phase 1B scoring/grouping
8. [`LOOP-PERSISTENCE.md`](LOOP-PERSISTENCE.md) — Phase 2 continuity and local storage
9. [`PROACTIVE-FOLLOW-THROUGH.md`](PROACTIVE-FOLLOW-THROUGH.md) — Phase 3 user-state/attention rules
10. [`AMBIENT-REALTIME-AWARENESS.md`](AMBIENT-REALTIME-AWARENESS.md) — Phase 4 realtime contract
11. [`APP-INTEGRATION-GUIDE.md`](APP-INTEGRATION-GUIDE.md) — host application integration, programmatic boundaries, and testing guide
12. [`FRICTION-LOG.md`](FRICTION-LOG.md) and [`DEVPOST-FRICTION-LOG.md`](DEVPOST-FRICTION-LOG.md) — problems already discovered; do not repeat them
13. Tests nearest the code you intend to modify

Then inspect the implementation. Documentation establishes intent; tests establish expected behavior; current source establishes actual behavior. If they disagree, do not silently choose one — identify the drift and repair it explicitly.

## 12. Prompt template for a coding agent

Use this when handing CueNexa Loop to an implementation agent:

```text
You are working on the CueNexa Loop repository.

Before changing code, read docs/LLM-IMPLEMENTATION-GUIDE.md, then follow its required reading order for the subsystem you will touch.

Preserve these invariants:
- processed Bee history is the only authority for persistent LoopThread state;
- Bee realtime data is provisional, bounded, memory-only, and may never directly mutate persistent state;
- raw Bee transcripts, summaries, utterances, evidence, precise location, credentials, raw anchors, and realtime UUIDs may not be persisted;
- default CLI output remains structural and content-free;
- core detection/correlation remains deterministic and provider-independent above the Bee adapter;
- never infer resolution from disappearance;
- never guess realtime UUID↔historical ID mappings;
- partial/degraded snapshots must remain visibly partial;
- do not add cloud services, telemetry, Bee writeback, a background daemon, or an external LLM unless the task explicitly changes the architecture.

First inspect the relevant source and tests. State the exact files you intend to change and why. Implement the smallest coherent change. Add regression tests for every fixed bug or changed invariant. Run npm run typecheck, npm test, npm run build, and npm audit. Report commands/results, changed files, residual risks, and any manual Bee acceptance still required.
```

## 13. What “implemented correctly” means

A clean implementation is not merely one that compiles.

It must preserve this product contract:

- Bee remains the source of conversation data.
- CueNexa owns normalized contracts and follow-through semantics.
- Deterministic detection finds unfinished work.
- Conservative correlation connects only high-confidence cross-conversation work.
- SQLite remembers privacy-minimized structural continuity, not conversations.
- User controls affect local attention, not Bee truth.
- Realtime makes CueNexa faster, never more authoritative.
- Failures remain visible.
- Privacy is an architectural boundary, not a presentation option.

That is CueNexa Loop.

## 14. Host application integration

When integrating or embedding CueNexa Loop into external applications (Electron apps, menu bar utilities, local desktop tools), consult [`docs/APP-INTEGRATION-GUIDE.md`](APP-INTEGRATION-GUIDE.md).

It defines:
- package export stability and programmatic surfaces;
- runtime decision tree and architectural stop conditions;
- the mandatory authoritative-first integration path;
- testing requirements using synthetic fixtures;
- security and privacy rules for host applications.
