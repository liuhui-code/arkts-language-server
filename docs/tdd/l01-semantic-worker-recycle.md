# L01 explicit semantic Worker recycle after L3

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
The existing dirty worktree was preserved. The control is available only when
both `ARKTS_BENCHMARK_CONTROL=1` and
`ARKTS_L01_SEMANTIC_WORKER_RECYCLE=1` are set. It does not change the
production Worker lifetime or automatically recycle after pressure.

## Public RED

Added `tests/semantic/semantic-worker-recycle.test.mjs`, a real child-process
Content-Length LSP transcript. It opens a disk-backed document, applies an
unsaved version-2 overlay, receives normal versioned diagnostics, checks exact
definition and references, then applies explicit L3 pressure and waits for an
actual `semantic.context.evict` event before requesting Worker recycle.

`node --test tests/semantic/semantic-worker-recycle.test.mjs` was **RED** at
0/1: `-32601 Unhandled method arkts/benchmark/recycleSemanticWorker`.
The baseline semantic and L3 steps passed before the missing control failed.

## Minimal GREEN

The opt-in `arkts/benchmark/recycleSemanticWorker` request returns
`{ recycled: true, oldThreadId, newThreadId }` only after one root is idle,
the old Worker confirms a real L3 context count decrease with no current
resident context or lease, the old thread terminates, and the replacement
Worker acknowledges the current open overlays. Current project and SDK
configuration are supplied when the replacement Worker starts. The parent
exact reference cache is cleared. Monotonic root epochs and Worker identity
checks prevent a retiring thread's exit or error from poisoning the new one.

The public transcripts also check that either missing flag leaves the method
unregistered, a request before L3 returns an explicit `-32600` error, the
same no-edit version-2 definition/references remain exact after recycle, and a
version-3 edit publishes the expected compiler diagnostic. The server exits
cleanly without Worker fatal stderr output.

After implementation: `pnpm check`, `pnpm build`, and the focused real LSP
tests passed (4/4). Adjacent Worker supervision, context lifecycle, and
post-eviction probe tests passed (59/59). `git diff --check` passed. The
over-limit modified source files did not grow: `semantic-worker-proxy.ts` remains 613 lines and
`run-language-server.ts` 838→832 lines. The runtime is 478 lines.

## Timed-out witness regression

A second real child-process transcript uses a benchmark/test-only lost-witness
injection. After actual L3 eviction it starts recycle, waits until the witness
is pending, and sends an unsaved version-2 edit before the witness times out.
The control must return `-32600`, and the still-live old Worker must then serve
the version-2 definition, all three exact references, and its normal compiler
diagnostic. The original implementation was **RED**: the control rejected but
definition returned `[]` rather than the declaration Location. The proxy had
retained the edit in its deferred queue; a later same-version `sync` did not
resend it. The replacement-before-start catch now drains deferred mutations
through Worker acknowledgements before releasing the control. If that drain
fails, the proxy fails closed. The focused test is **GREEN** with 4/4 passing.

This is a single-root safety and correctness experiment, not an L01 resource
or latency gate. It does not force GC, alter memory budgets, change Worker
concurrency, or suppress normal diagnostics. Settings/API24 measurement is
tracked separately.
