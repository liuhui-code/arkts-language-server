# SDK configuration ownership: fixture proof and Settings regression

Status: **SDK-only ownership RED repeated and minimal GREEN completed;
broader final-source gates failed; fixed Settings replay timed out without a
complete reference result**.

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; preserve existing edits. No reset,
commit, push or merge. [TDD evidence](../tdd/references-sdk-configuration-ownership.md)
separates the valid control, fixture setup failure and actual production RED.

## Actual SDK-only defect

The Node proxy previously retained caller-owned SDK selection objects while
semantic Worker messages copy them. In-place caller mutation, without a new
configure call or managed revision change, can split the two consumers' inputs.
This is a configuration ownership prerequisite, not authorization to narrow
constructor candidates or change production SDK selection policy.

The public fixture runs the actual `SemanticWorkerEngine`, semantic Worker
and compiler with an external NDJSON sidecar fixture. It does **not** run an
actual Rust semantic reference index or certify framed LSP/Windows performance.

| Evidence | Actual result |
| --- | --- |
| Unmutated identified-SDK source-proof control | 1/1 PASS; test1,584.376 ms, total1,819.165 ms |
| First control attempt | FAIL: `/var` expected versus canonical `/private/var`; fixture expectation only, not SDK ownership RED |
| Mutating only caller SDK path during held candidate status | 1/1 FAIL; test1,940.653 ms |
| Real Worker selection in ownership RED | Original SDK API24/component6.1.1.125, ready=true |
| Node source proof after caller mutation | Resolved0, unresolvedSdk1; SDK-terminal retries0, expected1 |
| Final compiler fallback result in RED | Complete five exact references; no false-negative result established |
| Independent ownership RED repeat | 1/1 FAIL; test2,181.408 ms, total2,466.819 ms |
| Minimal SDK ownership GREEN | 1/1 PASS; test2,071.591 ms, total2,418.613 ms |
| SDK-repair public-port suite before routing extraction | 9/9 PASS; 23,770.783 ms |

Raw logs: [canonical control](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-control-canonical.log),
[first fixture expectation failure](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-control.log),
[actual ownership RED](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-red.log),
[repeat RED](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-red-repeat.log),
[minimal GREEN](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-green.log).
These are whole fixture/test durations, not navigation latency samples.

The minimal repair uses `structuredClone(selection)` before revision/cache
side effects, retains the owned selection and sends that same value to the
Worker. There is no catch-to-default-fallback behavior. Preserve distinct
undefined/null/empty/invalid selection meanings; broader selected/cleared/invalid
and multi-root public LSP checks are not certified by the failed focus below.
Project configuration
ownership is **not repaired by this SDK-only slice** and still needs its own
public RED/GREEN. Arbitrary non-JSON prototypes, getters, nonenumerable properties
or unsupported clone-value compatibility cannot be inferred from JSON-shaped
callers or a single `{path}` fixture.

## Validation and Settings boundary

Final-source port/LSP gates are RED; a fresh version-wide whole gate is not
passed. The preceding candidate-snapshot slice's controlled
1,056/1,056 PASS and completed default-host 997/1,056,59 FAIL remain preserved
in [its report](2026-09-27-settings-candidate-snapshot.md), but neither is a new
gate for changed SDK-ownership source.

The existing Worker-message route was extracted verbatim after the public-port
9/9 GREEN: proxy694→658 physical lines (remaining debt), new helper37.
TypeScript check and build pass. The combined actual LSP/SDK/resource/retention
focus completed **43 tests:15 PASS /28 FAIL**, zero cancellations/skips/todos,
419,078.702ms, exit1. All28 are timeout/waiter failures: production completion
response2, five snapshot waiters, eight module cases and fourteen SDK cases.
[Raw failed focus](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-focused.log).

Read-only health showed load40.85/63.08/47.63 and used swap5,282.50MiB of6,144MiB;
a check/start overlap was noted. This is not a sole-cause explanation or a
GREEN gate. The unchanged sequential post-extraction port replay completed
**6/9 PASS,3 timeout failures**,111,263.091ms, exit1. Old snapshot waiters fail
at configured-SDK references, original caller-query references and nested hover;
both new SDK cases pass. Its [raw log](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-port-post-extraction.log)
is preserved. The isolated post-extraction mutation case passes1/1:
test9,886.304ms,total10,928.219ms,
[raw log](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-isolated-post-extraction.log).
Initial9/9 and isolated1/1 do not replace failed final-source regression gates.
No wrong compiler result is inferred from a timeout; source, deadlines,
assertions and defaults are unchanged across these reruns.

The later isolated production framed-stdio Worker test passes **1/1**, exit0:
test6,592.126ms,total7,031.953ms,
[raw log](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-production-isolated.log).
It covers completion→L3 pressure→overlay edit→rebuilt completion, with metrics
showing one Worker and at most two resident contexts. No concurrent test/build,
source or deadline change is involved. This functional recovery transcript does
not make the failed broader focus GREEN or measure ≤500ms navigation/product
memory release performance.

## Fixed Settings/API24 replay environment

The clean project is Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`; declared compile/target/
compatible SDK23/20/20 remain unchanged. Selected user-approved API24/6.1.1.125
is `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, declaration
digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node v26.3.0 on Darwin25.6.0 x64. This is same-SDK compatibility verification,
not API23/DevEco diagnostic equivalence or a Windows test.

The new
[manifest](../../bench/references/manifests/settings-menucontroller-sdk-configuration-ownership-api24.json)
pins server SHA256
`0b9deae87bbea11a53716cbd03493b9fa985b938c0c87a30be0c4668ded69d7a`;
other runtime assets are unchanged. Preflight matches clean project, SDK, oracle
and all artifact hashes. Target MenuController **constructor**, file
`common/src/main/ets/core/controller/MenuController.ets`, zero-based UTF-16
**90:17**, includeDeclaration=false; oracle267 SHA256
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.

## Actual replay: timeout, no complete semantic verdict

One independent process, actual Content-Length framed stdio, run alone without
concurrent test/build work. No forced GC or heap snapshot; automatic diagnostics
remain enabled. The original **180,000ms references RPC deadline expires**;
runner exit1. Trace request end is observed at180,184.4ms, superseded during
shutdown **after the harness timeout**, not a completed client references
response. This is not an SDK-unavailable or index-not-ready result: SDK/artifact
preflight matches and the catalog is ready.

| Measurement | Actual observation |
| --- | --- |
| Complete references response / normalized result | **None**; exact267 comparison cannot run |
| Diagnostic observation wait | Times out; diagnostics were not disabled |
| Catalog | Ready1846/1846, skipped1; initialize→catalog68,143ms |
| Search plan | Rejected constructor seed, then14 conservative batches |
| Completed batch indices | 0,1,2 only; raw Location counts242/44/17 |
| Last progress | Batch3 starts, then shutdown; no partial Locations returned |
| Batch0 Program | 2049 SourceFiles:1348 project /649 SDK /52 other |
| Batch0 timing | Readiness58,534.421ms, query3,662.121ms, duration65,004.040ms |
| Next completed batch readiness | 25,648.305 /25,109.772ms |
| Sampled target Node maximum RSS | 695,377,920 bytes |
| Sampled server-tree maximum RSS | 698,597,376 bytes; Node+sidecar, not Zed |
| External sampling | 342 samples; requested50ms, actual gaps486–2200ms |
| Sampler / harness maximum RSS | 103,309,312 /66,965,504 bytes, separate |
| Graceful process shutdown | Exit0; does not convert replay exit1 into success |

Worker-thread RSS is not added again. Coarse sampling and incomplete batch
execution mean the observed RSS is **not a full completed-workload peak** and
cannot be used for a memory improvement/no-regression comparison. Raw242/44/17
are neither merged/deduplicated nor complete final results. An empty stored
response/result list here is not a semantic zero-reference answer.

Read-only host health during the run was load about14/33/39 with swap about
5,480MiB; afterward load16.59/27.05/35.50, swap5,336.25MiB. These are associated
observations, not proof that host conditions or the SDK clone caused all
failures. Do not call the timeout a successful exact replay or change its
deadline to manufacture completion.

[Raw failed replay](../../.bench/anchor-reuse-2026-09-27/menu-sdk-configuration-ownership-A-1.json)
retains timeline, trace, effective environment and memory curve; SHA256
`cff2f325de05d5828f13e9109565e23cc6fbd94d2456d5e19154b7aa305525f0`.

For a new replay, use the fresh output below: the runner writes exclusively
(`wx`), so the historical `A-1.json` remains preserved rather than overwritten.

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-sdk-configuration-ownership-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-sdk-configuration-ownership-A-recheck-1.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

## Current gate matrix

| Gate | Status |
| --- | --- |
| SDK-object mutation fixture | GREEN minimal and isolated post-extraction; five exact Locations and original SDK terminal |
| Broader final-source regression | **RED**: combined15/43, then sequential port6/9; current whole-fast not passed |
| Prior source whole-fast | Controlled1056/1056 GREEN; default997/1056 with59 FAIL, preserved—not this new version's gate |
| Fixed Settings exact constructor replay | **No verdict**: timeout before complete response; not empty success |
| Project configuration ownership | Open; separate public RED/GREEN required |
| Complete source admission / constructor narrowing | Open; no candidate exclusion promotion |
| Cold/edit≤500ms / release memory / Windows | Not graduated |

No default/SDK-profile, schema, Worker-count/lifetime, semantic loading policy,
memory budget, deadline, assertion or diagnostic capability change is authorized
by this ownership repair. Complete overlay/source-availability admission,
extensionless source absence proof and compiler-backed constructor search
coverage remain open. Cold/edit ≤500 ms, original >3 GB reproduction, final
memory gates and Windows characterization are not graduated.

## Subsequent unchanged-source revalidation

[The follow-up report](2026-09-27-settings-timeout-revalidation.md) preserves
all original failures above and records the same43-case focus passing43/43,
then a completed fixed Settings/API24 replay with267 exact Locations and
normal diagnostics. Its98.039s cold response remains far outside500ms;
sampled Node803,155,968/tree806,420,480 bytes is not paired release evidence.
Fresh whole-fast finishes RED:1,015/1,058 PASS,43 FAIL,exit1; an independent
failing-boundary recheck is1/6 PASS,5 FAIL. Its catalog case returns five exact
Locations before failing a whole-request latency budget, not an index-only
measurement. There is no source/test/deadline/default change or sole-cause
claim in this revalidation.
