# CueNexa Loop — Phase 1A Audit Remediation

**Repository:** `mrdzyn/cuenexa-loop`  
**PR:** #2 — `Phase 1A: Loop detection foundation`  
**Branch:** `phase-1-loop-detection`  
**Audited head:** `d80494f073a3c29a272fb7fbd4443165044e6e4e`  
**Status:** DO NOT MERGE — remediation required

## Scope

Stay on `phase-1-loop-detection` and update PR #2 only.

Do not create another branch or PR. Do not merge. Do not start Phase 1B. Do not add LLMs, cloud, persistence, UI, embeddings, Bee write-back, or cross-conversation correlation.

---

## 1. Blocker — real Bee conversations are not hydrated

The current live `loops:check` path calls the existing Phase 0 `fetchBeeSnapshot()`, which only calls:

- `listConversations()`
- `listFacts()`
- `listTodos()`

Bee's conversation **list** payload is summary-only. Full `transcriptions[].utterances[]` arrive from `conversations.get(id)` / the full conversation endpoint.

So the current real path is effectively:

```text
Bee conversations.list()
  -> summary-only records
  -> normalizeConversation()
  -> utterances: []
  -> Loop engine
  -> no conversation-derived detection
```

The PR's live verification itself reports one real conversation but the only detected item came from the open Bee Todo. That does not prove real conversation detection works.

### Required fix

Add a detection-specific hydration path inside the Bee adapter/service boundary, for example:

```text
conversations.list()
  -> conversation IDs
  -> conversations.get(id)
  -> full conversation detail
  -> normalizeConversation()
  -> LoopConversation with utterances[]
  -> loop-engine
```

`loops:check` must use hydrated conversations. The Loop engine must remain Bee-independent.

Keep `bee:check` list-only if desired.

Requirements:

- full detail fetch before detection
- preserve provenance
- preserve pagination metadata
- no raw transcript logging
- no persistence
- explicit error handling for missing/unreadable detail responses
- bounded concurrency for multiple detail calls

### Required regression test

With a fake Bee client:

1. `conversations.list()` returns a summary with no transcriptions.
2. `conversations.get(id)` returns the same conversation with nested utterances.
3. the detection snapshot hydrates that detail
4. `detectLoopItems()` detects a commitment from the hydrated utterance

This must test orchestration, not just the Loop engine in isolation.

---

## 2. Blocker — completed Bee Todos do not reconcile open conversation commitments

Current behavior discards every non-open Todo before dedup/reconciliation.

That causes:

```text
Conversation: "I'll send the estimate tomorrow."
Completed Todo: "Send the estimate tomorrow"
```

to still produce an OPEN commitment from the conversation.

That conflicts with CueNexa Loop's core purpose: surface what remains unfinished.

### Required fix

Treat completed Todos as internal completion signals.

Suggested pipeline:

```text
conversation/fact action candidates
  + open Todo candidates
  + completed Todo completion signals
  -> deduplication
  -> completion reconciliation
  -> unfinished LoopItems
```

A conservatively matching completed Todo should either suppress the matching unfinished action or mark it resolved and exclude it from the default unfinished count.

Do not surface every completed Todo as a normal Loop item.

### Required tests

```text
Conversation: "I'll send the estimate tomorrow."
Completed Todo: "Send the estimate tomorrow"
Expected: no OPEN unfinished estimate commitment
```

and:

```text
Conversation: "I'll send the estimate tomorrow."
Completed Todo: "Send the invoice tomorrow"
Expected: estimate commitment remains open
```

---

## 3. Blocker — relative deadlines use UTC calendar semantics

The CLI passes `new Date().toISOString()` and the deadline resolver uses UTC day math.

That can make `today`, `tomorrow`, weekday names, and `by end of day` wrong near local-midnight boundaries for users outside UTC.

Example:

```text
Asia/Manila local: Sep 10 01:00
UTC: Sep 9 17:00
User says: "I'll send it tomorrow."
```

The intended local day is Sep 11, but UTC-only math can resolve against Sep 9 and yield Sep 10.

Bee itself exposes timezone context.

### Required fix

Make deadline resolution provider-neutral but explicitly timezone-aware, e.g.:

```ts
interface LoopDetectionInput {
  conversations: LoopConversation[];
  facts: LoopFact[];
  todos: LoopTodo[];
  now: string;
  timeZone: string;
}
```

The Bee adapter/CLI should supply Bee's timezone where available, with the local system IANA timezone as a documented fallback.

Do not silently assume UTC for calendar phrases.

### Required tests

Cover at least:

- `Asia/Manila` around a UTC/local date boundary
- `America/Los_Angeles` around a UTC/local date boundary
- weekday resolution in a named timezone
- `by end of day` in a named timezone

---

## 4. Blocker — invalid dates can roll into another month

The absolute month/day resolver accepts 1–31 and relies on JavaScript `Date`, which normalizes invalid dates.

For example:

```text
September 31 -> October 1
```

That violates the requirement: **Do not invent dates.**

### Required fix

After constructing a date, verify the resulting year/month/day still exactly match the requested calendar date.

If invalid:

```text
dueAt: null
```

while preserving the original `dueAtPhrase`.

### Required tests

- September 31 -> unresolved
- April 31 -> unresolved
- February 30 -> unresolved
- February 29 in leap year -> valid
- February 29 in non-leap year -> unresolved

---

## 5. Precision issue — obvious negation still slips through

Current negation handling misses examples like:

```text
I will never send the proposal.
I will definitely not send the proposal.
I will never follow up with the vendor.
Sarah will not prepare the report.
```

These can be misclassified as positive commitments/follow-ups/delegations.

### Required fix

Expand deterministic negation handling conservatively to cover at least:

- `will never`
- `will ... not` with a short adverbial gap
- first-person negative follow-up
- third-person `will not` / `won't` delegation cases

Do not implement general NLP negation.

Add positive and negative regression tests.

---

## 6. Precision issue — `open_question` currently means “question mark,” not “unresolved”

Detection is sentence-by-sentence and almost every non-rhetorical sentence ending in `?` becomes `open_question`.

Example:

```text
A: "Who owns deployment?"
B: "Alex owns deployment."
```

can still surface an open question even though it was immediately answered.

That conflicts with the product concept and the Phase 1A brief's requirement to identify unresolved questions.

### Required fix

Add a conservative same-conversation question-resolution pass.

This is not Phase 1B cross-conversation correlation.

Suggested flow:

```text
question candidate
  -> inspect later utterances in same conversation
  -> strong resolution evidence?
       yes -> suppress/resolve
       no  -> keep open_question
```

Use precision over recall. No embeddings or LLMs.

### Required tests

```text
"Who owns deployment?"
"Alex owns deployment."
-> no open question
```

and:

```text
"Who owns deployment?"
"No one knows yet."
-> open question remains
```

Keep rhetorical-question tests.

---

## 7. Preserve existing good work

Do not regress:

- provider-independent `loop-engine`
- Zod `LoopItem` validation
- mandatory provenance/evidence
- confidence constants
- candidate -> dedup -> accepted-item pipeline
- hedge suppression
- conservative decisions
- open Todo support
- within-snapshot dedup
- no cross-conversation merging
- privacy-safe default output
- explicit `--include-content`
- redaction/truncation
- synthetic-only automated tests
- no LLM/cloud/persistence
- 0 npm vulnerabilities

---

## 8. Documentation

Update as needed:

```text
README.md
docs/ARCHITECTURE.md
docs/LOOP-DETECTION.md
docs/PRIVACY.md
docs/SECURITY.md
docs/FRICTION-LOG.md
```

Document:

- full-conversation hydration for `loops:check`
- difference between `bee:check` and `loops:check`
- timezone semantics
- completed-Todo reconciliation
- same-conversation open-question reconciliation
- invalid-date behavior
- remaining Phase 1A limitations

Record genuine friction only.

---

## 9. Validation

Run:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm audit
```

All must pass and `npm audit` must report 0 vulnerabilities.

Also manually verify:

```bash
npm run bee:check
npm run loops:check
```

Default output must contain no private conversational content.

For `loops:check`, verify the real hydrated-conversation path executes. If the user's current Bee conversations contain an eligible explicit signal, confirm it can produce a conversation-derived detection. Do not fabricate or expose private text.

---

## 10. Git workflow

Stay on:

```text
phase-1-loop-detection
```

Suggested commit:

```text
fix: complete Phase 1A live detection and reconciliation
```

Push to the existing branch so PR #2 updates automatically.

Do not merge.

---

## 11. Final report

Return:

### 1. Branch / Commit / PR

### 2. Live Conversation Hydration

### 3. Completion Reconciliation

### 4. Timezone-Aware Deadline Resolution

### 5. Invalid-Date Handling

### 6. Negation Improvements

### 7. Open-Question Reconciliation

### 8. Privacy

### 9. Tests

```text
Total:
Passed:
Failed:
```

### 10. Validation

```text
npm ci
npm run typecheck
npm test
npm run build
npm audit
```

### 11. Live Verification

Structural counts/status only. No private Bee text.

### 12. Remaining Limitations

### 13. PR Status

Confirm:

```text
PR #2 updated
PR #2 NOT merged
```

Do not start Phase 1B.
