# L01 transient-diagnostic phase trace

Date: 2026-10-07. Parent revision:
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.

This is observability for the already default-off transient L3 diagnostic
experiment. It changes neither diagnosis semantics nor admission/eviction
policy. The phase trace additionally requires
`ARKTS_L01_TRANSIENT_DIAGNOSTICS_TRACE=1` alongside
`ARKTS_BENCHMARK_CONTROL=1` and `ARKTS_L01_TRANSIENT_DIAGNOSTICS=1`.

## Public RED

Extended the real child-process, Content-Length LSP transcript in
`tests/semantic/semantic-l3-reference-admission.test.mjs`. It still requires
the exact version-2 compiler diagnostic for an undefined name in the unsaved
overlay and no new resident diagnostic context. After the LSP process exits,
the test requires a correlated parent/verifier phase sequence, process/thread
identity, monotonic and epoch timestamps, memory fields, and no source URI in
the trace.

```bash
node --test tests/semantic/semantic-l3-reference-admission.test.mjs
```

Before implementation: **RED**, 2 pass / 1 fail. The diagnostic itself was
correct, but the version-2 phase list was empty. The trace assertion failed
at `one diagnostic trace connects parent and verifier phases`.

## Minimal GREEN

The parent emits spawn, response and terminate phases; the transient worker
emits configure, sync, diagnose and dispose start/end phases. Every entry is
structured JSON with a request-local `traceId`, document version, epoch
milliseconds, monotonic nanoseconds, Node PID, thread ID, process-wide RSS and
thread-local V8 heap-used bytes. No absolute path, URI, source text or symbol
name is emitted. A lazy structured logger writes both stderr and the normal
server log only when the three opt-in flags are enabled.

The first implementation run remained RED because the LSP test transport
intentionally retains only the head and tail of stderr; the middle worker
phases were dropped from that bounded view. The test now checks stderr output
exists, and reads the complete phase sequence from the normal structured log.
This does not weaken or bypass the public LSP diagnosis assertion.

After `pnpm build`, the same public test was **GREEN**, 3/3. `pnpm check`
passed. The trace test demonstrates that two thread IDs share one Node PID;
the process RSS values therefore must not be summed. It does not measure a
real-project memory benefit, establish PSS, or admit L01/L02 for production.
