# Constructor verifier OS-wait controls

Status: **three original-case controls FAIL; regression remains open**, 2026-09-28.
Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited edits are preserved.
This follows the [module-cache controls](2026-09-28-constructor-worker-module-cache-control.md),
not a new production optimization or a Settings benchmark.

## Question and unchanged contract

The earlier original-entry observer measured child pre-ready wall substantially
above current-thread CPU. These controls distinguish additional resource
activity from application queue waiting without assigning a sole cause.
Ranked predictions were paging/compression, CPU scheduling, bundle IO/GC,
and delayed parent receipt. No hypothesis is graduated to a proven fix.

The unchanged [public constructor test](../../tests/semantic/references-anchor-reuse.test.mjs)
launches the real server through `LspSession` and Content-Length framed stdio.
It has 16 legal files, batch roots 1, normal diagnostics and four profiles:
legacy, indexed-batched, conservative semantic units and trace-off.
References retain their original **30,000 ms** deadline and all constructor,
alias, inherited `super`, `new this()` and own-constructor assertions.
No candidate is excluded to improve timing. SDK paths are deliberately absent
in this existing fixture, not silently substituted in the real project.

All three runs have catalog ready 16/16 and compiler rejection of the proposed
class anchor followed by the complete 15-batch constructor retry. This is
not a missing sidecar index or permanent legacy fallback. Completed retry
Programs observe 2–5 project files, 52 standard-library files and zero SDK
declarations. No production source, test, bundle, SDK policy, cache budget,
Worker lifetime/concurrency, diagnostics or result-completeness rule changes.

Copyable original-loop command, without diagnostic preload or native sampling:

```sh
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
NODE_DISABLE_COMPILE_CACHE=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-concurrency=1 \
  --test-name-pattern='^explicit constructor references preserve their own identity across aliases and inheritance$' \
  tests/semantic/references-anchor-reuse.test.mjs
```

The per-control environments below retain exact commands, temporary roots and
artifact hashes. Observer scripts intentionally refuse existing output roots;
do not rerun them over retained evidence. The command above creates fresh test
fixtures and does not reproduce the diagnostic instrumentation by itself.

## Terminal public results

All controls ran serially. Durations below describe different completed
workloads, not a latency A/B distribution. Wrapper time includes observation
and cleanup; it is not one LSP request.

| Control | Node | Original test / suite / wrapper ms | Terminal |
| --- | --- | --- | --- |
| Prefix resources + two native samples | 26.3.0 | 44,331.364990 / 44,764.717130 / 45,935.871695 | 0 PASS / 1 FAIL, exit 1 |
| Prefix resources, no native sampler | 26.3.0 | 59,388.930271 / 60,381.690583 / 61,413.938639 | 0 PASS / 1 FAIL, exit 1 |
| No prefix/native sampler, runtime control | 20.19.5 | 62,070.652216 / 63,583.403015 / 64,162.823938 | 0 PASS / 1 FAIL, exit 1 |

The first two runs fail at indexed-batched **response 6**, constructor use
`Target.ets`, public zero-based UTF-16 **4:26**, no declaration. The Node20
control completes that response in **15,164.18 ms**, then times out on
**response 7**, the same cursor with declaration included. Its successful
response reaches the original known-reference assertions, not the final
cross-profile exact equality. None of these runs reaches that final equality,
the conservative profile or trace-off. Timeout is not a semantic-diff verdict.

Node26 reports zero cancellations/skips/todos. Node20's runner enumerates
30 tests and reports 29 pattern skips, 1 selected failure, no cancellation/todo.
Those are unmatched tests, not suppressed diagnostic capabilities. The runtime
control changes the actual Node executable and records it explicitly; it does
not repair or certify the frozen Node26 gate. Host conditions are not held
constant, so it cannot establish a Node-version speedup or sole regression cause.

## Resource observer and representative intervals

The [37-line preloader](../../.bench/anchor-reuse-2026-09-28/worker-os-wait-preload.cjs)
is activated only by explicit `NODE_OPTIONS --require` and a diagnostic output
path. It filters original transient verifiers, forwards protocol payloads and
transfer arguments unchanged, and samples entry/ready/result boundaries.
Built-in imports and the entry file append occur before its clock; they still
add request overhead. Ready/result file appends occur after forwarding and can
delay subsequent work. No forced GC or heap snapshot is used.

`process.threadCpuUsage()` is current-thread CPU; `process.cpuUsage()` and
`process.resourceUsage()` cover the whole Node process, including other threads.
The [official Node reference](https://raw.githubusercontent.com/nodejs/node/main/doc/api/process.md)
maps resource fields to `uv_getrusage`; local Darwin `man getrusage` was also
checked. CPU fields overlap. Ready/result readings share a cumulative origin;
never add them as disjoint phases. Faults and context switches do not identify
the triggering Worker or convert directly into milliseconds of waiting.
Zero `fsRead` does not rule out paging or all IO. APIs were actually usable on
Node26 Darwin; the Node20 control does not load this preloader.

| Control / JS thread ID | Child pre-ready wall ms | Thread CPU ms | Whole-process CPU ms | Whole-process major faults | Whole-process involuntary switches |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sampled / 16 | 5,788.240431 | 1,030.666 | 1,274.575 | 1,835 | 28,756 |
| Sampled / 20 | 3,095.174816 | 870.992 | 1,156.190 | 1,571 | 20,235 |
| No native sample / 20 | 1,913.667615 | 967.717 | 1,123.659 | 217 | 18,508 |

These show measured wall/CPU gaps alongside whole-process resource activity,
not an allocation of the gaps to disk, scheduling or GC. Different Workers
and completed-prefix lengths prevent interpreting this table as a speed A/B.

Sampled PID **85006**, trace `36a8013c-89f2-4b98-b66b-94605ff57741`, retains
59 prefix rows: 20 entries, 20 ready, 19 result. Last thread21 has entry/ready
but no result. Server logs retain retry0–7 complete, retry8 start at
25,554.20 ms; no merge/successful response6 is captured.

Resource-only PID **85794**, trace `3c026a0e-bb56-418e-bc54-3c1982978625`,
retains 67 rows: 23 entries, 22 ready, 22 result. Last thread24 has only entry.
Server logs retain retry0–10 complete, retry11 start at26,739.81ms.
This failure shows that the symptom also occurs without native stack sampling;
it does not prove resource observation is free of overhead.

Node20 PID **86045**, failed trace `0d0e7beb-15e9-45a3-8e31-8c5066bb48ad`,
has no preloader, `sample`, `ps` or RSS sampler. Its retained with-declaration
retry0–12 complete; retry13 starts at25,060.14ms. The invocation rejects
inherited `NODE_OPTIONS`, compile-cache and test-verifier-delay settings.
This does not confine the failure to Node26 or to the preloader.

## Native stack samples and limits

The [129-line runner](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-observer.mjs)
accepts marker PIDs only under its private test root. It samples **the whole
LSP PID**, not the JS thread whose marker triggered it. At most two samples
run, never concurrently. The 100ms marker scan, tool attach and symbol handling
can shift observation into ready/result or another batch; JS IDs are not mapped
to native Mach thread IDs. Do not label a sampled stack as the triggering
pre-ready interval solely from the marker.

The requests are `sample 85006 1 5 -file ...`, but command lifetimes are
**9,975.654957 / 8,098.342504 ms**, not one second. Native report1 has only
3 snapshots per listed thread, report2 has119; these sparse/delayed observations
cannot estimate time percentages from the nominal5ms sampling interval.
Whole-process stacks contain CJS/V8 compilation and GC frames; background
condition waits are not proof that the active verifier was waiting there.
The tool can perturb the workload, and no new speed or release-memory claim
follows. Its physical-footprint fields are not an external RSS/PSS curve.

The throwaway runner has no sampler-exit watchdog and awaits tool completion
before copying its open log descriptors. In these runs both tools exit0,
but that script is not production-grade tooling. A hung tool could delay
artifact persistence. Prefix evidence is append-only. Open read-only FDs retain
pre-cleanup files after unlink, but later pathname-based/stderr-only logging
may not be retained; no final scan certifies all markers. Missing prefix
completion cannot prove that a child never finished after client timeout.

## Host pressure, not target attribution

The sampled runner's before/after snapshots record 16GiB physical RAM,
CPU speed limit **62→51%**, and swap used **8,091.00→8,097.50 MiB**.
No thermal/performance warning level is recorded. Over45,266ms, global
4KiB-page counters increase as follows:

| Host-wide counter | Increase |
| --- | ---: |
| Pageins / Pageouts | 497,191 / 3,080 |
| Swapins / Swapouts | 3,923,571 / 3,948,680 |
| Decompressions / Compressions | 2,491,980 / 2,657,571 |

Wired bytes are14,779,219,968→14,803,488,768. These are system observations,
not the server's allocations, page traffic or memory peak. The interval also
includes observer/sampler activity and unrelated processes. No user application
is closed/killed, power setting changed, or system cache cleared. The data
supports substantial host pressure, not proof of an exclusive timeout cause.

## Retained evidence and fingerprints

All links are local diagnostic artifacts, not uploaded benchmark results.

- Sampled: [environment](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/environment.json),
  [terminal summary](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/summary.json),
  [test log](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/test.log),
  [server log](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/indexed-batched.server.log),
  [prefix resources](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/worker-os-wait.ndjson),
  [host/tool timeline](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/observer.ndjson),
  [sample1](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/owned-server-sample-1.txt),
  [sample2](../../.bench/anchor-reuse-2026-09-28/constructor-os-wait-gate-1/owned-server-sample-2.txt).
- Resource-only: [runner](../../.bench/anchor-reuse-2026-09-28/constructor-os-resource-only-observer.mjs),
  [environment](../../.bench/anchor-reuse-2026-09-28/constructor-os-resource-only-gate-1/environment.json),
  [summary](../../.bench/anchor-reuse-2026-09-28/constructor-os-resource-only-gate-1/summary.json),
  [test log](../../.bench/anchor-reuse-2026-09-28/constructor-os-resource-only-gate-1/test.log),
  [server log](../../.bench/anchor-reuse-2026-09-28/constructor-os-resource-only-gate-1/indexed-batched.server.log),
  [prefix resources](../../.bench/anchor-reuse-2026-09-28/constructor-os-resource-only-gate-1/worker-os-wait.ndjson).
- Node20: [runner](../../.bench/anchor-reuse-2026-09-28/constructor-node20-observer.mjs),
  [environment](../../.bench/anchor-reuse-2026-09-28/constructor-node20-off-gate-1/environment.json),
  [summary](../../.bench/anchor-reuse-2026-09-28/constructor-node20-off-gate-1/summary.json),
  [test log](../../.bench/anchor-reuse-2026-09-28/constructor-node20-off-gate-1/test.log),
  [server log](../../.bench/anchor-reuse-2026-09-28/constructor-node20-off-gate-1/indexed-batched.server.log).

| Frozen file | SHA256 |
| --- | --- |
| `dist/server.cjs` | `ebac64e22a90a8ab0d1171f9b50c9a11272fc705569058dce64abc16515aac36` |
| `dist/semantic-worker.cjs` | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| `dist/reference-verifier-worker.cjs` | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| `target/release/arkts-index-sidecar` | `def311dfe2269ecb0b147d9451ae60b09ee1a55f8228b428f57b26923dba05e2` |
| `tests/semantic/references-anchor-reuse.test.mjs` | `102a060cffbc967d2002c6e7b3cfcfd2f723b0a5bfeb7d1e6c354e884824aee9` |

| Diagnostic artifact | SHA256 |
| --- | --- |
| `worker-os-wait-preload.cjs` | `2b64621b09c5a3e4850d0dc2642d7730e51696935cf4ed748d2a8c7268a6241d` |
| `constructor-os-wait-observer.mjs` | `14d1ef137dbdef8429a851d85add6041f3cef2bc646dab8ab5cccd86b3894483` |
| `constructor-os-resource-only-observer.mjs` | `848ef8955771a53715ffb7fcbfd7c3e408c937817034663a5809b01626b8417d` |
| `constructor-node20-observer.mjs` | `09ac1d34902649e42ab056e8753bd6dc0e13ad8de53e144e01c5f80336a31db3` |
| Sampled `worker-os-wait.ndjson` | `5029e2107d80a4f1677b54915bcd8ee5dc784b86b422b8e1ba24f92938d5243e` |
| Sampled `observer.ndjson` | `4ef7c3837dc2ec1cf54812b182109e785b2e04549137ef45fb69afb9eb28dfaa` |
| Resource-only `worker-os-wait.ndjson` | `9dceb8bee620568d135c7d7ea089b4b69590bdeaed0fffd5808e7c9c48490633` |

The [ADR](../adr/0003-reference-verifier-worker-lifecycle.md),
[plan](../plans/2026-09-20-references-latency-execution-plan.md),
[ledger](../plans/references-feature-ledger.md) and
[MoSCoW](../plans/references-moscow.md) retain the open regression gate.
No fresh whole-fast GREEN, constructor exclusion, default promotion, 500ms,
original>3GB reproduction, final memory/PSS or native Windows graduation is
claimed. No commit, push or merge is performed. Next restore a reliable
regression loop or prove a separate source defect before the admission slice;
do not treat host pressure alone as permission to relax the contract.

## Subsequent read-only host preflight

The [08:28–08:33 UTC preflight](../../.bench/anchor-reuse-2026-09-28/host-preflight-20260928-082843.json)
records CPU speed limits **48→55%** and swap used **8,378.75→8,453.50 MiB**.
The first VM snapshot has **14,804,201,472 wired bytes** out of 16GiB RAM.
These sequential system measurements are neither an atomic snapshot nor a
controlled low-pressure replay, and still do not prove an exclusive cause.

The executable-filtered process inventory finds no remaining nvm Node,
ArkTS sidecar or native `sample` process. Separately, the Codex application
has **665 cua helpers**, with aggregate observed RSS **190,268 KiB** on the
second inventory. These are not classified as this test's server processes;
their count/RSS does not explain the host's wired memory or timeout by itself.
No application/helper is terminated and no power/cache setting is changed.

All six frozen runtime/test SHA256 pins still match and `git diff --check`
passes. No new build, LSP replay or whole-fast run is made under this pressure.
The old constructor RED and incomplete regression gate remain, not a new
semantic failure or a repaired performance gate. Obtain a lower-pressure
execution environment before spending another whole-fast/replay cycle;
do not relax deadlines or enable exclusion to bypass this exit condition.

Independent source review also finds no demonstrated redundant rebuild in the
failed complete retry. The executor removes `expectedReferenceAnchor` and all
candidate/support/identity inputs before recursion; the failed verifier has
already completed its `finally` termination. Each retry Worker calls `prepare`
once and, without an expected seed, does not call the runtime's extra `define`.
The service still resolves definitions for its exact references semantics.
Accepted seeds have an additional definition lookup, but this rejected seed
skips references in that first Worker, so it is not that duplication case.
Repeated `getProgram()` calls are not evidence of repeated construction without
a changed generation or compiler trace. No separate source fix is justified
by this review; obtain the environment control rather than guessing a patch.
