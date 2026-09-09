# CueNexa Loop — Phase 1A: Loop Detection Foundation

You are continuing the CueNexa Loop project in:

`mrdzyn/cuenexa-loop`

Phase 0 has been completed and merged.

Before starting:

1. Checkout `main`.
2. Pull the latest changes.
3. Confirm Phase 0 builds and tests cleanly.
4. Create a new branch:

```text
phase-1-loop-detection
```

Do not work directly on `main`.

---

# Objective

Implement the first real CueNexa Loop intelligence layer.

Phase 1A must transform normalized Bee-derived data into structured:

- commitments
- decisions
- delegations
- follow-ups
- deadlines
- open questions

The output should be individual `LoopItem` records.

Do NOT implement cross-conversation correlation yet.

Phase 1A ends at:

```text
Bee
 ↓
Bee Adapter
 ↓
Normalized CueNexa Contracts
 ↓
Loop Detection Engine
 ↓
Structured Loop Items
```

Cross-conversation grouping into full Loops belongs to Phase 1B.

---

# Product Principle

CueNexa Loop is not a meeting summarizer or generic todo application.

Its purpose is:

> Bee remembers what happened. CueNexa Loop helps you understand what remains unfinished.

The intelligence layer should therefore prioritize actionable or unresolved conversational signals rather than trying to summarize everything said.

Precision is more important than recall.

It is better to miss a weak possible commitment than create a misleading one.

---

# Privacy Requirements

Maintain Phase 0 privacy guarantees.

Do not:

- persist real Bee data
- commit real conversations
- commit real facts
- commit real todos
- send any data to cloud services
- add AWS
- add Bedrock
- add external LLM APIs
- add telemetry
- add analytics

Tests must use synthetic fixtures only.

Phase 1A must remain local-only.

---

# Architecture

Expand:

```text
packages/loop-engine/
```

The package should depend on normalized CueNexa Loop contracts, never directly on Bee.

Expected boundary:

```text
Bee-specific data
      ↓
bee-adapter
      ↓
LoopConversation / LoopFact / LoopTodo
      ↓
loop-engine
      ↓
LoopItem[]
```

The Loop engine must remain provider-independent.

---

# Core Domain Model

Replace the Phase 0 placeholder types with real Phase 1 domain contracts.

Create a structure similar to:

```typescript
export type LoopItemType =
  | "commitment"
  | "decision"
  | "delegation"
  | "follow_up"
  | "deadline"
  | "open_question";

export type LoopItemState =
  | "provisional"
  | "open"
  | "waiting"
  | "resolved"
  | "dismissed";

export interface LoopItem {
  id: string;

  type: LoopItemType;

  text: string;

  state: LoopItemState;

  confidence: number;

  owner?: {
    label?: string;
  };

  counterparties?: Array<{
    label?: string;
  }>;

  dueAt?: string | null;

  source: {
    provider: string;
    conversationId?: string;
    factId?: string;
    todoId?: string;
    utteranceIndexes?: number[];
  };

  evidence: Array<{
    type: "utterance" | "fact" | "todo";
    sourceId?: string;
    text?: string;
  }>;

  createdAt: string;

  resolvedAt?: string | null;
}
```

Improve the exact model where appropriate.

Use Zod or the existing project contract strategy where suitable.

Do not store raw Bee-specific objects inside Loop items.

---

# Provenance Is Mandatory

Every generated Loop item must be explainable.

For every detection, preserve enough provenance to answer:

> Why did CueNexa Loop think this was a commitment?

Examples:

```text
conversationId
utterance index
fact ID
todo ID
```

Do not rely only on generated text.

Evidence must be traceable back to normalized source records.

---

# Detection Strategy

Phase 1A must implement a deterministic baseline detector.

Do not add an LLM yet.

Implement detection conservatively.

Use structural and linguistic signals rather than broad keyword matching.

The detector may analyze:

```text
LoopConversation
LoopFact
LoopTodo
```

---

# Commitment Detection

Detect strong expressions such as:

```text
I will...
I'll...
I can send...
I'll take care of...
I can follow up...
I'll get this done...
```

Avoid treating:

```text
maybe
perhaps
we should consider
I might
I could possibly
```

as firm commitments.

Example:

```text
"I'll send the revised proposal tomorrow."
```

should produce:

```text
type: commitment
text: Send the revised proposal
state: open
```

---

# Delegation Detection

Detect explicit assignment of responsibility.

Examples:

```text
"John, can you send the estimate?"
"Sarah will prepare the report."
"Please have the operations team verify this."
```

Where possible identify:

```text
owner
```

Do not attempt advanced speaker identity resolution yet.

Names or labels found directly in synthetic source text may be used.

---

# Decision Detection

Detect clear finalized decisions.

Examples:

```text
"We're going with Cloudflare."
"Let's proceed with option B."
"The launch date will be October 15."
"We decided to postpone the rollout."
```

Avoid treating proposals or brainstorming as decisions.

---

# Open Question Detection

Detect unresolved explicit questions.

Examples:

```text
"Who is going to own deployment?"
"Do we know whether legal approved this?"
"When are we sending the estimate?"
```

Do not classify rhetorical questions when clearly identifiable.

---

# Follow-Up Detection

Detect explicit future follow-up intent.

Examples:

```text
"I'll check back next week."
"Let's revisit this on Friday."
"Follow up with the vendor tomorrow."
```

A follow-up may overlap with a commitment.

Avoid duplicate items where the same utterance clearly represents one action.

---

# Deadline Detection

Extract explicit temporal constraints when confidently present.

Examples:

```text
tomorrow
Friday
September 15
by end of day
next week
```

Do not build a sophisticated natural-language date engine yet.

Use a small isolated resolver interface.

If the date cannot be reliably converted into an absolute timestamp:

- retain the phrase in metadata/evidence if useful
- leave `dueAt` null

Do not invent dates.

---

# Bee Todos

Bee Todos should be treated as high-confidence actionable evidence.

A normalized Bee Todo should normally produce or reinforce a:

```text
commitment
follow_up
```

rather than being ignored.

Do not create duplicates when the same action appears in:

```text
conversation
+
Bee Todo
```

Basic deduplication within the same snapshot is required.

---

# Bee Facts

Facts may help provide context but must not automatically become Loop items.

Example:

```text
"Prefers morning meetings"
```

is not an open Loop.

Only convert facts into Loop items when the fact itself represents an actionable or unresolved state.

Keep this conservative.

---

# Confidence

Use a deterministic confidence score:

```text
0.0 - 1.0
```

Do not pretend it is an ML probability.

Document that it represents heuristic detection confidence.

Suggested rough ranges:

```text
0.90–1.00 explicit Todo / explicit commitment
0.80–0.89 strong explicit linguistic signal
0.70–0.79 moderately clear signal
below 0.70 normally suppress
```

Create constants/configuration rather than scattering magic numbers.

Default output should suppress low-confidence candidates.

---

# Candidate vs Accepted Item

Prefer a two-stage design:

```text
Source
 ↓
DetectionCandidate
 ↓
validation / deduplication
 ↓
LoopItem
```

This will make Phase 1B correlation easier later.

Suggested internal type:

```typescript
interface DetectionCandidate {
  type: LoopItemType;
  text: string;
  confidence: number;
  evidence: ...
}
```

Do not expose malformed candidates as final Loop items.

---

# Deduplication

Implement basic within-snapshot deduplication.

Example:

Conversation:

```text
"I'll send the estimate tomorrow."
```

Bee Todo:

```text
"Send the estimate tomorrow"
```

should preferably produce one Loop item with multiple evidence sources, not two separate actions.

Keep deduplication deterministic.

Acceptable Phase 1A techniques:

- normalized text comparison
- token overlap
- conservative similarity

Do not add embeddings yet.

Do not implement cross-conversation deduplication yet.

---

# Negation / Retraction

Account for obvious negation where practical.

Example:

```text
"I'll send it tomorrow."

later:

"Actually, don't send it yet."
```

Phase 1A does not need full temporal reasoning, but avoid obviously treating:

```text
"I won't send it."
```

as a commitment to send it.

Add explicit tests for negative cases.

---

# Engine Interface

Expose a clean API similar to:

```typescript
export interface LoopDetectionInput {
  conversations: LoopConversation[];
  facts: LoopFact[];
  todos: LoopTodo[];
  now: string;
}

export interface LoopDetectionResult {
  items: LoopItem[];
  warnings: DetectionWarning[];
}

export function detectLoopItems(
  input: LoopDetectionInput
): LoopDetectionResult;
```

Improve naming if necessary.

No Bee-specific parameter types.

---

# CLI Integration

Add a safe development command such as:

```bash
npm run loops:check
```

It should:

1. fetch a Bee snapshot through the existing adapter
2. run Loop detection
3. output structural results only by default

Example:

```text
CueNexa Loop — Detection Check

Bee connection: OK

Conversations processed: 5
Facts processed: 12
Todos processed: 3

Commitments: 4
Decisions: 2
Delegations: 1
Follow-ups: 3
Deadlines: 2
Open questions: 1

Total Loop items: 13

Detection warnings: 0
Private content printed: NO
```

Do not print detected text by default.

If the existing:

```text
--include-content
```

pattern can be safely reused, allow:

```bash
npm run loops:check -- --include-content
```

to display redacted/truncated item text and evidence.

Keep privacy behavior consistent with Phase 0.

---

# Synthetic Test Scenarios

Create realistic fictional conversations.

Include at least:

## Explicit commitment

```text
"I'll send the revised proposal tomorrow."
```

Expected:

```text
commitment
```

## Non-commitment

```text
"I might send the proposal tomorrow."
```

Expected:

```text
no commitment
```

## Explicit decision

```text
"We're going with Cloudflare."
```

Expected:

```text
decision
```

## Proposal, not decision

```text
"Maybe we should use Cloudflare."
```

Expected:

```text
no decision
```

## Delegation

```text
"Alex, please prepare the report by Friday."
```

Expected:

```text
delegation
```

with owner label where possible.

## Open question

```text
"Who owns the deployment?"
```

Expected:

```text
open_question
```

## Follow-up

```text
"I'll check with the vendor tomorrow."
```

Expected:

```text
follow_up or commitment
```

according to the documented precedence rules.

Avoid duplicate output.

## Negation

```text
"I won't send the proposal yet."
```

Expected:

```text
no commitment to send
```

## Todo deduplication

Conversation:

```text
"I'll send the estimate tomorrow."
```

Todo:

```text
"Send the estimate tomorrow"
```

Expected:

```text
one Loop item
multiple evidence sources
```

## Noise

Include:

```text
weather
small talk
greetings
filler
```

Expected:

```text
no Loop items
```

---

# Tests

Use Vitest.

Add coverage for:

- commitments
- decisions
- delegations
- follow-ups
- deadlines
- open questions
- uncertain language
- negation
- duplicate suppression
- evidence/provenance
- confidence thresholds
- malformed normalized input where applicable
- privacy-safe CLI output

No test may touch the real Bee account.

---

# Documentation

Add:

```text
docs/LOOP-DETECTION.md
```

Document:

- what Loop Items are
- supported Phase 1A types
- detection philosophy
- precision-over-recall principle
- candidate → validation → LoopItem pipeline
- confidence semantics
- deduplication approach
- limitations
- provenance/evidence
- privacy behavior

Update:

```text
README.md
docs/ARCHITECTURE.md
docs/PRIVACY.md
docs/SECURITY.md
docs/FRICTION-LOG.md
```

only where Phase 1A changes their current statements.

---

# Friction Log

Continue using:

```text
docs/FRICTION-LOG.md
```

Record genuine Bee/developer friction encountered during Phase 1A.

Do not manufacture entries merely to increase the log.

---

# Explicitly Out of Scope

Do NOT implement:

```text
cross-conversation correlation
persistent Loop graph
SQLite
UI/dashboard
React
Vite
mobile app
Bee write-back
Bee Todo creation
semantic embeddings
vector database
LLM APIs
AWS
Bedrock
Strands
AgentCore
leadership analytics
ManagerGym integration
CueNexa Windows integration
automatic actions
notifications
```

Those belong to later phases.

---

# Quality Requirements

Run:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm audit
```

All must pass.

`npm audit` should remain at:

```text
0 vulnerabilities
```

Do not use:

```text
npm audit fix --force
```

without explicit justification.

---

# Live Testing

Do not use real Bee content in automated tests.

After synthetic tests pass, the repository owner will manually run:

```bash
npm run loops:check
```

against their authenticated Bee environment.

Default output must reveal no conversational content.

Do not commit live output.

---

# Git Workflow

Commit to:

```text
phase-1-loop-detection
```

Suggested commit message:

```text
feat: implement Phase 1A Loop detection foundation
```

Push the branch.

Create a PR against:

```text
main
```

Suggested PR title:

```text
Phase 1A: Loop detection foundation
```

Do not merge the PR.

---

# Acceptance Criteria

Phase 1A is ready for audit only when:

- [ ] real `LoopItem` contracts exist
- [ ] candidate detection pipeline exists
- [ ] explicit commitments are detected
- [ ] uncertain commitments are suppressed
- [ ] decisions are detected conservatively
- [ ] proposals are not misclassified as decisions
- [ ] delegations are detected
- [ ] open questions are detected
- [ ] follow-ups are detected
- [ ] deadlines are captured where confidently resolvable
- [ ] obvious negation is handled
- [ ] Bee Todos participate in detection
- [ ] duplicate Todo/conversation actions are merged
- [ ] every item contains provenance/evidence
- [ ] confidence scores are deterministic
- [ ] low-confidence candidates are suppressed
- [ ] loop engine has no Bee-specific dependency
- [ ] no persistence exists
- [ ] no cloud/LLM integration exists
- [ ] default CLI output contains no private content
- [ ] synthetic tests pass
- [ ] typecheck passes
- [ ] build passes
- [ ] npm audit reports 0 vulnerabilities
- [ ] documentation is updated
- [ ] PR is created
- [ ] PR is NOT merged

---

# Final Report

When complete, return:

## 1. Branch / Commit / PR

## 2. Architecture

## 3. LoopItem Contract

## 4. Detection Rules

## 5. Deduplication

## 6. Provenance and Evidence

## 7. Privacy Behavior

## 8. Tests

Report:

```text
Total:
Passed:
Failed:
```

## 9. Validation

Report:

```text
npm ci
npm run typecheck
npm test
npm run build
npm audit
```

## 10. Known Limitations

## 11. Live Test

Give the repository owner:

```bash
npm run loops:check
```

## 12. PR Status

Confirm the PR is open and NOT merged.

Do not start Phase 1B.
