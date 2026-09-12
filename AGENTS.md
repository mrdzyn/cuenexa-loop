# CueNexa Loop — Instructions for Coding Agents

If you are an LLM or coding agent working in this repository, **read [`docs/LLM-IMPLEMENTATION-GUIDE.md`](docs/LLM-IMPLEMENTATION-GUIDE.md) before modifying code**.

That guide is the canonical orientation document for the product contract, architecture, phase-by-phase implementation, privacy/security boundaries, Bee integration behavior, test gates, and required reading order.

At minimum, preserve these invariants:

- processed Bee history is the only authority for persistent `LoopThread` state;
- realtime Bee observations are provisional, bounded, and memory-only;
- realtime data may never directly create, resolve, reopen, delete, or mutate persistent threads;
- never persist raw Bee transcripts, summaries, utterances, evidence, precise locations, credentials, raw anchors, provisional content, or realtime conversation UUIDs;
- default CLI output remains structural and content-free;
- core detection and correlation remain deterministic and provider-independent above the Bee adapter;
- never infer resolution from disappearance from a later snapshot;
- never guess realtime UUID ↔ historical numeric-ID mappings;
- partial or degraded data must remain visibly partial/degraded;
- do not add cloud services, telemetry, Bee writeback, a background daemon, or an external LLM unless the task explicitly changes the architecture.

Before finishing a change, run:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Tests must use synthetic fixtures only. Live Bee acceptance remains a separate manual step using the developer's authenticated Bee session.
