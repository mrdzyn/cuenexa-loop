# Privacy

CueNexa Loop exists to help someone follow through on their own
commitments, using their own Bee data. That only works if it is trustworthy
with data that is, by nature, extremely personal — ambient transcripts of
someone's conversations. Phase 0 sets the privacy posture the rest of the
project builds on.

## What Phase 0 does

- Reads recent conversations, facts, and todos from **your own** local Bee
  developer proxy, over `http://127.0.0.1` — never a network hop.
- Normalizes that data into CueNexa Loop contracts, in memory, for the
  lifetime of a single CLI run.
- Prints a redacted, truncated, deliberately partial summary to your own
  terminal.
- Exits. Nothing is retained after the process ends.

## What Phase 0 never does

- **No persistence.** There is no database, no cache, no file written to
  disk containing Bee data. `fetchBeeSnapshot` is called fresh every run
  and its result lives only in process memory.
- **No network egress beyond the local proxy.** The only HTTP call this
  codebase makes is to `BEE_PROXY_URL` (default `http://127.0.0.1:8787`).
  There is no telemetry, analytics, or third-party API call anywhere in
  this repository.
- **No credential handling.** Authentication is entirely `bee login`'s
  responsibility; the proxy it starts is local and unauthenticated by
  design (see [docs/BEE_INTEGRATION.md](BEE_INTEGRATION.md)). CueNexa Loop
  never sees, stores, or transmits an API key or token.
- **No raw transcript output.** `LoopConversation.utterances` carries
  full per-speaker text internally (future Loop-intelligence phases will
  need it to detect commitments and decisions), but the Phase 0 console
  presenter never prints it — only an utterance count. The same applies to
  precise location coordinates: their presence is acknowledged, their
  value is not printed.
- **No real Bee data in the repository.** Every fixture under
  `packages/bee-adapter/src/fixtures` is synthetic — invented names, invented
  text, invented IDs — specifically so this public repository never ships
  with anyone's real conversations, facts, or todos.

## Defense in depth in the console output

Even though summaries and fact/todo text are already Bee-generated
prose rather than raw structured PII fields, the presenter
(`packages/cli/src/presenter.ts`) applies a redaction pass — masking
email-address- and phone-number-shaped substrings — before truncating and
printing anything. Redaction runs *before* truncation specifically so a
truncation cut can never split a match and leak half of it.

## What a future phase must revisit

Persistence, multi-source data, and AI-driven extraction are explicitly
out of scope for Phase 0 (see the repository-level constraints in the
project brief). When a future phase introduces any of them, it should:

- Treat "no persistence by default" as the default to opt out of, not the
  other way around — an explicit, user-initiated action should be required
  before any Bee-derived data is written anywhere.
- Keep raw transcript content out of anything that leaves the user's own
  machine unless the user has explicitly asked for that.
- Continue keeping synthetic-only fixtures in this repository regardless
  of what real data the running application may later handle.
