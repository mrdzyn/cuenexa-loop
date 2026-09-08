# Security

## Trust boundaries

```text
[ Bee account, authenticated via `bee login` ]
                    |
                    | local device auth, handled entirely by the Bee CLI —
                    | this project never sees a credential
                    v
[ bee proxy — 127.0.0.1, unauthenticated by design, local-only ]
                    |
                    | plain HTTP, loopback interface only
                    v
[ @cuenexa-loop/bee-adapter — BeeProxyClient ]
                    |
                    | in-memory only
                    v
[ @cuenexa-loop/cli — redacts, truncates, prints to your terminal ]
```

The Bee proxy is intentionally unauthenticated because it only ever binds
to `127.0.0.1` — Bee's own documentation is explicit that it "should not be
exposed publicly since it provides unauthenticated access to your data."
CueNexa Loop inherits that constraint rather than working around it:
`BeeProxyClient` defaults to `http://127.0.0.1:8787` and nothing in this
codebase binds a port, opens a socket for inbound connections, or proxies
the Bee proxy onward.

## What this means for you as an operator

- Do not run `bee proxy` on a machine, container, or network namespace you
  don't trust every other local process or user on — any local process can
  read your Bee data through it while it's running.
- Do not port-forward, tunnel, or otherwise expose `127.0.0.1:8787` beyond
  loopback. If you need remote access to your Bee data, that's a decision
  to make explicitly and outside this project's scope, not something
  CueNexa Loop should do for you.
- `.env` (if you create one from `.env.example`) only ever holds the proxy
  URL and a display limit — no secrets. `.gitignore` at the repository
  root already excludes `.env*` (`.env.example` is explicitly kept).

## Dependency surface

Phase 0 intentionally keeps runtime dependencies minimal:
[`zod`](https://www.npmjs.com/package/zod) for schema validation in
`@cuenexa-loop/contracts`, and nothing else at runtime — `BeeProxyClient`
uses Node's built-in `fetch`. A smaller dependency tree is a smaller
supply-chain surface for a project that, by its nature, ends up close to
someone's personal data.

## Reporting a vulnerability

This is an early-stage, Phase 0 open-source project with no production
deployment. If you find a security issue, please open a GitHub issue on
this repository describing the concern; avoid including any real Bee data
in the report (see [docs/PRIVACY.md](PRIVACY.md) for why).
