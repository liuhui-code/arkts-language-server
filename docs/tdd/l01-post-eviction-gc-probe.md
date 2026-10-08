# L01 post-eviction GC attribution probe

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`. This is a
benchmark-only attribution intervention, not a production GC policy or evidence
that forcing GC lowers product RSS. It does not change semantic loading,
diagnostics, memory budget, Worker count, or references completeness.

## Public LSP RED → GREEN

The first test used a real `dist/server.cjs --stdio` child and checked normal
automatic diagnostics, exact `ProbeThing` reference locations, an actual
`memory-level3` eviction, then the opt-in post-eviction probe. Before the
implementation:

```sh
node --test tests/semantic/semantic-post-eviction-gc-probe.test.mjs
```

Result: **RED**, 0/1; the exact references and diagnostics completed, but the
post-eviction event did not exist. The implementation then added one hook for
explicit L3 control and one for automatic RSS sampling. The test fixture was
corrected to enable the existing context lifecycle trace so that its eviction
assertion was observable; the public semantic assertions were unchanged.

After building the updated Worker bundle:

```sh
pnpm check
pnpm build
node --test tests/semantic/semantic-post-eviction-gc-probe.test.mjs
```

Result: **GREEN**, 5/5. The five real-child-process cases cover explicit L3,
automatic sampled L3, the disabled default, flag-only without benchmark
control, and GC unavailable. Each case keeps normal diagnostics and exact
references. The disabled cases use an exposed-GC Node child but emit no probe
event. The unavailable case records `inconclusive: gc-unavailable`, never a
false `complete` result. Repeating L3 without another eviction does not start
another probe.

## Probe contract

The probe is enabled only when both `ARKTS_BENCHMARK_CONTROL=1` and
`ARKTS_L01_POST_EVICTION_GC_PROBE=1`. Node must also expose `global.gc` in the
semantic Worker isolate (for example by launching the server with
`node --expose-gc`). An L3 pressure application must actually reduce the
resident context count. Only after that eviction leaves zero contexts and
leases does the probe schedule a later event-loop turn. It rechecks both counts
before collecting; readmission produces a `skipped` event instead. Missing GC
produces `inconclusive`. Without the flags, no GC call is scheduled.

One structured `semantic.post-eviction.gc-probe` event contains the trigger,
status, epoch and monotonic timestamps, process/Worker IDs, evicted/resident/lease
counts, two-GC elapsed time, and before/after Worker heap/external/arrayBuffer
bytes plus **whole Node-process** RSS bytes. It excludes source text and paths.
The Worker RSS must not be added again to the Node PID RSS. Forced-GC heap
collectibility and OS resident-page return are separate observations; this
probe alone cannot establish a live-object leak, PSS improvement, release-gate
pass, or production benefit.
