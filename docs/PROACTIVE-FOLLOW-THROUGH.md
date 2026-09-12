# Proactive follow-through (Phase 3)

Phase 3 answers what a user can do about a persistent Loop while preserving a
strict boundary between Bee-derived truth and local preference state. It is
local-only, deterministic, and provider-independent above the adapter. It uses
no LLM, embeddings, telemetry, cloud service, UI framework, realtime Bee
listener, Bee write-back, or OS-level notification service.

## Truth and preference boundary

The source-derived `LoopThread.state` remains `open`, `waiting`, or
`resolved`. Acknowledge, snooze, pin, dismiss, restore, and unsnooze update a
separate local row and never change that lifecycle or add a source
`LoopChangeEvent`.

- **Acknowledge** records when current recent-change activity was reviewed.
  It suppresses `newly_created`, `new_activity`, `new_member`, and `reopened`
  events at or before that time. Deadline, stale, and waiting reasons remain.
- **Snooze** hides active attention and ordinary notifications until an
  absolute UTC instant. Input is either strict ISO-8601 or a deterministic
  `m`, `h`, or `d` duration from 1 minute through 365 days. Unsnooze clears it.
- **Pin** adds a ranked `pinned` reason and bypasses a non-urgent dismissal.
  It cannot override an active snooze. Unpin clears it.
- **Dismiss** hides unchanged, non-urgent current attention without resolving
  or deleting it. Restore clears dismissal. Newer structural activity,
  `due_within_24h`, or `overdue_open` can make it visible again.

Precedence is: resolved lifecycle; active snooze; urgent deadline safety;
pin; newer source activity after dismissal; acknowledgement filtering of
reviewed recent-change reasons; ordinary attention.

## Review

`loops:review` returns structured sections: **Due Now**, **Needs Attention**,
**Waiting**, **Snoozed**, and **Recently Resolved** (seven days). Default
output contains no title or conversational content. `--include-content` may
show only the persisted derived title through the shared redact-first,
truncate-second preview helper.

## Notification planning and deduplication

The pure planner supports `overdue`, `due_within_24h`, `reopened`, and
`new_activity`. Resolved or actively snoozed threads never qualify.
Acknowledgement and dismissal suppress reviewed unchanged source events;
urgent due safety may bypass dismissal.

`loops:notifications` previews without mutation. `loops:notify` renders the
same local CLI plan, then records rendered candidates in
`loop_notification_deliveries`. The unique identity is
`thread_id + notification_type + trigger_key`: source triggers use stable
event IDs and deadline triggers use normalized due timestamps. A due-date
change may create a new trigger, and due-within-24-hours becoming overdue is a
distinct class. Current wall time is never the dedupe key. The ledger stores
no title or notification body. A future native adapter can consume the
structured plan and record successful delivery without changing policy.

## Schema and retention

Opening a Phase 2 schema-v1 database automatically performs a transactional,
idempotent migration to v2. It preserves existing threads, mappings, members,
and events, and adds `loop_thread_user_state` plus
`loop_notification_deliveries`. Failure rolls back without reset or deletion.
Resolved threads older than the configured retention period are purged before
identity matching and cannot be revived; retained resolved threads may reopen
through the existing strong-overlap rules. Active threads never age out.

## Commands

```bash
npm run loops:review
npm run loops:review -- --include-content
npm run loops:ack -- <thread-id>
npm run loops:snooze -- <thread-id> --until 2026-12-01T12:00:00.000Z
npm run loops:snooze -- <thread-id> --for 2h
npm run loops:unsnooze -- <thread-id>
npm run loops:pin -- <thread-id>
npm run loops:unpin -- <thread-id>
npm run loops:dismiss -- <thread-id>
npm run loops:restore -- <thread-id>
npm run loops:notifications
npm run loops:notify
```

## Manual QA with an existing database

Do not reset the existing database. After Phase 3 is merged:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run build
npm run loops:review -- --include-content
npm run loops:sync
npm run loops:review -- --include-content
npm run loops:history -- --include-content
```

Use the locally displayed thread ID; never copy a real ID into source or docs.
Then acknowledge it and confirm recent-change reasons disappear while deadline
reasons remain; pin and review; snooze with `--for 2h` and confirm **Snoozed**;
unsnooze; dismiss and review; restore; preview with `loops:notifications`;
deliver with `loops:notify`; immediately repeat and confirm zero eligible
notifications. A due-within-24-hours or overdue thread legitimately bypasses
dismissal, so that is not a bug.

Optionally process a third related Bee conversation, wait until Bee historical
APIs expose it, run `loops:sync`, and verify the same persistent thread gains
`member_added`/`new_activity`, local acknowledge/dismiss state follows the
rules above, and no duplicate related thread appears. Live Bee is never used
by automated tests.

## Known limitations

Notification delivery is terminal output only; there is no scheduling,
background daemon, realtime ingestion, OS notification, email/SMS, or mobile
push. Relative snooze durations deliberately avoid natural language. Review
uses the locally retained event window and database retention policy.
