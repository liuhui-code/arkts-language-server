# OP00: Reuse current SDK syntax in the serial reference verifier

Decision: [ADR 0016](../adr/0016-reference-verifier-sdk-cache.md).
Parent revision: `a111235bc4bfcb55b126752f95b3ba095f2996af`.
The workspace already contained OP00–OP06 work; its exact pre-change sources and 82 runtime files were preserved under `.bench/op00-sdk-cache-v1/baseline.sources.jsonl` and `baseline-dist/`. This change is measured against that workspace, not a clean checkout of HEAD.

## RED → GREEN

Run with Node `/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node`:

```sh
node --test tests/semantic/references-sdk-cache.test.mjs
```

The first real child-process, Content-Length framed LSP test returned the complete expected Location sets for both declaration policies, then failed because the genuine compiler parse entrypoint parsed the same SDK declaration **8 times instead of 1** (`red.log`, 5.894 seconds). The compiler observer only records real parser invocations; it replaces no input or compiler result. After retaining SDK Registry leases in one serial Worker, the initial test passed in 2.568 seconds (`green-first.log`). Project files are still parsed repeatedly, proving this is not full project Program retention.

The public test also verifies an unnotified same-path SDK byte replacement despite constant host version `0`, changed ETS loader parsing options, a fresh unsaved overlay Location, SDK configuration replacement, exact updated SDK definition URI, and physical cached Worker retirement. A second RED (`trace-red.log`) failed on missing `workerReused`; GREEN distinguishes cold startup from subsequent reused Worker jobs. The manifest contract failed before registering the new test and passed after adding it to bundle-e2e (218 total entries, 211 fast).

The focused public regression run passed **14/14** (`focused-after-receipts.log`): real Worker metrics with tracing on/off, cancellation and exact recovery, shared RSS policy, module-resolution proof reuse, SDK directory mutation rejection/recovery, full batched-versus-legacy Location sets and actual Registry release before successful/rejected publication. Updated release receipts count only the current job and distinguish SDK pins from non-SDK leases. Non-SDK leases are zero before either response is published; one pinned SDK lease per cached SDK file remains intentionally.

## Original 403-file transcript

The original `tests/semantic/references-completeness.test.mjs` is unchanged. The filtered case passed with **all four original Location oracles and original 20,000 ms deadlines**, taking 9.772 seconds for the entire case (`original-403.log`). The preceding unchanged production baseline failed request 2 at 20 seconds; diagnostic history is in [OP00 attribution](op00-query-layer-attribution.md).

A separate transport/Worker observation (`observed-403.*`) also passed. Its heavy requests took 6,930.92 ms and 4,248.67 ms; the repeated complete-result cache hits took 1.74 ms and 1.44 ms. It observed **one physical verifier Worker, 14 completed jobs, and all 255 SDK files**. Full fast checks were running concurrently during this observed sample; these timings are diagnostic evidence, not a controlled P95 or product SLO result.

## Retained memory

A separate diagnostic preload waits for the disposed job's stack to unwind, performs three GC/event-loop turns, then forwards the unchanged response. It is never used for timing claims (`retained-observer.cjs`, `retained-403.jsonl`). All four original Location oracles still passed. The same Worker processed 14 jobs with 255 SDK files each. Its **total isolate live heap**, including compiler baseline and SDK-reachable objects, stayed between **158.08 and 160.36 MiB**, first 158.17 MiB, last 160.35 MiB. This is not an incremental SDK-only size or a long-soak proof. The separate SDK-only experiment measured approximately 107–118 MiB retained above baseline. Whole-process RSS in this forced-GC sample was 346–362 MiB and includes other isolates and allocator retention.

An additional public test warms the SDK, cancels the next held job, then checks exact overlay references after recovery. It observes a new physical Worker and one new SDK parse, with cached Worker occupancy never exceeding one (`warm-cancellation.log`, 2/2 tests passed).

Pressure-observation checks exposed a missing distinction after changing physical Worker lifetime: old anchor/reference occupancy fields no longer identify per-job activity. The new field assertions failed in `job-activity-new-metric-red.log`. Separate `activeAnchorJobCount`, `activeReferenceJobCount` and their sum now identify job activity; `referenceSdkCacheWorkerCount` and total physical Worker counts remain independent. Idle GC observations require both no transient verifier and no active cached-Worker job. The first whole check was deliberately interrupted (exit 130) to finish this observation fix before rebuilding and rerunning; it is not a whole-suite verdict.

The existing owner input-observation CLI then exposed `QUERY_LAYER_WORKER_EXIT_UNOBSERVED`: immediately terminating the outer semantic Worker prevents its retained child Worker's physical exit callback from running. A bounded shutdown handshake now disposes the owner, waits for nested verifier termination, acknowledges completion, then terminates the owner. Worker replacement uses the same drain. This retained the original strict physical-exit witness.

That check next exposed `QUERY_LAYER_COMPILER_REGISTRY_STATS_MISMATCH`: mutating a decorated Registry made its observation proxy count nested wrapper calls twice. The cache now returns a shallow Registry adapter while leaving the supplied Registry untouched. Actual acquire/release counts match the pinned fork's native counters. The updated existing transcript proves multiple fresh project services are all disposed, one SDK SourceFile object per path survives those Programs, and only SDK leases remain in the final pre-exit child receipt. It passed (`observer-contract-green.log`); the physical thread exit is independently recorded. No collector gate was relaxed. The second whole check was also interrupted for this lifecycle fix, rather than treated as a final result.

The final uninstrumented completeness file passed **3/3**, with the unchanged 403-file case taking **9.838 seconds** (`original-completeness-final.log`). A final-artifact diagnostic (`final-diagnostic-403.log`, `final-sdk-parses.jsonl`, `final-retained-403.jsonl`) independently records **255 distinct SDK files, exactly 255 genuine parse calls, maximum one parse per SDK file**, one verifier thread and 14 jobs. GC-after-disposal isolate heap remains **158.07–160.42 MiB**. Diagnostic GC/parser receipts are excluded from latency evidence.

## Source-size migration

The required trace-label update touches the pre-existing 1,349-line `tests/semantic/references-batching.test.mjs`. Its 13 public cases were first GREEN (`batching-characterization.log`). The shared LSP fixture/trace harness was then extracted without changing helper bodies into the 208-line `tests/support/reference-batching-lsp.mjs`. The existing test file shrinks to **1,149 lines** and remains recorded migration debt toward the 500-line limit. This test-only extraction occurred during an earlier interrupted run, before that batching test was dispatched; the final whole run includes the extracted fixture from the start. Its independent after-refactor run and the final whole run cover the extracted fixture. All other source/test/script files changed by this implementation are at or below 500 lines.

The extracted fixture passed the same **13/13** cases after refactoring (`batching-refactor-green.log`). Distinct-document concurrent references also preserve both complete Location sets using one physical SDK Worker and one SDK parse (`concurrent-documents.log`); same-document requests retain the existing latest-request freshness semantics.

The sandboxed whole run could not execute native macOS process sampling (`spawn EPERM`), causing RSS/resource-artifact checks to fail closed. It was stopped; the final whole run uses the permission needed for `ps` sampling. No sampling oracle or resource check was removed or weakened.

A real two-root concurrency transcript exposed the initial client's busy rejection (`multi-root-red.log`, public internal error). A single Promise queue now serializes anchor and final jobs across roots. Its waiting cancellation check rejects a queued request before the other root's held batch publishes; the active root completes exactly and the cancelled root subsequently recovers. All **4/4 SDK-cache cases** passed (`queued-cancellation-green.log`). One allowed-process-sampling whole attempt was interrupted for this correctness fix; it is not a final whole-suite result. No runtime sources will change during the final rerun unless a failing check requires a fix.

The first broad run after the queue fix reached 709 completed checks and exposed one remaining old SDK-zero assertion in `tests/prepared-suite-l3-cli.test.mjs`. The fixture now verifies zero non-SDK leases, one retained SDK cache lease per file, and the expected two-to-one SDK lease transition across disposal. All original natural/explicit L3 recovery and minimum-observation checks remain. The entire file passed **4/4** with native process-sampling permission (`l3-cache-lease-qualification-native.log`). The final complete command is rerun with this qualification included from the start; the interrupted broad run is not counted as a whole PASS.

## Final validation

- `pnpm check:fast`, Node 20.19.5: **1,869/1,869 PASS**, 0 failures, cancellations or skipped cases; process exit **0** (`check-fast-final.log`). This is the complete final-input run, not a merged count from partial runs.
- Original unchanged completeness file: **3/3 PASS**. Its 403-file case takes **9.838 seconds** for all four original queries/oracles, preserving every original **20,000 ms** request deadline.
- Final diagnostic: **255 SDK files / 255 genuine parse calls / one verifier thread / 14 jobs**. Post-disposal, forced-GC total verifier-isolate heap is **158.07–160.42 MiB**; this diagnostic is excluded from normal timing evidence.
- Input audit: **PASS**. All **690 code/input files** and **82 runtime artifacts**, SDK declaration digest, compiler/backend and sidecar identities are identical before and after the final full run. The original completeness transcript source matches the preserved pre-change workspace. The audit lists the 37 intended changed paths; unrelated pre-existing work remains intact.

Raw final audit: `.bench/op00-sdk-cache-v1/audit.json`, SHA-256 `7f01cb219f6496daf328a704727d60c8fb72b0a6693b8bc7ef868335e88ca23f`. It binds the full and focused logs, exact SDK parse records, GC records, original transport frames/deadlines and input snapshots. Retained source-size migration debt is the **1,149-line** batching test recorded above; its extracted fixture is **208 lines**, and all other changed handwritten code meets the 500-line limit.

The implementation adds one SDK syntax cache and a serial job queue, using existing lifecycle/pressure hooks. It adds no cache-budget/LRU framework, project incremental state, verifier parallelism, SDK scope reduction or timeout increases. Broader product SLO and release memory gates remain separate.

## Required 500ms follow-up

The maintainer clarified that **every complete reference response must be within 500ms**. The 20-second deadline above is only the unchanged regression test's hang guard, not the goal. This SDK-cache implementation remains **performance FAIL**: three same-input replays take 5.86–6.01s for the first uncached request and 3.50–3.73s when changing the declaration policy. [The detailed attribution](op00-reference-sdk-cache-attribution.md) records Program readiness at 84.40% of a 9.904s replay and identifies repeated SDK relative-import path/freshness checks as its largest component. It also records the index-cache permission failure and a writable-cache control that still falls back to full search. No production code or public correctness oracle changed during that diagnosis.
