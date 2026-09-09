CueNexa Loop — Phase 0 Audit & Remediation

Project: CueNexa Loop
Repository: mrdzyn/cuenexa-loop
Phase: Phase 0 — Bee Integration Foundation
Branch: phase-0-foundation
Pull Request: PR #1 — Phase 0: Bee integration foundation
Status: Remediation Required Before Merge
Audit Date: 2026-09-08

1. Purpose

This document defines the remediation requirements identified during the independent audit of CueNexa Loop Phase 0.

Phase 0 establishes the privacy-first data foundation for CueNexa Loop.

The intended architecture is:

Apple Watch
    ↓
Bee
    ↓
Bee authenticated developer environment
    ↓
@beeai/cli/lib
createBeeClient()
    ↓
@cuenexa-loop/bee-adapter
    ↓
CueNexa Loop normalized contracts
    ↓
Privacy-safe local CLI

Phase 0 ends at normalized data access.

It must not yet implement:

Loop intelligence

AI extraction

commitment detection

decision detection

delegation detection

semantic correlation

persistence

database storage

AWS

Amazon Bedrock

Strands

AgentCore

frontend UI

production deployment

2. Audit Result

Phase 0 is not approved for merge yet.

The initial implementation established a solid TypeScript monorepo and adapter boundary, but several issues must be corrected before PR #1 can be merged.

Primary blockers:

Bee Fact and Todo schemas do not fully match the current Bee interfaces.

Conversation transcript nesting is modeled incorrectly.

Default console output exposes conversational content.

Sensitive-data .gitignore protections are incomplete.

The custom Bee proxy integration should be replaced by the supported Bee Node library.

The live Bee acceptance test is incomplete.

The Phase 1 loop-engine package boundary is missing.

CI should be established before merging the foundation.

3. Remediation Rules

Work only on the existing branch:

phase-0-foundation

Update the existing:

PR #1

Do not:

create another branch

create another PR

merge PR #1

implement Phase 1 functionality

commit private Bee data

commit credentials

commit raw Bee exports

4. Replace the Custom Bee Proxy Integration

Requirement

Use Bee's supported reusable Node library as the primary integration.

The current Bee package exposes:

import { createBeeClient } from "@beeai/cli/lib";

Expected usage:

const bee = createBeeClient();

await bee.api.now();
await bee.api.facts.list();
await bee.api.todos.list();
await bee.api.conversations.list();
await bee.api.conversations.get(id);

Add:

@beeai/cli

as the appropriate dependency.

The locally authenticated Bee CLI environment should remain responsible for authentication.

CueNexa Loop must not handle Bee credentials directly.

Required Architecture

Replace:

CueNexa Loop
    ↓
custom HTTP client
    ↓
bee proxy

with:

CueNexa Loop
    ↓
@beeai/cli/lib
    ↓
Bee authenticated CLI environment

The Bee-specific implementation must remain behind:

@cuenexa-loop/bee-adapter

No Bee response shape should leak into the rest of the application.

Proxy Fallback

If the existing proxy implementation is retained:

it must not be the primary runtime architecture

it must be explicitly documented as optional or fallback

its existence must have a clear justification

Do not require users to run:

bee proxy

for the normal CueNexa Loop workflow if the official Node library provides the required functionality.

5. Correct Bee Fact Schema

Current Bee fact records include fields such as:

id
text
tags
created_at
confirmed

Update the Bee raw types and normalizer accordingly.

Required Mapping

created_at → capturedAt
confirmed  → status

Normalize status as:

confirmed === true  → confirmed
confirmed === false → pending

Do not rely primarily on:

timestamp
confirmation_status

unless retained as explicit compatibility fallbacks for older Bee versions.

A valid confirmed Bee fact must not normalize as:

unknown

6. Correct Bee Todo Schema

Current Bee Todo records include fields such as:

id
text
created_at
alarm_at
completed

Required Mapping

created_at → createdAt
alarm_at   → dueAt
completed  → status

Normalize:

completed === true  → completed
completed === false → open

Compatibility fields may be supported where useful, but current Bee fields must be authoritative.

7. Correct Conversation Structure

Do not model:

transcriptions[]

as though each transcription were directly an utterance.

Current conversation details contain a nested structure similar to:

conversation
  id
  start_time
  end_time
  device_type
  summary
  short_summary
  state
  created_at
  updated_at
  primary_location

  transcriptions[]
    id
    realtime

    utterances[]
      id
      realtime
      start
      end
      spoken_at
      text
      speaker
      created_at

Required Normalization

Flatten:

transcriptions[].utterances[]

into:

LoopConversation.utterances[]

Prefer:

spoken_at

for the normalized spoken timestamp.

Use:

start

as an appropriate fallback.

Do not silently discard nested utterances.

8. Conversation Response Wrappers

Bee conversation detail APIs may return objects wrapped under:

conversation

The adapter must handle the real response wrapper correctly.

For example:

{
  "conversation": {
    "id": 123
  }
}

must result in the actual normalized conversation rather than treating the wrapper itself as the conversation.

Add regression tests for this.

9. Update Synthetic Bee Fixtures

All repository fixtures must remain synthetic.

Do not use:

real Bee transcripts

real Bee facts

real Bee Todos

real IDs

real names

real locations

real account information

Synthetic fixtures should mirror the current Bee structures closely.

Create representative fixtures for:

conversation list response

full conversation response

nested transcription/utterance response

fact list response

Todo list response

empty responses

missing fields

malformed fields

pagination metadata

Use clearly fictional values.

Example:

Speaker A
Speaker B
123 Fictional Avenue
Sampletown
fact_synthetic_001
todo_synthetic_001

10. Strict Privacy-by-Default Output

This is a mandatory Phase 0 requirement.

Default output must not display:

conversation summaries

detailed summaries

transcript text

fact text

Todo text

speaker names

people's names

addresses

latitude

longitude

other conversational content

Default output may contain:

counts

source

IDs

timestamps

status

device type

metadata-presence indicators

normalization status

warning counts

Example default output:

CueNexa Loop — Bee Connectivity Check

Bee connection: OK
Conversations: 5
Facts: 12
Todos: 3
Normalization warnings: 0
Normalization: OK
Private content printed: NO

The purpose is structural verification, not data inspection.

11. Explicit Content Mode

If developer content inspection is useful, provide an explicit flag such as:

--include-content

Content must never appear unless this option is deliberately supplied.

When content mode is enabled:

redact email addresses

redact phone numbers

truncate long values

do not print precise latitude

do not print precise longitude

Example:

npm start -- --include-content

The exact interface may differ if a cleaner CLI design is chosen.

The important requirement is:

Private content requires deliberate user opt-in.

12. Privacy Tests

Tests must prove that default output does not contain any synthetic content strings.

Specifically verify that default output excludes fixture:

summaries

transcript text

fact text

Todo text

names

addresses

coordinates

Do not merely test email and phone number redaction.

The default output should contain no conversational prose at all.

If --include-content exists, separately test:

explicit content display

email redaction

phone redaction

truncation

coordinate suppression

13. Harden .gitignore

Ensure the root .gitignore contains:

.env
.env.*
!.env.example

data/
tmp/
exports/
bee-data/
bee-sync/

*.sqlite
*.sqlite3
*.db

node_modules/
dist/
coverage/

Retain other useful Node-specific ignore patterns already present.

The repository is public.

Accidental Bee exports, local databases, or experimental data must be difficult to commit.

14. Implement the Real bee:check

The command:

npm run bee:check

must become the actual Phase 0 live acceptance test.

It must use the same official Bee adapter that the application uses.

It should:

connect through the authenticated Bee environment

verify Bee connectivity

fetch conversations

fetch facts

fetch Todos

normalize the results

count normalization warnings

report structural success

print no private content

Expected output:

CueNexa Loop — Bee Connectivity Check

Bee connection: OK
Conversations: N
Facts: N
Todos: N
Normalization warnings: N
Normalization: OK
Private content printed: NO

Do not output:

raw JSON

transcripts

summaries

facts

Todo descriptions

15. Bee Check Error Handling

Handle at least:

Bee CLI unavailable

Bee authentication missing

Bee command failure

malformed Bee JSON

invalid response wrapper

empty conversations

empty facts

empty Todos

Errors must be actionable and privacy-safe.

For example:

CueNexa Loop could not access Bee.

Verify that:
1. Bee CLI is installed.
2. You have completed `bee login`.
3. Your Bee session is valid.

Do not dump raw response bodies.

Do not print credentials.

16. Add Loop Engine Package Boundary

Create:

packages/loop-engine/

This package establishes the architectural boundary for Phase 1.

It may define only placeholder domain concepts.

Allowed types include:

Commitment
Decision
Delegation
FollowUp
Deadline
OpenQuestion
Loop

For example:

export type LoopItemType =
  | "commitment"
  | "decision"
  | "delegation"
  | "follow_up"
  | "deadline"
  | "open_question";

No actual detection may be implemented yet.

Explicitly forbidden:

keyword matching

heuristic extraction

AI extraction

LLM integration

embedding search

semantic matching

confidence scoring

cross-conversation inference

Those belong to Phase 1.

17. Node Runtime Requirement

Use:

Node.js 22+

Update:

"engines": {
  "node": ">=22"
}

Align:

@types/node

with the intended runtime where appropriate.

Update README prerequisites.

18. Improve Contract Validation

CueNexa Loop uses Zod contracts.

Where practical, normalized records should be validated against these contracts before leaving the Bee adapter.

Avoid returning arbitrary unchecked objects.

The normalization design should remain resilient.

When Bee supplies malformed data:

Bee response
    ↓
Normalizer
    ↓
safe fallback
+
NormalizationWarning
    ↓
validated CueNexa contract

Do not use broad any types except at tightly controlled external-data boundaries where unavoidable.

19. Pagination Awareness

Bee list APIs support cursor-based pagination.

Phase 0 does not need full historical synchronization.

However, the adapter must not silently imply that a page is the complete dataset.

Prefer an abstraction such as:

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

or equivalent.

Preserve:

next_cursor

where returned.

Phase 0 may still only fetch the first page.

Document this limitation clearly.

Do not implement historical synchronization yet.

20. GitHub Actions CI

Create a lightweight GitHub Actions workflow.

Suggested path:

.github/workflows/ci.yml

Trigger on:

pull_request:
push:
  branches:
    - main

Use Node.js 22.

Run:

npm ci
npm run typecheck
npm test
npm run build

CI must not:

authenticate to Bee

access a real Bee account

contain Bee credentials

run live Bee tests

All CI tests must use synthetic fixtures only.

21. Friction Log

Create:

docs/FRICTION-LOG.md

Use this structure:

Date

Task

Steps Taken

Expected Result

Actual Result

Severity

Workaround

Actionable Suggestion

Include the actual setup friction encountered:

Bee CLI npm Postinstall Script Warning

Document generically that installing:

@beeai/cli

produced an npm warning indicating that the package's postinstall script was initially not allowed by the local npm security configuration.

Document:

what was being attempted

expected behavior

actual behavior

effect

workaround

suggested developer-experience improvement

Do not include:

local username

computer name

filesystem paths

account IDs

authentication data

private Bee data

Preserve useful friction findings from the existing developer-friction documentation.

22. README Requirements

Update README.md to reflect the actual Phase 0 architecture.

Include:

CueNexa Loop

Suggested description:

Bee remembers what happened. CueNexa Loop helps you understand what remains unfinished.

Explain that later phases will identify:

commitments

decisions

delegations

follow-ups

deadlines

open questions

unresolved conversational loops

Clearly state that Phase 0 only implements:

Bee connectivity

Bee adapter

normalization

privacy-safe local verification

23. README Architecture

Document:

Apple Watch
    ↓
Bee
    ↓
Bee CLI authenticated environment
    ↓
@beeai/cli/lib
    ↓
CueNexa Loop Bee Adapter
    ↓
Normalized Contracts
    ↓
Privacy-Safe CLI

24. README Prerequisites

Document:

Node.js 22+

npm

Bee app

Bee account

Bee Developer Mode

Bee CLI

authenticated Bee CLI session

Do not instruct users to run a Bee proxy unless that functionality remains as an optional fallback.

25. Architecture Documentation

Update:

docs/ARCHITECTURE.md

Document the package boundaries:

@cuenexa-loop/contracts
@cuenexa-loop/bee-adapter
@cuenexa-loop/loop-engine
@cuenexa-loop/cli

Contracts

Provider-independent normalized objects.

Bee Adapter

Responsible for:

official Bee integration

interpreting Bee responses

schema adaptation

normalization

pagination metadata

normalization warnings

Loop Engine

Reserved for future intelligence.

No implementation in Phase 0.

CLI

Responsible for:

orchestration

privacy-safe output

live acceptance check

26. Bee Integration Documentation

Update:

docs/BEE_INTEGRATION.md

Document:

@beeai/cli/lib

createBeeClient()

authenticated Bee CLI environment

conversations

facts

Todos

current pagination behavior

conversation-detail nesting

adapter normalization boundary

synthetic-only testing

Document any compatibility fallbacks explicitly.

27. Privacy Documentation

Update:

docs/PRIVACY.md

Phase 0 principles:

No Persistence

No Bee content is written to disk.

No Real Data in Repository

Fixtures are synthetic.

No Content in Default Output

Default CLI output contains structural information only.

Explicit Inspection

Private content requires deliberate opt-in.

No Cloud Processing

Phase 0 sends no CueNexa Loop data to:

AWS

Bedrock

analytics

telemetry services

third-party APIs

Future Cloud Features

Any future cloud processing must require explicit user consent and be documented separately.

28. Security Documentation

Update:

docs/SECURITY.md

Cover:

Bee authentication stays managed by Bee tooling

CueNexa Loop does not store Bee credentials

no hardcoded secrets

no raw transcript logs

no production network service

no cloud dependency

dependency hygiene

public repository safety

safe error handling

synthetic test fixtures

secret scanning recommendations

29. Required Tests

Tests must cover at least the following.

Fact Normalization

Verify:

created_at
confirmed

map correctly.

Todo Normalization

Verify:

created_at
alarm_at
completed

map correctly.

Conversation Normalization

Verify:

transcriptions[].utterances[]

are flattened correctly.

Verify timestamps using:

spoken_at

with:

start

fallback where appropriate.

Wrapped Conversation Response

Test:

{
  "conversation": {}
}

handling.

Missing Fields

Verify malformed or missing optional fields produce safe values and normalization warnings instead of unhandled exceptions.

Empty Lists

Verify:

conversations: []
facts: []
todos: []

are legitimate successful responses.

Privacy

Default output must not contain any synthetic:

summary

transcript

fact

Todo

address

coordinates

names

Explicit Content Mode

If implemented, verify content only appears with explicit opt-in and remains redacted.

30. Required Local Validation

Before completing remediation, run:

npm ci
npm run typecheck
npm test
npm run build

Every command must succeed.

If linting exists, also run:

npm run lint

Fix all errors before pushing.

31. Repository Inspection

Before commit, inspect:

git diff
git status

Check for:

API tokens

authentication material

Bee exports

private transcripts

personal facts

personal Todos

real conversation IDs

database files

.env files

machine-specific paths

None may be committed.

32. Live Bee Verification

Synthetic tests alone do not constitute full Phase 0 acceptance.

After remediation has been pushed, the repository owner must manually run:

npm run bee:check

against their already-authenticated Bee environment.

The output must be privacy-safe.

Do not commit the live output.

Do not use the resulting private data as test fixtures.

33. Git Workflow

Remain on:

phase-0-foundation

Commit remediation with:

fix: align Phase 0 with Bee runtime and privacy requirements

Push to:

origin/phase-0-foundation

This should update:

PR #1

automatically.

Do not merge the PR.

34. Phase 0 Merge Acceptance Criteria

Phase 0 may be considered ready for independent re-audit only when all of the following are complete:

official @beeai/cli/lib integration is used

createBeeClient() is used through the Bee adapter

custom proxy is no longer required for normal operation

Fact schema uses current Bee fields

Todo schema uses current Bee fields

nested conversation transcripts are correctly handled

wrapped conversation responses are handled

synthetic fixtures mirror current Bee structures

real Bee data is absent from the repository

default CLI output contains no private conversational content

optional content viewing requires explicit opt-in

.gitignore includes Bee/export/database protections

npm run bee:check uses the real Bee adapter

packages/loop-engine exists

no Loop inference exists yet

Node requirement is 22+

Zod contract validation is used appropriately

pagination metadata is preserved

docs/FRICTION-LOG.md exists

real npm postinstall friction is documented

GitHub Actions CI exists

CI uses Node 22

CI uses synthetic tests only

npm ci passes

npm run typecheck passes

npm test passes

npm run build passes

no secrets are present

no private Bee data is present

remediation is pushed to PR #1

PR #1 remains unmerged

repository owner is instructed to run the live Bee acceptance test

35. Explicitly Out of Scope

Do not implement any of the following while resolving this audit:

React
Vite
Web dashboard
SQLite
DynamoDB
Cloudflare
AWS Lambda
Amazon Bedrock
Strands
AgentCore
MCP server
AI extraction
Commitment detection
Decision detection
Delegation detection
Follow-up detection
Deadline inference
Open-question inference
Context graph
Semantic search
Cross-conversation correlation
Leadership insights
Bee Todo write-back
CueNexa Windows integration
Production deployment

Those belong to later phases.

36. Final Implementation Report

After completing remediation, return the following sections exactly.

1. Commit

Provide:

branch

commit SHA

2. Files Changed

List important files only.

3. Bee Integration

Explain:

how @beeai/cli/lib is used

where createBeeClient() is instantiated

how authentication is inherited

how the Bee adapter isolates Bee-specific behavior

4. Schema Corrections

Summarize:

Fact changes

Todo changes

Conversation changes

transcript nesting

timestamp handling

wrapper handling

pagination handling

5. Privacy Behavior

Explain:

default output

whether --include-content exists

redaction behavior

what is never printed

6. Tests

Report:

Total:
Passed:
Failed:

Describe important new coverage.

7. Validation

Report the results of:

npm ci
npm run typecheck
npm test
npm run build

8. CI

Provide:

workflow path

Node version

commands executed

confirmation that no live Bee account is used

9. Remaining Limitations

List all known Phase 0 limitations.

Do not hide unresolved issues.

10. Live Acceptance Test

Provide the repository owner this exact command:

npm run bee:check

Describe the expected privacy-safe success output.

11. PR Status

Confirm:

PR #1 updated
PR #1 NOT merged

Do not merge PR #1.

Do not implement Phase 1.