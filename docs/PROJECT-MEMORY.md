# CueNexa Loop — Project Memory

> **Purpose:** Durable project knowledge that should survive chat/thread changes, archived conversations, and agent handoffs.
>
> This file stores **stable context**: locked product choices, architecture decisions, important lessons, integration constraints, launch decisions, and other facts worth carrying across future work.
>
> It is **not** a chat transcript, changelog, backlog, or replacement for `docs/STATUS.md`.
>
> **Source-of-truth rule:** When this file conflicts with the current repository, locked design documents, tests, or `docs/STATUS.md`, verify the repository and update this file. Never preserve stale memory merely because it was written here.

**Last curated:** 2026-09-20  
**Repository:** `mrdzyn/cuenexa-loop`

## 1. How humans and AI agents should use this file

Read this document near the beginning of a **fresh or low-context CueNexa Loop session**, or whenever architecture, product, integration, release, launch, or historical rationale matters. It is intentionally **not required for every bounded coding task**, so routine agents do not spend tokens reloading durable context they do not need.

When the user says:

> **Update the project memory and status docs from this chat**

the assigned agent must:

1. read `AGENTS.md`, this file, and `docs/STATUS.md`;
2. inspect the actual repository state relevant to the discussion;
3. extract only **durable** decisions/knowledge from the current chat;
4. update this file only with information worth carrying into future chats;
5. update `docs/STATUS.md` only with current state, active work, blockers, and next authorized action;
6. do **not** treat model memory, an old chat summary, or an agent report as authoritative when repository evidence exists;
7. preserve canonical detail in architecture/design/audit documents and link to them rather than duplicating large histories here;
8. use the repository branch/PR workflow unless the user explicitly authorizes a direct documentation update.

The intended handoff model is:

```text
current chat / work session
        ↓
verified decisions and durable lessons
        ↓
docs/PROJECT-MEMORY.md
        +
current operational state
        ↓
docs/STATUS.md
        ↓
future chat / human / AI agent reads repository first
```

## 2. Product identity and locked product choices

CueNexa Loop is a **local-first follow-through engine powered by Bee**. Its purpose is to identify unfinished commitments and related follow-through across conversations while minimizing retained personal content.

Locked product/technical choices:

- processed Bee history is authoritative;
- realtime Bee data is optional provisional acceleration only;
- core detection and correlation are deterministic;
- persistence is local SQLite structural state;
- no external LLM is required by the core pipeline;
- no cloud backend, telemetry, analytics, Bee writeback, or background daemon is part of the approved architecture;
- privacy minimization is an architectural boundary, not only a UI choice;
- the repository is public and MIT licensed;
- current CueNexa packages are private npm-workspace packages rather than published public npm packages.

## 3. Durable architecture decisions

The stable architecture flow is:

```text
Bee processed history
  ↓
Bee adapter normalization
  ↓
LoopItem detection
  ↓
deterministic cross-conversation correlation
  ↓
local LoopThread reconciliation
  ↓
review / attention / local user actions / notification planning
```

Optional realtime awareness is layered beside, not inside, persistent authority:

```text
Bee realtime
  ↓
normalized ephemeral events
  ↓
ProvisionalAwareness
  ↓
PROVISIONAL presentation only
  ↓
authoritative processed-history refresh
  ↓
normal historical pipeline
```

Non-negotiable consequences:

- realtime must never directly create, resolve, reopen, delete, or mutate persistent `LoopThread` state;
- disappearance from a later snapshot never means resolved;
- realtime UUID ↔ historical numeric-ID mappings must never be guessed;
- only mappings explicitly supplied together by Bee may be used, and those mappings remain bounded/memory-only;
- partial/degraded snapshots must remain visibly partial/degraded;
- raw transcripts, summaries, utterances, evidence, precise location, credentials, raw anchors, and provisional content are not persisted;
- default output stays structural/content-free;
- opt-in content preview must redact before truncation;
- automated tests use synthetic data only.

Canonical detail lives in:

- `docs/ARCHITECTURE.md`
- `docs/BEE_INTEGRATION.md`
- `docs/LOOP-DETECTION.md`
- `docs/LOOP-CORRELATION.md`
- `docs/LOOP-PERSISTENCE.md`
- `docs/PROACTIVE-FOLLOW-THROUGH.md`
- `docs/AMBIENT-REALTIME-AWARENESS.md`
- `docs/PRIVACY.md`
- `docs/SECURITY.md`

## 4. Phase history worth carrying forward

Phases 0 through 4 are complete.

Durable milestone meaning:

- **Phase 0:** Bee connectivity, normalization, privacy-safe foundation.
- **Phase 1A:** deterministic LoopItem detection.
- **Phase 1B:** deterministic cross-conversation correlation.
- **Phase 2:** local persistent follow-through and stable `LoopThread` continuity.
- **Phase 3:** user actions, review/attention behavior, and notification planning/deduplication.
- **Phase 4:** foreground ambient realtime awareness with authoritative historical handoff.

Phase 4 live Bee acceptance passed on 2026-09-20. The verified evidence chain was:

```text
real Bee conversation
→ provisional memory-only awareness
→ Bee processed history
→ authoritative detection
→ deterministic correlation
→ persistent LoopThread reconciliation
→ restart continuity with no duplicate changes
```

Detailed evidence belongs in:

`docs/audit/PHASE-4-LIVE-ACCEPTANCE-2026-09-20.md`

**Phase 5 is not defined or authorized.** Future agents must not invent it.

## 5. Important Bee integration lessons

Durable observed constraints and lessons:

- processed Bee conversation history may become available after a delay;
- during live testing, manual **Process now** may sometimes be needed before new processed history appears;
- realtime `conversation_uuid` and processed-history numeric conversation `id` use separate namespaces;
- CueNexa only connects those identities when Bee explicitly supplies both identifiers;
- `@beeai/cli` 0.7.3 `streamJson()` exposes parsed JSON data but not the original SSE `event:` / `id:` metadata;
- realtime is treated as lossy/at-most-once, so historical refresh must repair gaps;
- unsupported realtime payloads may be ignored safely; processed history remains authoritative.

Do not convert these observations into stronger Bee platform guarantees without new evidence.

## 6. Date/time fidelity lesson

A non-blocking live finding remains important for future integration/testing:

- spoken `"September 23 at 3 PM"` appeared in processed history as an abbreviated form similar to `"September 23 at 3 p."`;
- downstream parsing produced a midnight due instant rather than the intended 3 PM;
- root cause was not conclusively assigned to Bee transcription normalization versus CueNexa parsing.

Implication:

- test spoken date/time fidelity end-to-end in host applications;
- do not present the current parser as proof that every spoken time-of-day survives upstream normalization correctly.

## 7. Integration constraints for host applications

The canonical host-integration guide is:

`docs/APP-INTEGRATION-GUIDE.md`

Current integration boundaries:

- Node.js 22+ local applications may compose the workspace-exported CueNexa packages when made available locally/source-linked;
- Electron may compose them in the Main Process with sanitized IPC to the renderer;
- browser-only, mobile, Swift/AppKit, Rust/Go/Tauri-only, or remote/cloud hosts do **not** currently have an approved structured integration boundary;
- agents must stop and request an architecture decision before inventing a sidecar, daemon, HTTP bridge, network service, mobile sync protocol, or cloud service;
- `@cuenexa-loop/cli` is a human validation/reference orchestration application, not a machine-readable JSON/NDJSON integration API;
- package APIs must be re-inspected from actual root exports before integration work; do not invent SDK methods or deep-import CLI internals.

## 8. Multi-agent operating decisions

The repository uses a standardized multi-agent workflow:

- `AGENTS.md` = stable operating contract;
- `docs/PROJECT-MEMORY.md` = durable cross-chat/project knowledge;
- `docs/STATUS.md` = current operational control plane;
- task-specific docs = canonical detailed design/acceptance rules;
- implementation happens on bounded branches;
- material work goes through PR review;
- audits inspect the exact PR head rather than trusting the implementer summary;
- merge requires explicit user/orchestrator authorization.

Use stronger agents for architecture, difficult debugging, milestone audits, and independent review; bounded routine work can be delegated more cheaply. Regardless of agent, repository evidence beats conversational recollection.

## 9. Launch and submission decisions

Current launch/submission direction:

- CueNexa Loop is the Bee-centered project for the Amazon Developer Build, Ship, Shape Hackathon;
- the repository is public and MIT licensed for submission/open-source readiness;
- the final Devpost demo must remain under 3 minutes;
- the demo should show real Bee-derived value, including provisional awareness followed by authoritative processed-history reconciliation;
- realtime must not be presented as authoritative persistence;
- no AWS architecture should be added merely for hackathon positioning;
- Bee developer friction is documented separately in `docs/DEVPOST-FRICTION-LOG.md`.

Current submission state and next action belong in `docs/STATUS.md`, not this file.

## 10. What belongs here vs. elsewhere

Add to **PROJECT-MEMORY.md** when information is likely to matter across future chats:

- locked product choices;
- durable architecture decisions;
- integration constraints;
- important lessons from incidents/testing;
- security/privacy boundaries;
- launch/commercialization decisions that remain in force;
- stable terminology;
- reasons behind important technical decisions.

Do **not** add here:

- temporary branch names;
- current PR number unless historically important;
- daily task progress;
- transient blockers;
- full acceptance transcripts;
- long changelogs;
- speculative future scope;
- personal conversation history unrelated to the repository.

Those belong in `docs/STATUS.md`, task/audit docs, PRs, issues, or external project logs.

## 11. Memory maintenance rule

This document should remain concise enough to read at the start of a session.

When updating it:

- replace stale durable facts rather than endlessly appending;
- remove decisions that have been formally superseded;
- preserve a short rationale when forgetting the reason would likely cause future agents to repeat a mistake;
- link to canonical detailed docs;
- never use this file to override actual implementation/test evidence.

---

**Agent reminder:** Recover durable project context from this file when the task actually needs it. For narrow implementation work, `AGENTS.md`, `docs/STATUS.md`, task-specific docs, and relevant code/tests are sufficient. Use conversational/model memory only as a pointer to what should be verified, never as the source of truth when repository evidence is available.
