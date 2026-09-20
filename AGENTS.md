# AGENTS.md — CueNexa Loop Multi-Agent Operating Contract

This file defines **how every AI coding agent, reviewer, auditor, QA agent, or documentation agent must work in this repository**.

It is intentionally stable. Current project state, active work, blockers, and next actions belong in [`docs/STATUS.md`](docs/STATUS.md), not here.

## 1. Mandatory read order

Before changing anything, read in this order:

1. `AGENTS.md` — operating rules and agent contract.
2. `docs/PROJECT-MEMORY.md` — durable cross-chat/project knowledge and locked context.
3. `docs/STATUS.md` — current source of truth for project state and next work.
4. `docs/LLM-IMPLEMENTATION-GUIDE.md` — canonical product and implementation orientation.
5. The task-specific design document(s) referenced by `docs/STATUS.md` (for host application embedding or integration tasks, read `docs/APP-INTEGRATION-GUIDE.md` before designing the host integration).
6. Relevant source code and tests.

Do not begin implementation from chat history, an old agent report, or a stale local branch alone.

If documentation and implementation disagree, stop and verify the actual repository state before making assumptions.

## 2. Authority order

When instructions conflict, use this order:

1. Explicit current user/orchestrator instruction.
2. This `AGENTS.md`.
3. `docs/STATUS.md`.
4. Locked architecture/design documents.
5. Existing tests and implementation behavior.
6. `docs/PROJECT-MEMORY.md` for durable context that is not superseded by the sources above.
7. General repository documentation / README.
8. Agent assumptions.

Never silently override a higher-authority rule.

## 3. Agent roles

Agents may perform one or more of these roles, but the role must be clear in the handoff.

### Orchestrator

Owns scope, sequencing, agent assignment, acceptance, and merge decisions.

The orchestrator should:

- define the bounded task;
- identify the correct baseline branch/SHA;
- avoid assigning overlapping write scopes to multiple agents;
- keep `docs/STATUS.md` accurate;
- request independent review for material changes;
- authorize merge only after evidence is available.

### Implementer

Owns one bounded implementation scope.

The implementer should:

- work from the authorized baseline;
- make the smallest coherent change;
- add/update tests with the implementation;
- update relevant docs when behavior changes;
- run the required quality gates;
- open or update a PR;
- provide an evidence-based handoff.

### Reviewer / Auditor

Independently verifies the actual branch/PR/commit rather than trusting the implementer's summary.

The reviewer should:

- inspect the exact head SHA;
- inspect changed files and relevant surrounding code;
- verify tests/CI and architecture invariants;
- identify blockers, important issues, and non-blocking observations separately;
- avoid making implementation changes unless explicitly asked.

### QA / Acceptance Agent

Validates behavior against acceptance criteria.

The QA agent should:

- follow the documented acceptance path;
- record commands, environment assumptions, expected result, and actual result;
- capture reproducible evidence;
- avoid changing production code while performing acceptance unless separately tasked.

### Documentation / Release Agent

Updates docs, release notes, submission material, or status only from verified repository state and acceptance evidence.

## 4. Multi-agent coordination rules

- **One writer per branch/worktree at a time.** Do not let multiple agents modify the same working tree concurrently.
- Split parallel work by clearly non-overlapping scope whenever possible.
- Do not stack new implementation on an unaudited branch unless the orchestrator explicitly approves it.
- Do not assume another agent's claimed commit, test result, or merge happened. Verify it.
- Use `docs/STATUS.md` as the handoff ledger between agents.
- If an agent discovers work outside its assigned scope, record it as a follow-up instead of silently expanding scope.
- If a defect changes architecture or acceptance criteria, stop and escalate to the orchestrator before broadening the design.

## 5. Branch and PR workflow

Unless the orchestrator specifies otherwise:

- branch from the latest authorized `main` baseline;
- use a bounded branch such as `feature/<scope>`, `fix/<scope>`, `docs/<scope>`, or `test/<scope>`;
- keep commits coherent and reviewable;
- do not mix unrelated cleanup/refactors with the requested work;
- push the branch and create/update a PR for material code changes;
- include test evidence and documentation impact in the PR body.

Documentation-only orchestration/status updates may be committed directly to `main` when explicitly requested by the user/orchestrator.

### Merge policy

Do **not** merge merely because implementation is complete.

A material PR is merge-ready only when:

1. the exact head has been reviewed;
2. required CI/tests pass;
3. no unresolved blocker remains;
4. architecture/privacy invariants are preserved;
5. the orchestrator/user explicitly authorizes merge.

## 6. Status discipline

`docs/STATUS.md` is the current project control plane.

Update it after any material milestone, including:

- phase/checkpoint completion;
- new branch or PR becoming active;
- blocker discovery or resolution;
- merge to `main`;
- acceptance-test result;
- change to the next authorized task.

Status statements must be factual and evidence-based.

Never mark work complete because an agent says it is complete. Record the verified commit/PR/CI/acceptance evidence.

Do not turn `STATUS.md` into a changelog. Keep it concise and current; historical detail belongs in design docs, PRs, or the project update log.

## 6.1 Project memory discipline

`docs/PROJECT-MEMORY.md` is the durable cross-chat/project memory for CueNexa Loop.

Use it for stable information that future humans and AI agents should recover from the repository rather than from conversational/model memory: locked product choices, architecture decisions, important lessons, integration constraints, launch decisions, and durable rationale.

When the user says **"Update the project memory and status docs from this chat"**:

1. read `AGENTS.md`, `docs/PROJECT-MEMORY.md`, and `docs/STATUS.md`;
2. verify relevant repository state before writing;
3. extract only durable project knowledge from the current chat into `docs/PROJECT-MEMORY.md`;
4. update only current operational state/blockers/next actions in `docs/STATUS.md`;
5. do not use model memory or an old chat summary as the authoritative source when repository evidence exists;
6. do not turn project memory into a transcript or changelog;
7. use the normal branch/PR workflow unless the user explicitly authorizes a direct documentation update.

If `PROJECT-MEMORY.md` conflicts with current code, tests, `STATUS.md`, or locked design docs, those verified sources win and the memory file must be corrected.

## 7. CueNexa Loop non-negotiable architecture invariants

Preserve these unless the orchestrator explicitly approves an architecture change:

- processed Bee history is the only authority for persistent `LoopThread` state;
- realtime Bee observations are provisional, bounded, best-effort, and memory-only;
- realtime data may never directly create, resolve, reopen, delete, or mutate persistent threads;
- never persist raw Bee transcripts, summaries, utterances, evidence, precise locations, credentials, raw anchors, provisional content, or realtime conversation UUIDs;
- default CLI output remains structural and content-free;
- `--include-content` must redact before truncation;
- core detection and correlation remain deterministic and provider-independent above the Bee adapter;
- never infer resolution from disappearance from a later snapshot;
- never guess realtime UUID ↔ historical numeric-ID mappings;
- partial/degraded source data must remain visibly partial/degraded;
- tests use synthetic fixtures only;
- no cloud service, telemetry, Bee writeback, background daemon, or external LLM is added unless the approved scope changes the architecture.

See `docs/LLM-IMPLEMENTATION-GUIDE.md`, `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`, `docs/SECURITY.md`, and `docs/BEE_INTEGRATION.md` for detail.

## 8. Change-quality rules

Every implementation agent must:

- understand the existing behavior before editing it;
- preserve backward compatibility unless the task explicitly changes it;
- prefer deterministic behavior and explicit failure over plausible silent fallback;
- keep provider-specific Bee shapes inside `@cuenexa-loop/bee-adapter`;
- avoid `any` or weakened validation merely to make a new payload compile;
- use bounded memory, pagination, retries, queues, and caches;
- use injected/fixed clocks in time-sensitive tests;
- add regression tests for every defect fixed;
- avoid logging private Bee payloads in errors or tests.

## 9. Required quality gates

Before an implementation handoff, run from the repository root:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Also run task-specific tests where appropriate.

If any required gate cannot run, report exactly why. Do not report a task as fully verified.

Live Bee tests are **manual acceptance**, not CI. They use the developer's authenticated Bee session and must never be added as CI tests using real personal data.

## 10. Security and privacy stop conditions

Stop implementation and escalate if a proposed change would:

- persist raw conversation content not already approved by architecture;
- expose credentials or authentication material;
- make private content appear in default output;
- require guessing identity mappings;
- introduce an unauthenticated local/network surface;
- silently weaken validation or privacy controls;
- upload Bee-derived personal content to a cloud/LLM service.

## 11. Standard task lifecycle

Use these states consistently in `docs/STATUS.md` and handoffs:

- `PLANNED` — scoped, not started.
- `IN PROGRESS` — active implementation or testing.
- `BLOCKED` — cannot continue without a decision/dependency/fix.
- `READY FOR REVIEW` — implementation complete, awaiting independent review.
- `READY FOR ACCEPTANCE` — review passed, awaiting manual/live acceptance if required.
- `ACCEPTED` — acceptance criteria verified.
- `MERGED` — approved changes landed on `main`.
- `CLOSED` — milestone finished; no further action required.

Do not conflate `MERGED` with `ACCEPTED` when live acceptance remains outstanding.

## 12. Standard agent handoff

Every material agent handoff should include this information in compact form:

```text
Role:
Task:
Baseline:
Branch / PR:
Head SHA:
What changed:
Files changed:
Tests run:
Results:
Known limitations / risks:
Docs updated:
Recommended next action:
```

For reviewers, also include:

```text
Verdict: APPROVED | APPROVED WITH NOTES | CHANGES REQUIRED
Blockers:
Important findings:
Non-blocking notes:
```

For QA, also include:

```text
Environment:
Acceptance scenario:
Expected:
Actual:
Evidence:
Pass/Fail:
```

## 13. Definition of done

A task is done only when all applicable items are true:

- requested behavior is implemented;
- architecture/privacy invariants remain intact;
- tests and quality gates pass;
- regression coverage exists for fixes;
- docs match behavior;
- independent review is complete for material changes;
- live/manual acceptance is complete when required;
- `docs/STATUS.md` reflects the verified state;
- merge/closure has been explicitly authorized when applicable.

## 14. Repository orientation

Primary packages:

- `packages/contracts` — provider-independent contracts and Zod schemas.
- `packages/bee-adapter` — the only Bee-specific integration boundary.
- `packages/loop-engine` — deterministic detection, correlation, and provisional awareness logic.
- `packages/loop-store` — local SQLite persistence, reconciliation, attention, user state, notification ledger.
- `packages/cli` — commands, presenters, orchestration, foreground watch runtime.

Core documents:

- `docs/PROJECT-MEMORY.md` — durable cross-chat/project knowledge and stable decisions.
- `docs/STATUS.md` — current state and next authorized work.
- `docs/LLM-IMPLEMENTATION-GUIDE.md` — fast implementation orientation.
- `docs/APP-INTEGRATION-GUIDE.md` — canonical application-integration and testing guide.
- `docs/ARCHITECTURE.md` — architecture and boundaries.
- `docs/BEE_INTEGRATION.md` — official Bee integration behavior.
- `docs/LOOP-DETECTION.md` — deterministic LoopItem detection.
- `docs/LOOP-CORRELATION.md` — correlation rules and lifecycle.
- `docs/LOOP-PERSISTENCE.md` — persistent structural state.
- `docs/PROACTIVE-FOLLOW-THROUGH.md` — Phase 3 behavior.
- `docs/AMBIENT-REALTIME-AWARENESS.md` — Phase 4 design and acceptance contract.
- `docs/PRIVACY.md` / `docs/SECURITY.md` — trust boundaries.
- `docs/FRICTION-LOG.md` — engineering friction history.

When in doubt: **read `docs/PROJECT-MEMORY.md` and `docs/STATUS.md`, verify the actual repository head, preserve the invariants, and keep the change bounded.**
