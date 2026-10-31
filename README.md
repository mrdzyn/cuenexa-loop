<div align="center">

# CueNexa Loop

### From conversations to commitments you can actually follow through on.

**Open-source · Local-first · Built for Amazon Bee**

*Bee remembers what happened. CueNexa Loop helps you see what remains unfinished.*

[![CI](https://github.com/mrdzyn/cuenexa-loop/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mrdzyn/cuenexa-loop/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?logo=node.js&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)
![Privacy](https://img.shields.io/badge/Privacy-local--first-7c3aed)
![Realtime](https://img.shields.io/badge/Realtime-memory--only-0f766e)
![Contest](https://img.shields.io/badge/Contest-submitted-0ea5e9)

[Try it](#try-it-in-minutes) ·
[Architecture](#how-it-works) ·
[Electron example](#working-electron-reference-app) ·
[Privacy & security](#privacy-by-design) ·
[Docs](#documentation)

</div>

> [!NOTE]
> **Amazon Developer Build, Ship, Shape Hackathon:** Submission complete; judging continues through **November 21, 2026**. Project posture: **HOLD-CONTEST-STABLE**. No new features or Phase 5 are authorized.

> [!IMPORTANT]
> **The core trust rule:** Only processed Bee history can reconcile persistent Loop state. Realtime observations appear as **PROVISIONAL**, stay memory-only, and cannot directly update the database.

<p align="center">
  <a href="docs/assets/cuenexa-animated-flow.svg">
    <img src="docs/assets/cuenexa-animated-flow.svg" alt="CueNexa Loop architecture: processed Bee history flows through the adapter and deterministic engine into local SQLite and review; a separate Bee realtime lane displays only memory-only provisional signals, with no direct database writes." width="100%" />
  </a>
</p>

<p align="center"><sub>Two independent flows · moving signals where supported · click to inspect at full size · readable as a static diagram</sub></p>

## Try it in minutes

Choose the path that fits what you want to verify. **The synthetic demo needs no Bee login or personal conversations.**

| Just evaluating the project? | Integrating with your Bee account? |
| --- | --- |
| **Synthetic realtime demo** — see the provisional-to-authoritative handoff without private data. | **Local Bee workflow** — detect, correlate, sync, and review your own data through an authenticated Bee CLI. |
| `npm ci` → `npm run build` → `npm run loops:realtime-demo` | Set up Bee below, then run `npm run loops:check`, `npm run loops:sync`, and `npm run loops:review`. |
| [View the Phase 4 design](docs/AMBIENT-REALTIME-AWARENESS.md) | [Go to the quickstart](#quickstart) |

**Want to see the desktop integration?** [Open the runnable Electron example](examples/electron-local-reference/README.md). It is a **reference application, not a packaged consumer desktop release**. The reference has [real Bee historical-sync acceptance](docs/audit/P4-R1A-LIVE-ACCEPTANCE-2026-10-06.md) and [realtime acceptance](docs/audit/P4-R1B-LIVE-ACCEPTANCE-2026-10-07.md) evidence; no private screenshots or transcripts are committed.

## What CueNexa Loop does

CueNexa Loop takes Bee-derived conversations, facts, and todos and finds unfinished commitments. It connects strongly related items across conversations using explainable deterministic rules, keeps only minimized local follow-through state, and provides an actionable review.

| Capability | What it does |
| --- | --- |
| **Detect** | Finds commitments, decisions, delegations, follow-ups, deadlines, and open questions from Bee-derived data. |
| **Correlate** | Groups strongly related items across conversations using deterministic high-confidence rules. |
| **Persist locally** | Maintains minimized structural `LoopThread` state in local SQLite without storing raw Bee transcripts or evidence. |
| **Prioritize** | Builds Due Now, Needs Attention, Waiting, Snoozed, and Recently Resolved review views. |
| **Act** | Supports local acknowledgement, snooze, pin, dismiss, restore, history, and notification deduplication. |
| **React in realtime** | Shows conservative `PROVISIONAL` signals from Bee realtime without making them persistence authority. |
| **Embed** | Ships a working Electron integration reference with sanitized IPC and a hardened renderer boundary. |

### At a glance

| | |
| --- | --- |
| **Architecture** | Local-first, deterministic, provider-independent above the Bee adapter |
| **Persistence** | Local SQLite, minimized derived structural state only |
| **Realtime** | Foreground, provisional, bounded, memory-only |
| **Cloud processing** | None added by CueNexa Loop |
| **External LLM** | None |
| **Telemetry / analytics** | None |
| **Tests** | Synthetic fixtures only |
| **Verified engineering baseline** | 56 test files / 465 tests passing, typecheck PASS, build PASS; dependency audit cleared in [PR #29](https://github.com/mrdzyn/cuenexa-loop/pull/29) |
| **License** | MIT |

## How it works

```mermaid
flowchart TB
    subgraph A["AUTHORITATIVE · processed history"]
      direction LR
      B["Bee CLI / Bee Adapter"] --> C["Normalize"] --> D["Detect + correlate"] --> E[("Local LoopStore")] --> F["Review"]
    end
    subgraph R["PROVISIONAL · realtime, memory-only"]
      direction LR
      G["Bee realtime"] --> H["ProvisionalAwareness"] --> I["PROVISIONAL UI"]
    end
    classDef history fill:#123047,stroke:#38bdf8,color:#e0f2fe;
    classDef temporary fill:#123b35,stroke:#34d399,color:#d1fae5;
    class B,C,D,E,F history;
    class G,H,I temporary;
```

**There is intentionally no arrow from the realtime track to `LoopStore`.** Realtime hints may request a separate, bounded *authoritative historical refresh*, but provisional events never create or change persistent threads themselves.

The authoritative path and realtime path are deliberately separate:

| Authoritative history | Provisional realtime |
| --- | --- |
| Processed Bee history | Bee realtime stream |
| Deterministic detection/correlation | Conservative provisional signals |
| May reconcile `LoopStore` | **Zero direct `LoopStore` writes** |
| Drives durable review state | Drives temporary `PROVISIONAL` presentation |
| Repairs realtime gaps | Best-effort acceleration only |

## Working Electron reference app

**[Explore the runnable Electron example →](examples/electron-local-reference/README.md)**

Source: [`examples/electron-local-reference/`](examples/electron-local-reference/)

This working example integrates real Bee historical Sync and optional realtime Start/Stop using sanitized Main-to-renderer IPC. It is **not a production-packaged desktop app or a public npm SDK**.

```text
Bee processed history
        ↓
BeeAdapterClient
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

Optional realtime stays separate:

```text
Bee realtime
        ↓
BeeAdapterClient.subscribeRealtime()
        ↓
ProvisionalAwareness
        ↓
sanitized provisional DTO
        ↓
PROVISIONAL renderer section
        ↓
never persisted
```

### Electron security posture

The reference uses:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- no `webviewTag`
- no arbitrary navigation or window creation
- restrictive local CSP
- no CDN, telemetry, analytics, or remote fonts
- sanitized renderer DTOs only

The renderer never receives direct Bee, SQLite, filesystem, raw transcript, evidence, authentication, or realtime UUID access.

### Live acceptance

| Acceptance | Result | Evidence |
| --- | --- | --- |
| **P4-R1A — authoritative historical path** | **PASS** | [Live acceptance record](docs/audit/P4-R1A-LIVE-ACCEPTANCE-2026-10-06.md) |
| **P4-R1B — provisional realtime path** | **PASS** | [Live acceptance record](docs/audit/P4-R1B-LIVE-ACCEPTANCE-2026-10-07.md) |
| **P4-R1C — developer docs / polish** | **MERGED** | [P4-R1 contract](docs/P4-R1-ELECTRON-LOCAL-REFERENCE.md) |

The realtime acceptance directly verified that real Bee realtime produced sanitized provisional signals while causing **zero persistent thread/event changes** before authoritative processing. These are **recorded prior acceptance results**, not a claim that every later dependency change has been retested on all devices.

## Privacy by design

CueNexa Loop works close to highly personal conversational data, so data minimization is an architectural rule rather than a UI preference.

| Boundary | CueNexa Loop behavior |
| --- | --- |
| Bee credentials | Remain managed by Bee tooling; CueNexa never implements or stores a Bee credential |
| Raw transcripts / utterances | Processed in memory when required; never persisted by CueNexa |
| Raw evidence / anchors | Never persisted |
| Precise location | Never persisted or printed |
| Realtime UUID mappings | Accepted only when Bee explicitly supplies both identifiers; memory-only |
| Default CLI output | Structural and content-free |
| `--include-content` | Explicit opt-in; redact before truncate |
| Local database | Derived structural follow-through state only |
| Cloud / external LLM | None |
| Test data | Synthetic fixtures only |

Read the full policies:

- [Privacy model](docs/PRIVACY.md)
- [Security architecture](docs/SECURITY.md)
- [Security reporting policy](SECURITY.md)

## Quickstart

### Prerequisites

- Node.js 22+
- npm
- Bee desktop app and Bee account
- Bee Developer Mode enabled
- official `@beeai/cli` on `PATH`
- authenticated Bee CLI session

### 1. Authenticate Bee

```bash
npm install -g @beeai/cli
bee login
bee status
```

CueNexa Loop does not run `bee login` for you and does not handle the underlying Bee credential.

### 2. Install and build

```bash
npm ci
npm run build
```

### 3. Sync and review follow-through

```bash
npm run loops:sync
npm run loops:review
```

### 4. Try the Electron reference

```bash
npm start --workspace @cuenexa-loop/electron-local-reference
```

For an **isolated QA run** (does not use the normal Electron database):

```bash
export CUENEXA_LOOP_ELECTRON_DB_PATH="$(mktemp -d)/electron-qa.sqlite"
npm start --workspace @cuenexa-loop/electron-local-reference
```

> [!TIP]
> Use `CUENEXA_LOOP_ELECTRON_DB_PATH`, **not** the CLI-only `CUENEXA_LOOP_DB_PATH`. On a fresh machine, the first Electron launch may need to download its runtime binary.

## Core commands

| Command | Purpose |
| --- | --- |
| `npm start` | Structural Bee connectivity check |
| `npm run loops:check` | Detect LoopItems from a fully hydrated Bee snapshot |
| `npm run loops:correlate` | Deterministically correlate high-confidence cross-conversation items |
| `npm run loops:sync` | Reconcile authoritative processed history into local structural state |
| `npm run loops:today` | Local deterministic attention view |
| `npm run loops:review` | Actionable structural review |
| `npm run loops:history` | Local structural event history |
| `npm run loops:notifications` | Preview local notification candidates |
| `npm run loops:notify` | Render + dedupe local notification delivery |
| `npm run loops:watch` | Foreground provisional realtime + authoritative refresh |
| `npm run loops:realtime-demo` | Synthetic deterministic realtime handoff demo |
| `npm run loops:reset -- --yes` | Explicitly erase CueNexa local state only |

Local user-state actions are also available through `loops:ack`, `loops:snooze`, `loops:unsnooze`, `loops:pin`, `loops:unpin`, `loops:dismiss`, and `loops:restore`.

### Content inspection is always explicit

Default output is structural and does not print private conversational content.

Use `--include-content` only when deliberately inspecting redacted/truncated content:

```bash
npm run loops:check -- --include-content
npm run loops:correlate -- --include-content
npm run loops:review -- --include-content
npm run loops:watch -- --include-content
```

Redaction runs **before** truncation, and precise coordinates are never printed.

## Local persistence

The CLI database defaults to:

```text
~/.cuenexa-loop/cuenexa-loop.sqlite
```

Use `CUENEXA_LOOP_DB_PATH` to override it.

The database stores minimized derived state such as thread IDs, hashed member identities, lifecycle, normalized due instants, structural events, bounded preferences, and notification delivery keys. It does **not** store Bee transcripts, summaries, raw LoopItem evidence, locations, people, credentials, or raw correlation anchors.

The Electron reference uses a separate app-specific database under Electron `userData` and supports `CUENEXA_LOOP_ELECTRON_DB_PATH` for disposable testing.

## Repository map

| Path | Responsibility |
| --- | --- |
| [`packages/contracts`](packages/contracts) | Provider-independent domain contracts and Zod schemas |
| [`packages/bee-adapter`](packages/bee-adapter) | The only Bee-specific integration boundary |
| [`packages/loop-engine`](packages/loop-engine) | Deterministic detection, correlation, and provisional awareness |
| [`packages/loop-store`](packages/loop-store) | Local SQLite persistence, reconciliation, attention, user state, notification ledger |
| [`packages/cli`](packages/cli) | Commands, presenters, orchestration, foreground watch runtime |
| [`examples/electron-local-reference`](examples/electron-local-reference) | Executable local Electron integration reference |

## Quality gates

```bash
npm run typecheck
npm test
npm run build
npm audit
```

CI uses synthetic fixtures only. Real Bee acceptance is manual and never runs against personal data in GitHub Actions.

## What this project is — and is not

CueNexa Loop is a **working, local-first engine and executable integration reference**. It does not claim to be a finished app-store desktop product. Detection and correlation use deterministic heuristics, not an LLM or a statistical probability model. A low-confidence potential match may deliberately remain ungrouped.

## Known limitations

- Bee processed-history availability may lag realtime; manual **Process now** may sometimes be useful during live testing.
- Realtime is provisional, best-effort, and not persistence authority.
- Bee realtime UUIDs and historical numeric conversation IDs are different namespaces; CueNexa does not guess mappings.
- The Electron renderer starts without an in-memory review after restart until the next authoritative **Sync**.
- Spoken time-of-day fidelity has one documented non-blocking integration case and remains backlog only during contest hold.
- Workspace packages are private and are not published as a public npm SDK.

## Documentation

| Guide | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries and design |
| [Privacy](docs/PRIVACY.md) | Data handling and minimization |
| [Security architecture](docs/SECURITY.md) | Trust boundaries and threat model |
| [Security policy](SECURITY.md) | Vulnerability reporting |
| [Bee integration](docs/BEE_INTEGRATION.md) | Official Bee adapter behavior |
| [Loop detection](docs/LOOP-DETECTION.md) | Deterministic detection model |
| [Loop correlation](docs/LOOP-CORRELATION.md) | Scoring, complete-link grouping, lifecycle |
| [Persistence](docs/LOOP-PERSISTENCE.md) | Local structural state |
| [Proactive follow-through](docs/PROACTIVE-FOLLOW-THROUGH.md) | Phase 3 behavior |
| [Ambient realtime awareness](docs/AMBIENT-REALTIME-AWARENESS.md) | Phase 4 provisional/authoritative boundary |
| [Application Integration Guide](docs/APP-INTEGRATION-GUIDE.md) | Host integration and testing |
| [Electron reference README](examples/electron-local-reference/README.md) | Runnable desktop reference |
| [Developer friction log](docs/DEVPOST-FRICTION-LOG.md) | Bee developer feedback |

## Security reporting

Found a potential vulnerability? Please **do not disclose exploit details in a public issue or pull request**.

See [`SECURITY.md`](SECURITY.md) for private reporting guidance and privacy-safe reproduction requirements.

## License

CueNexa Loop is available under the [MIT License](LICENSE).

---

<div align="center">

**CueNexa Loop**

*Bee remembers what happened. CueNexa Loop remembers what is still unfinished.*

</div>
