# CueNexa Loop — Project Status

> **Purpose:** This is the dynamic handoff/control-plane document for humans and AI agents. Read `AGENTS.md` first, then this file before starting work.
>
> Keep this file concise, factual, and current. Update it after material implementation, review, merge, blocker, or acceptance milestones.

**Last updated:** 2026-09-16  
**Repository:** `mrdzyn/cuenexa-loop`  
**Default branch:** `main`  
**Current project state:** Phase 4 engineering merged; live Bee acceptance pending  
**Current authorized objective:** Complete Phase 4 live acceptance, then finalize the Devpost demo/submission  
**Phase 5:** Not defined or authorized

## 1. Baseline

The latest verified implementation milestone is:

- **Phase 4 implementation merge:** `ac16694a6d85079114215aada7d171180ff592da` — `Phase 4: add ambient realtime awareness (#8)`

Documentation/submission/orchestration commits landed after the Phase 4 code merge, including:

- `e11e233d000cfc58706741b84e89ff034e9258cb` — Devpost Bee developer friction log.
- `580f65be58cd2b595456c6d3040c22b3019f600e` — canonical LLM implementation guide.
- `0c2d658a6df6bc601df12585bf4483c88e2be8ff` — initial coding-agent entry point.
- `85221047987784836226b12aca59ea463b549a65` — standardized multi-agent `AGENTS.md`.

Because this file itself may be updated frequently, agents must verify the actual current repository head rather than treating a SHA in this document as a permanent `main` pointer.

## 2. Milestone status

| Milestone | Goal | Status | Evidence |
| --- | --- | --- | --- |
| Phase 0 | Bee connectivity, normalization, privacy-safe foundation | CLOSED | merged foundation |
| Phase 1A | Deterministic LoopItem detection | CLOSED | merged |
| Phase 1B | Deterministic cross-conversation correlation | CLOSED | `c147e002bd97635e0042aadac0fdd4be3ac550c0` |
| Phase 2 | Persistent local follow-through | CLOSED | `7d5d6a2ea27e07ff640ac33408eadb9df6c673f1` |
| Phase 3 | Proactive follow-through actions/review/notifications | CLOSED | `feb503646c830050f67fc484dd7c2f3eb953ba66` |
| Phase 4 | Ambient realtime awareness | MERGED | `ac16694a6d85079114215aada7d171180ff592da`, PR #8 |
| Phase 4 live acceptance | Real Bee realtime → processed-history handoff | READY FOR ACCEPTANCE | manual test still required |
| Devpost submission | Final demo + final submission | IN PROGRESS | submission material prepared; final live proof pending |
| Phase 5 | Future product phase | PLANNED | intentionally undefined; do not invent scope |

## 3. Last verified Phase 4 engineering quality baseline

Final Phase 4 audit before merge reported:

- 49 test files;
- 425 tests passing;
- typecheck passing;
- build passing;
- `npm audit` reporting 0 vulnerabilities;
- realtime silent-watch memory regression covered;
- final audit verdict: approved for merge.

These results apply to the audited Phase 4 implementation head. Documentation-only commits followed afterward.

Any new code change must rerun the full quality gates from `AGENTS.md`.

## 4. Current architecture contract

The most important rule remains:

> **Processed Bee history is authoritative. Realtime is only a provisional acceleration layer.**

Current Phase 4 flow:

```text
Bee realtime
  ↓
normalized ephemeral events
  ↓
provisional awareness
  ↓
PROVISIONAL presentation only
  ↓
Bee processed history becomes available
  ↓
authoritative historical refresh
  ↓
Phase 1 detection/correlation
  ↓
Phase 2 persistent reconciliation
  ↓
Phase 3 review/actions/notification policy
```

Realtime must never directly create, resolve, reopen, delete, or mutate persistent `LoopThread` state.

## 5. Current active work

### P4-LIVE — Phase 4 live Bee acceptance

**Owner:** Human operator + QA/audit agent  
**State:** `READY FOR ACCEPTANCE`  
**Code changes expected:** None unless live testing reveals a defect  
**Primary command:**

```bash
npm run loops:watch
```

### Test sequence

1. Confirm Bee authentication/connectivity.
2. Start `npm run loops:watch` before recording.
3. Record a real Bee conversation containing a clear commitment/follow-up/deadline.
4. Confirm CueNexa shows a clearly labeled **PROVISIONAL** signal during the conversation.
5. End the conversation and allow Bee to process it. Use Bee's manual **Process now** action if necessary.
6. Trigger or allow the bounded authoritative refresh.
7. Confirm processed history produces/reuses the correct persistent LoopThread through the existing Phase 1–3 path.
8. Run `npm run loops:review` and `npm run loops:history`.
9. Restart `loops:watch` and verify persistent continuity without creating a duplicate durable thread.
10. Verify default output remains privacy-safe/content-free.

### Required acceptance evidence

- realtime connection established;
- one or more `PROVISIONAL` follow-through signals observed;
- absence/delay in processed history does **not** resolve/delete work;
- authoritative refresh succeeds after Bee processing;
- persistent LoopThread is created or reused only through processed history;
- no duplicate durable thread caused by the provisional signal;
- no duplicate notification delivery caused by realtime observation;
- `loops:review` reflects the authoritative thread correctly;
- `loops:history` contains structural authoritative events only;
- watcher restart preserves persistent continuity;
- no raw realtime transcript/provisional payload is persisted.

### Safety note

**Do not run:**

```bash
npm run loops:reset -- --yes
```

unless the orchestrator explicitly decides to wipe the local test state.

## 6. Current known Bee integration realities

These are expected behaviors/constraints, not automatically defects:

- Bee processed conversation history may appear after a processing delay.
- Manual **Process now** may be needed during live testing before new history becomes available.
- Bee realtime `conversation_uuid` and processed-history numeric conversation `id` are separate namespaces.
- CueNexa maps them only when Bee explicitly supplies both identifiers in one payload; mappings are bounded and memory-only.
- `@beeai/cli` 0.7.3 `streamJson()` exposes parsed `data:` JSON but not the original SSE `event:` / `id:` metadata.
- realtime delivery is treated as lossy/at-most-once; authoritative processed-history refresh repairs gaps.

See `docs/BEE_INTEGRATION.md`, `docs/AMBIENT-REALTIME-AWARENESS.md`, and `docs/DEVPOST-FRICTION-LOG.md`.

## 7. Submission/readiness artifacts

Current public/open-source readiness:

- repository is public;
- MIT license is present;
- `AGENTS.md` provides the multi-agent operating contract;
- `docs/LLM-IMPLEMENTATION-GUIDE.md` provides a canonical implementation/reproduction guide;
- `docs/DEVPOST-FRICTION-LOG.md` provides submission-ready Bee developer friction feedback;
- broader `docs/FRICTION-LOG.md` preserves engineering history;
- Devpost story, Built With, feedback responses, image captions, and promotional visuals have been prepared;
- CueNexa Loop Submission Pack PDF has been prepared outside the repository;
- Phase 4 Live Acceptance Test Guide has been prepared for manual QA.

## 8. Immediate orchestration queue

| Order | Role | Task | State | Output expected |
| --- | --- | --- | --- | --- |
| 1 | Human / QA | Run real Bee Phase 4 `loops:watch` acceptance | READY | terminal evidence + observed behavior |
| 2 | Auditor | Review acceptance evidence against Phase 4 contract | WAITING | PASS / blockers / remediation scope |
| 3 | Implementer | Only if live acceptance exposes a real defect | WAITING | bounded fix branch + tests + PR |
| 4 | Reviewer | Independently audit any remediation PR | WAITING | verified verdict at exact head SHA |
| 5 | Docs / Release | Update status/docs from final acceptance evidence | WAITING | finalized docs/submission wording |
| 6 | Human / Release | Record <3-minute demo and submit Devpost entry | WAITING | final submission |

Do not start a speculative Phase 5 while P4-LIVE is unresolved.

## 9. If live acceptance fails

Classify the failure before editing code:

### A. Bee/platform timing or processing delay

Examples: new conversation not processed yet; realtime gap; manual Process now required.

Action: retry using the documented bounded/manual path. Do not weaken authority rules.

### B. Test/environment/configuration issue

Examples: unauthenticated CLI, wrong Node version, stale local build.

Action: correct environment and rerun acceptance before changing product code.

### C. Actual CueNexa defect

Action:

1. record the exact reproduction;
2. update this file to `BLOCKED` with concise evidence;
3. create a bounded `fix/<scope>` branch from the authorized baseline;
4. add a regression test using synthetic fixtures;
5. run all quality gates;
6. open a PR;
7. independently audit the exact PR head;
8. merge only after explicit authorization;
9. rerun the failed live acceptance scenario.

## 10. Standard commands

Quality gates:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Primary live/diagnostic commands:

```bash
bee status
npm run bee:check
npm run loops:check
npm run loops:correlate
npm run loops:sync
npm run loops:today
npm run loops:review
npm run loops:history
npm run loops:notifications
npm run loops:notify
npm run loops:watch
npm run loops:realtime-demo
```

Use `--include-content` only when explicit redacted/truncated content inspection is required.

## 11. Next decision gate

After Phase 4 live acceptance passes:

1. mark P4-LIVE `ACCEPTED` / Phase 4 `CLOSED`;
2. update this file with the acceptance evidence/date;
3. finalize and record the Devpost demo;
4. complete submission;
5. only then define Phase 5 based on observed product needs.

Potential future directions such as desktop/tray UX, richer timeline visualization, broader CueNexa integration, native local notifications, or optional AI over confirmed LoopThreads are **ideas, not authorized Phase 5 scope**.

---

**Agent reminder:** Before starting any task, verify the actual GitHub/local head, read `AGENTS.md`, and confirm the task appears in or is explicitly authorized beyond this status file.
