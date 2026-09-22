# Security Policy

## Supported versions

CueNexa Loop is currently an early-stage open-source project. Security fixes are applied to the latest code on the `main` branch unless a supported release line is documented later.

| Version | Supported |
| --- | --- |
| Latest `main` | Yes |
| Older commits / unreleased snapshots | No |

## Reporting a vulnerability

Please **do not open a public issue, discussion, or pull request containing vulnerability details**.

Use GitHub's private vulnerability reporting / Security Advisory flow for this repository when available:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the information listed below.

If private vulnerability reporting is not available, contact the repository owner privately using a contact method published on their GitHub profile. Do not disclose exploit details publicly while trying to establish contact.

A useful report includes:

- a concise description of the issue;
- affected component(s), file(s), or commit(s);
- reproducible steps or a minimal proof of concept;
- expected versus observed behavior;
- potential security/privacy impact;
- any known prerequisites or limitations;
- suggested mitigation, if known.

## Privacy-sensitive reporting

CueNexa Loop is designed around data minimization. When reporting a vulnerability:

- do not include real Bee credentials, session tokens, API keys, or authentication material;
- do not include real conversation transcripts, summaries, utterances, evidence, or precise location data;
- prefer synthetic fixtures and redacted examples;
- remove secrets from logs, screenshots, traces, and proof-of-concept material before submission.

If reproducing the issue requires real Bee data, describe the minimum reproduction steps privately and avoid attaching raw personal content unless absolutely necessary.

## Scope

Security reports are especially welcome for issues involving:

- leakage or persistence of Bee-derived conversation content;
- exposure of credentials or authentication material;
- bypass of local privacy boundaries;
- unsafe realtime-to-persistent-state transitions;
- cross-conversation or identity-mapping confusion with security/privacy impact;
- unauthorized mutation, deletion, or resolution of persistent `LoopThread` state;
- command injection, path traversal, unsafe file/database handling, or local privilege issues;
- dependency or supply-chain vulnerabilities that are exploitable through CueNexa Loop;
- GitHub Actions or repository automation that could expose secrets or permit unauthorized changes.

Reports about upstream Bee, GitHub, Node.js, npm, or third-party packages should normally be reported to the relevant upstream project unless the vulnerability is specifically exploitable through CueNexa Loop's implementation or configuration.

## Disclosure and remediation

The maintainer will validate reports against the current repository state and coordinate remediation through a private security advisory when appropriate.

Please allow reasonable time for investigation and remediation before public disclosure. Once a fix is available, disclosure timing should be coordinated so users can update safely.

## Security architecture

CueNexa Loop's security and privacy boundaries are documented in:

- `docs/SECURITY.md`
- `docs/PRIVACY.md`
- `docs/ARCHITECTURE.md`
- `docs/BEE_INTEGRATION.md`

The repository's core security posture includes local-first persistence, processed Bee history as the authority for durable state, memory-only provisional realtime awareness, deterministic core detection/correlation, and avoidance of raw conversation-content persistence.
