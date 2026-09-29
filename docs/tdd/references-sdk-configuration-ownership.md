# R-10 caller-owned SDK configuration capture

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; existing edits preserved.
Follows [managed candidate freshness](references-candidate-snapshot.md) and
[ADR 0005](../adr/0005-index-proof-trust-boundary.md).

## Public ownership boundary

`configureSdk` must retain an operation-owned SDK selection, not a live alias
to the caller's object. The Worker receives copied configuration messages; if
the Node source-proof path retains caller references, an in-place SDK-path
mutation without another configure call can change Node discovery while the
Worker still uses the originally selected SDK. A managed revision counter
cannot detect that unannounced caller-object mutation.

This slice covers SDK configuration only. It does not repair project-selection
ownership, promote constructor narrowing or add complete source-availability
admission. Preserve omitted/undefined, null, empty and invalid explicit values;
an invalid explicit selection must not become default fallback. No production
default, SDK profile, Worker lifetime, memory budget or diagnostic change.

## GREEN control, then actual RED

The public fixture uses actual `SemanticWorkerEngine`, semantic Worker/compiler
and an external NDJSON sidecar fixture. It is not an actual Rust semantic index,
framed-LSP certification, Windows reproduction or a 500 ms benchmark.

Without caller mutation, configured SDK source proof is GREEN: **1/1 PASS**,
1,584.376 ms test duration, 1,819.165 ms total. Raw control:
`.bench/anchor-reuse-2026-09-27/configuration-sdk-control-canonical.log`.
The earlier control failed only because its expected URI used `/var` while
the existing canonical transport returned `/private/var`; fixing that fixture
expectation establishes the control, not a production RED. Preserve the log:
`.bench/anchor-reuse-2026-09-27/configuration-sdk-control.log`.

Actual new SDK ownership RED: **1/1 FAIL**, 1,940.653 ms test duration:
`.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-red.log`.

1. Configure an identified fixture SDK, API24/component6.1.1.125.
2. Public hover confirms the real Worker selected that original SDK, ready=true.
3. Start references, hold external candidate status, then mutate only the
   caller's configuration object's path to a missing SDK. No configure call,
   authoritative source edit or revision advance occurs.
4. Release status and inspect the public sidecar request/source-proof observations.

The Node path reports resolvedBindings=0/unresolvedSdkBindings=1 and sends
zero SDK-terminal proof retries rather than the required one. The Worker still
uses its copied original SDK. Complete conservative verification returns the
same five exact references; this RED does **not** demonstrate missing Locations.
It demonstrates configuration split ownership and lost proof/fallback cost.

Independent repeat RED is **1/1 FAIL**, 2,181.408 ms test duration,
2,466.819 ms total; raw `configuration-sdk-owner-red-repeat.log` in the same
artifact directory. It repeats the Node/Worker split, not a wrong reference set.

## Minimal SDK-only GREEN

Capture `structuredClone(selection)` **before** advancing configuration revision
or invalidating caches, then retain and send that same owned selection. There is
no catch-to-default-fallback conversion. The actual new mutation test is GREEN:
**1/1 PASS**, 2,071.591 ms test duration, 2,418.613 ms total; raw
`.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-green.log`.
The source-proof request again contains the original SDK terminal and the
compiler returns five exact Locations despite caller-object mutation.

This establishes the supported SDK-shaped fixture, not compatibility for
arbitrary non-JSON prototypes, getters, nonenumerable properties or unsupported
clone values. Selected/cleared/invalid and multi-root public LSP regressions and
broader public-port validation remain uncertified by the failed gates below.
No `configureProject` repair is
included. A whole-test duration is not jump latency or a speedup comparison.

## Focused port validation and GREEN extraction boundary

The full public-port suite passed **9/9**, 23,770.783 ms before the responsibility
extraction. `pnpm check` and runtime build pass after the SDK-only repair.
Verbatim Worker-message routing was then extracted under that existing GREEN
characterization: the proxy shrinks 694→658 physical lines (remaining debt),
and the cohesive helper is 37 lines. No routing policy change is claimed.

The combined LSP/SDK/resource/retention focus completed **43 tests: 15 PASS /
28 FAIL**, zero cancellations/skips/todos, 419,078.702 ms, exit1. All 28 failures
were timeout/waiter failures: production completion response2, five snapshot
waiters, eight module cases and fourteen SDK cases. Raw log:
`.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-focused.log`.

Read-only host health then showed load40.85/63.08/47.63 and used swap5,282.50MiB
of6,144MiB; a check/start overlap was noted. These conditions do not establish
the sole cause or make the focus GREEN. The 9/9 pre-extraction result does not
certify this broader final-source gate.

The unchanged sequential post-extraction port rerun completed **6/9 PASS,
3 timeout failures**, 111,263.091 ms, exit1; raw
`configuration-sdk-owner-port-post-extraction.log`. All three fail at old
snapshot waiters (configured-SDK references, original caller-query references,
nested hover). Both new SDK control and mutation cases pass. An independent
post-extraction SDK-mutant selection also passes **1/1**, 9,886.304 ms test,
10,928.219 ms total; raw `configuration-sdk-owner-isolated-post-extraction.log`.
These are not a broader GREEN gate, wrong-result proof or speedup evidence.
No source/deadline/assertion/default changes were made to obtain these reruns.

An independent production Content-Length framed-stdio Worker test subsequently
passes **1/1**, exit0, test6,592.126ms,total7,031.953ms; raw
`.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-production-isolated.log`.
Completion→L3 pressure→overlay edit→rebuilt completion preserves public results
and metrics Worker=1/contexts≤2. No concurrent test/build or source/deadline
change occurs. This is functional recovery evidence, not a whole-gate pass or
≤500ms/product memory characterization.

## Validation boundary

The preceding snapshot slice's controlled 1,056/1,056 GREEN and default-host
997/1,056 with 59 failures are prior unchanged-source evidence, not this new
version's gate. Keep both histories; new source requires fresh verification.

Same-build fixed Settings/API24 replay **fails its original180,000ms RPC
deadline**, runner exit1. Preflight and hashes match, catalog1846/1846 is ready,
but only batches0–2 finish before batch3/shutdown; no complete response or
normalized final set exists. Raw242/44/17 batch counts are not a semantic result.
Automatic diagnostic observation also times out with diagnostics still enabled;
graceful server exit0 does not convert runner failure into success.

[The report](../reports/2026-09-27-settings-sdk-configuration-ownership.md)
contains the executable command, pins and failed raw replay SHA256
`cff2f325de05d5828f13e9109565e23cc6fbd94d2456d5e19154b7aa305525f0`.
Sampled Node maximum695,377,920 bytes has486–2200ms gaps and incomplete work;
it is not a completed-workload peak or memory comparison. Health observations
do not prove host conditions or SDK cloning caused every failure. The minimal
SDK fixture GREEN does not close broader gates or Settings exactness.

Project configuration needs a separate public RED/GREEN. Complete
overlay/source availability, extensionless absence proof, compiler-backed
constructor coverage, cold/edit ≤500 ms and final memory graduation remain open.
No commit/push/merge or Windows claim.

## Unchanged-source gate revalidation

[Chronological evidence](../reports/2026-09-27-settings-timeout-revalidation.md)
now records the identical43-case command passing43/43 in58,047.284643ms,
with unchanged artifacts/deadlines and no source/test edits. A fresh fixed
Settings/API24 process completes267 exact Locations and normal diagnostics;
98.039s harness latency still fails500ms. Fresh whole-fast finishes RED:
1,015/1,058 PASS,43 FAIL,exit1. Independent failure-boundary recheck is1/6 PASS,
5 FAIL; nested-buffer invalidation passes, while bundle/CLI/diagnostics and the
catalog whole-request latency budget fail. The catalog case still completes
five exact Locations. Current-source overall verification remains non-GREEN.
Keep original failed runs, pending project-object ownership and later admission
gates; this revalidation does not establish a sole failure cause or memory PASS.
