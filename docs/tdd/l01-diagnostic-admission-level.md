# L01 diagnostic admission pressure trace

Date: 2026-10-07. Parent revision:
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`. The worktree already
contained uncommitted L01 work; no reset or production-route change was made.

## One public RED → GREEN slice

The existing real Content-Length LSP child test in
`tests/semantic/semantic-l3-reference-admission.test.mjs` was extended to
require a diagnostic trace correlated with its published version-2 overlay
and the effective worker memory level. With the old built worker, this command
was **RED** (1 pass, 1 fail):

```bash
node --test tests/semantic/semantic-l3-reference-admission.test.mjs
```

The failing assertion was `diagnostic trace identifies the published
overlay`: `undefined !== 2`. The minimal change only adds `documentVersion`
and `memoryLevel` to the existing default-off
`diagnostics.program.complete` event in `src/core/types/type-engine.ts`.
It does not change diagnostic preparation, scheduling, publication, resident
admission, memory thresholds or references results. After `pnpm build`, the
same public test was **GREEN** (2/2); `pnpm check` also passed. The changed
type-engine file remains 496 physical lines, under the repository's 500-line
limit.

This trace is intentionally measured at the synchronous compiler diagnostic
completion boundary. The worker event loop cannot run its memory timer during
that synchronous query, but this is not a durable L3 admission token. The
explicit L3 benchmark control and the automatic RSS policy can change the
effective level between requests. The [pinned Settings follow-up](../reports/2026-10-07-resident-l01-diagnostic-admission-level.md)
tests both an explicit L3 cycle and natural pressure; neither is a resource
gate pass or a reason to silence diagnostics.
