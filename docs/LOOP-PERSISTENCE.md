# Local Loop persistence (Phase 2)

Phase 2 gives a correlated Phase 1B Loop a persistent local `LoopThread`
identity. A Phase 1B Loop ID is snapshot-local and changes when membership
changes; a LoopThread remains stable by first matching an already known
snapshot ID, then only a strong member identity overlap (at least two shared
hashed members and 60% of the current Loop). Ties are reported as ambiguous
and never merged. Titles are never used to match threads.

`loops:sync` performs a bounded, hydrated Bee snapshot, runs the unchanged
pure detection/correlation pipeline, and reconciles the result atomically in
local SQLite. It creates content-free events for creation, added members,
state/due changes, reopen, resolution, and new activity. Running the exact
same snapshot again is idempotent: it creates no duplicate event and changes
no thread timestamp. A missing Loop, especially from a partial snapshot,
never resolves a thread; only a Phase 1B lifecycle result may do that.

The state file is `~/.cuenexa-loop/cuenexa-loop.sqlite` by default or the
local `CUENEXA_LOOP_DB_PATH` override. It contains only derived state:
thread/snapshot IDs, hashed members, lifecycle, normalized due date,
timestamps, derived title, and structural event metadata. It never contains
Bee source records, transcripts, summaries, raw evidence, locations, people,
credentials, raw anchors, or natural-language due phrases. Initialization is
versioned, transactional, uses foreign keys and parameterized SQL, and never
deletes an incompatible/corrupt database automatically.

Resolved state is retained for 30 days by default, configurable through the
bounded `CUENEXA_LOOP_RETENTION_DAYS`; active state is never removed. Delete
all local state with `npm run loops:reset -- --yes`. This never modifies Bee.

`loops:today` is a local-only fixed-priority ranking: overdue open work, due
within 24 hours, reopened/new activity/new member/new thread, due within
three days, stale open work, then long-waiting work. It is deterministic and
does not change lifecycle. Default CLI output is structural; an explicit
`--include-content` reveals only a derived title passed through the shared
redact-first, truncate-second preview helper.
