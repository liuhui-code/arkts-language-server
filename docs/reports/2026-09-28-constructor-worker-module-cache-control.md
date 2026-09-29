# Constructor Worker module-cache startup control

Status: **diagnostic probes complete; cache-enabled public gate 1/1 GREEN;
both cache-disabled gates and the prefix-observed gate RED**,
2026-09-28. This is an environment-only control on the frozen artifacts,
not a production cache implementation or a Settings replay. The preceding
[constructor controls](2026-09-28-settings-source-availability-consumer.md)
remain retained failures at their original deadlines. An isolated pass does
not repair them or establish a new whole-fast verdict.

## Question and boundary

The preceding small-fixture timeouts record substantial parent
spawn-to-runtime-ready receipt time. This control asks whether loading the
verifier bundle contributes to that interval and whether Node's on-disk module
compile cache is observable in a fresh Worker. It does not test retained ASTs,
Programs, Language Services, Symbols, or Worker-shell reuse. The
[transient-verifier lifecycle](../adr/0003-reference-verifier-worker-lifecycle.md)
and all production defaults remain unchanged.

The [throwaway probe](../../.bench/anchor-reuse-2026-09-28/worker-module-cache-probe/probe.mjs)
creates one Worker per arm, then explicitly terminates it after the response.
Its recorded `exitCode: 1` is that deliberate termination, not eight failed
queries. A 60 s diagnostic watchdog is separate from the public constructor
test's unchanged response deadlines. There is no production mutation, forced
GC, heap snapshot, or additional production instrumentation.

## Tiny probe and timing definitions

The [environment](../../.bench/anchor-reuse-2026-09-28/worker-module-cache-probe/environment.json)
records Node **v26.3.0**, Darwin x64, parent revision
`9f91122ac504365c57473a430094da09baac9309`, and the inherited dirty worktree.
The [four-line target](../../.bench/anchor-reuse-2026-09-28/worker-module-cache-probe/Target.ets)
contains one class and one `new Thing()` use. The custom workspace supplies
one project member and one authoritative overlay, with no project
configuration or SDK ambient profile supplied. The probe explicitly points
SDK variables at missing directories and enables the existing trace flag.

| Field | Measurement boundary |
| --- | --- |
| `bootstrapMs` | Parent clock immediately before `new Worker` to receipt of a bootstrap message emitted before the child requires the bundle |
| `readyMs` | Same parent origin to receipt of the child's `runtime-ready` message |
| `childPreReadyMs` | Child clock after loading the Node built-ins to its ready-message interception; includes bundle loading/initialization, excludes earlier Worker startup |
| `responseMs` | Same parent origin to receipt of the result, including post-ready preparation/query and message scheduling |
| `programReadyMs` | Existing child-reported Program preparation after runtime readiness, not the whole parent interval |

These are wall-clock boundaries, not disjoint CPU allocations. Parent receipt
includes scheduling and transport; subtracting parent fields is not a pure
parse/compile measurement. Bootstrap receipt can overlap child bundle loading,
and preparation may progress before the parent processes readiness. Empty
Workers establish a no-bundle baseline, not a
matched correction for every bundle arm.

All 11 arms ran serially in the order shown in
[runs.ndjson](../../.bench/anchor-reuse-2026-09-28/worker-module-cache-probe/runs.ndjson).
Values below are milliseconds, rounded to three decimals; raw precision is
retained in that file.

| Arm | Parent bootstrap | Parent ready | Child pre-ready | Parent response | Program ready |
| --- | ---: | ---: | ---: | ---: | ---: |
| empty-off-1 | 171.285 | 171.703 | 0.388 | 171.722 | — |
| bundle-off-1 | 39.342 | 435.125 | 395.261 | 2,273.804 | 1,792.619 |
| bundle-cache-cold | 129.677 | 1,181.703 | 1,052.151 | 4,429.656 | 3,183.055 |
| empty-off-2 | 161.522 | 161.543 | 0.065 | 161.554 | — |
| bundle-off-2 | 82.863 | 1,974.090 | 1,889.528 | 4,107.244 | 1,983.633 |
| bundle-cache-warm-1 | 223.589 | 1,044.772 | 821.048 | 4,003.518 | 2,839.777 |
| empty-off-3 | 448.897 | 448.918 | 0.083 | 448.924 | — |
| bundle-cache-warm-2 | 77.794 | 548.906 | 470.970 | 4,627.979 | 3,758.942 |
| bundle-off-3 | 2,158.297 | 6,722.453 | 4,458.864 | 13,226.520 | 5,496.688 |
| bundle-cache-warm-3 | 3,717.557 | 6,062.381 | 2,464.972 | 10,723.001 | 4,277.050 |
| bundle-off-4 | 1,259.707 | 2,928.636 | 1,667.488 | 4,789.903 | 1,681.176 |

All **eight bundle arms** return `ok: true`, `status: complete`, and one
reference. Every retained row observes the same internal one-based range
`Target.ets 4:25–4:30`, corresponding to public zero-based UTF-16
`3:24–3:29`. The probe asserts success/completeness/count, not cross-arm exact
tuple equality through LSP. Its internal request uses `position.line = 0`,
although `SemanticDocumentPosition` is one-based; the adapter clamps it to
line 1 and the actual cursor lands on `Thing`. This is not a canonical
internal position or evidence that the public LSP position protocol is
correct. The original framed-LSP characterization is the separate gate.

## Cache observation is not semantic reuse

The cold arm requires a fresh private cache directory. Enabled arms pass
`NODE_COMPILE_CACHE` through the Worker's explicit environment; disabled arms
remove that variable and set `NODE_DISABLE_COMPILE_CACHE=1`. The probe also
removes `NODE_COMPILE_CACHE_PORTABLE` and the test verifier-delay variable.

The cold row changes its cache snapshot from empty to three entries under
`v26.3.0-x64-8d7ad2ee-501`: 860, 187,644 and 1,580 bytes (**190,084 bytes**
total). Enabled Workers report that cache directory, and later warm arms see
the same files. Disabled arms retain existing files but do not report an
enabled cache directory. This observes activation and retained files, not
per-module hit counters. The subsequent public gate uses the same directory
and may add files; its later filesystem contents do not replace the probe's
before/after snapshots.

The [official Node module documentation](https://github.com/nodejs/node/blob/main/doc/api/module.md),
checked through Context7, describes on-disk V8 compilation reuse, optional
Worker inheritance through `NODE_COMPILE_CACHE`, possible first-load overhead,
and version-separated caches. It recommends disabling the cache for precise
V8 coverage, because deserialized functions may reduce coverage precision.
Those properties do not imply reuse of application ASTs, a TypeChecker, or a
Language Service. This control tests only Node v26.3.0; **Node 20 compatibility
is not verified**, and a bundle target alone does not certify cache support.
The observed directory naming is diagnostic data, not a supported layout
contract or a deployment design.

Both off and warm timing values vary strongly. Warm child pre-ready ranges
from 470.970 to 2,464.972 ms; off ranges from 395.261 to 4,458.864 ms. Later
parent bootstrap receipt itself rises into seconds; it does not isolate
work before bundle loading, because the child can continue after posting.
The initial disabled response is faster than every warm response. These
serial, small-sample observations do not hold host conditions constant,
establish a cache speedup distribution, isolate a sole timeout cause, or
graduate a production optimization.

Every bundle arm builds **114 SourceFiles / 1 project file / 0 SDK files**:
113 other files with **2,790,909 text code units**, versus the preceding
constructor controls' 54–57 SourceFiles, 2–5 project files and 52 other files /
430,409 code units. Both environments observe **0 SDK files**; the difference
must not be attributed to a full-SDK/profile load. The first probe directory
is under the repository ancestor, unlike the original temporary fixture.
The [declared compiler](../../package.json) is `ohos-typescript@4.9.5-r10`;
[upstream pre-6 types documentation](https://github.com/microsoft/typeScript-website/blob/v2/packages/tsconfig-reference/copy/en/options/types.md)
describes automatic inclusion of visible ancestor `node_modules/@types`
packages. Repository `@types/node` exposure is therefore a possible
environment contributor, not a measured explanation of all 113 files.
The complete contributor file list was not captured. These Programs cannot
replace the failed original batches' phase measurements or serve as a
Settings/full-SDK memory reproduction.
Recorded memory points are not continuous RSS peaks or PSS evidence.

## Original public constructor gate and disabled controls

The [gate environment](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-gate-1/environment.json)
records a start at **2026-09-28 07:13:37.273 UTC**, with the same original
test and five artifact/test pins below. The actual invocation is:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-concurrency=1 \
  --test-name-pattern='^explicit constructor references preserve their own identity across aliases and inheritance$' \
  tests/semantic/references-anchor-reuse.test.mjs
```

Its environment keeps the existing absent-SDK control path
`/private/tmp/arkts-fast-sdk-control-missing-20260927` and changes only temporary
directory placement plus explicit `NODE_COMPILE_CACHE` pointing to the probe's
cache. The observer retains file descriptors read-only every 250 ms, without
`ps` or RSS sampling. Original requests, profiles, trace boundaries,
correctness assertions and deadlines are unchanged; no semantic caching,
Worker reuse, GC or diagnostic suppression is added.

The cache-enabled [test log](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-gate-1/test.log)
is terminal **1/1 PASS**, exit 0, zero failures/cancellations/skips/todos.
The [wrapper summary](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-gate-1/summary.json)
records completion at **2026-09-28 07:19:39.265 UTC**, code 0 and null signal.
The unchanged original test reaches its final exact cross-profile equality
assertions for `legacy`, `indexed-batched`, `conservative-semantic-units`,
and `trace-off`, rather than stopping at a timeout before equality.

| Public original-case control | Test / suite / wrapper duration ms | Terminal verdict |
| --- | --- | --- |
| Explicit `NODE_COMPILE_CACHE` | 356,461.677414 / 360,693.031313 / 361,813.397475 | 1 PASS / 0 FAIL, exit 0 |
| Explicit `NODE_DISABLE_COMPILE_CACHE=1`, first | 161,716.624369 / 164,839.073906 / 170,250.957830 | 0 PASS / 1 FAIL, exit 1 |
| Explicit `NODE_DISABLE_COMPILE_CACHE=1`, second | 323,358.816219 / 328,324.523575 / 330,163.274871 | 0 PASS / 1 FAIL, exit 1 |

Complete retained pre-cleanup server log files are saved for
[legacy](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-gate-1/legacy.server.log),
[indexed-batched](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-gate-1/indexed-batched.server.log),
[conservative semantic units](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-gate-1/conservative-semantic-units.server.log),
and [trace-off](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-gate-1/trace-off.server.log).
Descriptor retention does not guarantee capture of later stderr-only events
after cleanup unlinks a log pathname. The public test/summary provide the
terminal verdict, independently of that retention window.

The serial disabled control's
[environment](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-1/environment.json)
records **2026-09-28 07:20:52.575 UTC** start, identical original test/artifact
pins, a fresh temporary root and `NODE_DISABLE_COMPILE_CACHE=1` instead of
`NODE_COMPILE_CACHE`. It retains the same read-only observer and public
deadlines. Its [test log](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-1/test.log)
is terminal **0/1 PASS, 1 FAIL**, exit 1, zero cancellations/skips/todos;
the [summary](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-1/summary.json)
records completion at **2026-09-28 07:23:43.215 UTC**, code 1 and null signal.

The disabled case completes all ten references requests in each of
[legacy](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-1/legacy.server.log)
and [indexed-batched](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-1/indexed-batched.server.log),
passing their in-profile assertions. It then times out at the first class
references query of
[conservative semantic units](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-1/conservative-semantic-units.server.log):
**public response 3**, `Target.ets`, zero-based UTF-16 `0:14`,
`includeDeclaration: false`, original **30,000 ms** response deadline.
It does not reach trace-off or the final cross-profile exact equality
assertions; this is a timeout, not a semantic-difference verdict.

The failed trace `a867076f-598c-411a-8e4a-782aec17cc7a` has a ready 16/16
catalog and a five-batch conservative file plan. Its completed batch index
**1/5** records parent duration **21,958.71 ms**, startup-ready receipt
**20,180.688245 ms**, and Program-ready **974.048046 ms**; the Program has
55 SourceFiles, **3 project files / 0 SDK files**, with 52 other files /
430,409 code units. Batch index 2 completes at elapsed **30,161.26 ms** and
index 3 starts at **30,239.02 ms** in the retained pre-cleanup window. No
merge or successful references `request.completed` is captured for this
trace. The pathname-based logger/retention limitation above still applies:
absence in that prefix does not prove the child never finished later.

The 20.181 s startup-receipt outlier is larger than this batch's Program
preparation, but it includes scheduling/loading/parent message receipt,
not measured child CPU. The separate child CPU/wall control below does not
reproduce this outlier or demonstrate a fix. Neither the first tiny probe's
Program timings nor old Settings phase proportions explain it. One enabled
PASS and one disabled FAIL do not prove cache causality
or graduation; the gate totals cover different completed workloads and
cannot be treated as a speed A/B. **The original regression remains open**:
no production/default fix, new whole-fast GREEN, or constructor narrowing
permission follows from this control.

The second disabled control's
[environment](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-2/environment.json)
retains the same five pins, original scope and deadlines, with a fresh
temporary root. Its [test log](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-2/test.log)
and [summary](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-2/summary.json)
record **0/1 PASS, 1 FAIL**, exit 1, null signal and zero
cancellations/skips/todos; the wrapper finishes **2026-09-28 07:34:20.034 UTC**.
The first three profiles each complete all ten references and their
in-profile assertions. Final trace-off completes its two class references,
then times out waiting for **response 6**, the constructor use at public
UTF-16 **`Target.ets 4:26`**, `includeDeclaration: false`, still at **30 s**.
It never reaches final cross-profile exact equality. The retained
[trace-off log](../../.bench/anchor-reuse-2026-09-28/constructor-module-cache-off-gate-2/trace-off.server.log)
has no phase metrics, as intended. Different failed request/profile
boundaries do not turn these runs into a speed A/B or establish a cache fix.

## Independent current-thread CPU / wall control

The follow-up
[probe](../../.bench/anchor-reuse-2026-09-28/worker-cpu-control-1/probe.mjs),
[environment](../../.bench/anchor-reuse-2026-09-28/worker-cpu-control-1/environment.json)
and [ten raw arms](../../.bench/anchor-reuse-2026-09-28/worker-cpu-control-1/runs.ndjson)
use a separate fresh private cache. The target is outside the repository at
`/private/tmp/arkts-worker-cpu-control.ViFknA/Target.ets`, with the same
74-code-unit source and frozen verifier bundle. The canonical internal cursor
is **one-based `1:14`**, equivalent to public zero-based UTF-16 `0:13`; this
does not reuse the first probe's non-canonical line zero. SDK ambient profile
is explicitly `full`, with the SDK paths still missing.

All **seven bundle arms** return complete and pass an exact known-reference
assertion for internal `Target.ets 4:25–4:30`. All have **53 SourceFiles /
1 project file / 0 SDK files**, including 52 other files / **430,409 code
units**. This aligns the standard-library population with the original
constructor batches, but one project file is not the original 16-member
fixture, its per-batch dependency closure, four public profiles, or a
framed-LSP replay. The new internal result assertion does not replace the
original public gate or revise the old probe's limitations.

The bootstrap samples `process.threadCpuUsage()` and `process.cpuUsage()`
after loading its Node built-ins, before requiring the bundle. CPU deltas
and child wall time stop at its readiness message; parent bootstrap retains
its separate spawn-to-bootstrap receipt boundary. The
[official process documentation](https://github.com/nodejs/node/blob/main/doc/api/process.md),
checked through Context7, specifies current-thread user/system CPU in
microseconds and permits a prior reading for deltas. The table converts
`(user + system) / 1000` to milliseconds. This API was actually usable on
Node v26.3.0 Darwin; no Node 20 compatibility claim follows. Process-wide
CPU covers other threads and overlaps current-thread CPU, so the raw
process/pre-ready/whole-arm CPU fields are not added together.

| Arm, actual serial order | Parent bootstrap ms | Child pre-ready wall ms | Current-thread pre-ready CPU ms |
| --- | ---: | ---: | ---: |
| empty-off-1 | 378.002 | 0.536 | 0.216 |
| bundle-cache-cold | 42.054 | 487.470 | 358.355 |
| bundle-off-1 | 37.881 | 412.943 | 340.109 |
| bundle-cache-warm-1 | 37.236 | 245.160 | 204.443 |
| empty-off-2 | 34.197 | 0.143 | 0.109 |
| bundle-cache-warm-2 | 31.992 | 195.797 | 183.446 |
| bundle-off-2 | 38.983 | 284.410 | 272.100 |
| empty-off-3 | 44.731 | 0.139 | 0.104 |
| bundle-off-3 | 34.116 | 355.888 | 321.017 |
| bundle-cache-warm-3 | 34.693 | 182.822 | 172.853 |

Descriptive medians for three off versus three warm observations are
**355.888 / 195.797 ms** child pre-ready wall and **321.017 / 183.446 ms**
current-thread CPU. This small sample supports that bundle loading performs
measurable current-thread CPU work in these runs. Warm labels mean the cache
directory already exists, not verified per-module hits. The three empty
Workers retain near-zero child pre-ready work despite parent bootstrap
378.002 / 34.197 / 44.731 ms, illustrating the distinct boundaries.

These serial arms do not hold host conditions constant or reproduce the
public gate's 20.181 s startup-receipt outlier. Differences from the first
probe include cursor, root/ambient population, instrumentation, fresh cache
and order; do not pool the two probes into a performance distribution.
No cache-hit proof, sole timeout cause, cold/edit 500 ms result, memory gate,
default optimization or Worker-lifecycle graduation follows. No `vm.Script`
probe or production change is part of this report.

## Original-entry prefix CPU / wall observer

The third targeted diagnostic uses the same original public test invocation
above, unchanged 30 s response deadline and frozen artifacts, with cache
disabled. Its [environment](../../.bench/anchor-reuse-2026-09-28/constructor-module-prefix-cpu-gate-1/environment.json)
records these additional diagnostic-only settings, not deployment defaults:

```text
NODE_DISABLE_COMPILE_CACHE=1
NODE_OPTIONS=--require=/Users/liuhui/Documents/code/arkts-language-server/.bench/anchor-reuse-2026-09-28/worker-module-prefix-preload.cjs
ARKTS_DIAG_MODULE_LOAD_CPU_FILE=/Users/liuhui/Documents/code/arkts-language-server/.bench/anchor-reuse-2026-09-28/constructor-module-prefix-cpu-gate-1/worker-prefix.ndjson
```

The [34-line temporary preloader](../../.bench/anchor-reuse-2026-09-28/worker-module-prefix-preload.cjs)
filters non-main Workers with a workspace and references/definition operation.
It snapshots child wall/current-thread/process CPU at ready/result boundaries,
forwards the original payload and transfer arguments unchanged, then appends
the snapshot best-effort. Clock/CPU sampling occurs before forwarding;
synchronous file append occurs afterward. The interval begins after the
preloader's built-in imports, before the original verifier entry, not at
parent spawn. This adds observation overhead, including possible delay before
post-ready preparation, and is **not a performance benchmark**. The retained
command/settings identify the executed diagnostic; rerunning them into the
same output would append to retained evidence and is not requested.

The [test log](../../.bench/anchor-reuse-2026-09-28/constructor-module-prefix-cpu-gate-1/test.log)
is terminal **0/1 PASS, 1 FAIL**, exit 1, zero cancellations/skips/todos;
test/suite/wrapper durations are **57,442.679920 / 59,862.258309 /
61,865.262696 ms**. The [summary](../../.bench/anchor-reuse-2026-09-28/constructor-module-prefix-cpu-gate-1/summary.json)
finishes **2026-09-28 07:36:06.784 UTC**, null signal. Legacy completes;
indexed-batched then times out at **response 6**, public constructor use
`Target.ets 4:26`, `includeDeclaration: false`. Final cross-profile equality
does not execute. In the retained
[indexed log](../../.bench/anchor-reuse-2026-09-28/constructor-module-prefix-cpu-gate-1/indexed-batched.server.log),
PID **80661**, trace `52a8089b-5914-44a7-bdb7-7e285fa722a9` rejects the seed
and retries complete membership in 15 batches. Retry indices **0–8 complete**;
index **9 starts** at **07:36:00.065 UTC** after index 8 completes at
**07:35:59.980 UTC**. No index-9 completion, merge or successful references
`request.completed` is captured. This retained prefix does not prove the
child never finished afterward or certify an exact final result.

[worker-prefix.ndjson](../../.bench/anchor-reuse-2026-09-28/constructor-module-prefix-cpu-gate-1/worker-prefix.ndjson)
has **40 rows**, 20 Workers (thread IDs **2–21**), each with one ready and one
result row. The last two Workers pair temporally with retries 7/8 using PID,
root/cursor and the sequential, new-Worker-per-batch lifecycle; preload rows
do not themselves encode a batch index. Their internal cursor is `5:27`,
the canonical counterpart of public `4:26`. Values are milliseconds:

| Retry / thread | Parent attempt | Parent ready receipt | Child prefix wall | Current-thread CPU | Process CPU, overlapping | Program ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 7 / 20 | 6,304.05 | 4,218.759 | 2,025.645 | 594.056 | 716.538 | 1,325.508 |
| 8 / 21 | 10,312.86 | 6,801.948 | 4,032.736 | 727.109 | 905.038 | 1,913.827 |

Completed batch Programs contain **54–57 SourceFiles / 2–5 project files /
0 SDK files**, with the same 52 other files / 430,409 code units. This
original-LSP observation directly shows prefix wall substantially above
current-thread CPU in these attempts. It does not distinguish scheduling,
I/O, GC or another cause, nor reproduce the same earlier 20.181 s outlier.
CPU fields overlap, and parent receipt may overlap subsequent child work;
none are summed as disjoint CPU time. The preloader/file append changes
observation cost. This RED neither graduates caching/Worker reuse nor
establishes a speed A/B, memory result, semantic defect or repaired gate.

## Retained fingerprints

The first probe and all four public-control environments pin the same frozen
artifacts/test:

| Path | SHA256 |
| --- | --- |
| `dist/server.cjs` | `ebac64e22a90a8ab0d1171f9b50c9a11272fc705569058dce64abc16515aac36` |
| `dist/semantic-worker.cjs` | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| `dist/reference-verifier-worker.cjs` | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| `target/release/arkts-index-sidecar` | `def311dfe2269ecb0b147d9451ae60b09ee1a55f8228b428f57b26923dba05e2` |
| `tests/semantic/references-anchor-reuse.test.mjs` | `102a060cffbc967d2002c6e7b3cfcfd2f723b0a5bfeb7d1e6c354e884824aee9` |

Stable evidence files under `.bench/anchor-reuse-2026-09-28/`:

| Path | SHA256 |
| --- | --- |
| `worker-module-cache-probe/probe.mjs` | `fd476eb41b6a2781c431c50400188a142f1bac1ea2edc172a636b7335861b1f8` |
| `worker-module-cache-probe/environment.json` | `87e767f4b16a25a3cd243b8096007b5dc46a6860896831c13d4e82b3ab913ecd` |
| `worker-module-cache-probe/runs.ndjson` | `e9bc83a5b57bbc13f2167aaf7a75c0b7c7664584809f91f1cac5e8fc03b5370b` |
| `worker-module-cache-probe/Target.ets` | `a695d1a4998da4cf2e5ef3c1912101cb2a1168063721b95941a2be1e020f6d72` |
| `constructor-module-cache-gate-1/environment.json` | `99523cba7c82dcec23bbcbb972e3f5dbc993e9212069d6b5fd71e8f4f0b26e99` |
| `constructor-module-cache-gate-1/test.log` | `2a5536d5f03ea6b6e4c30d8a68263ad996fd527660a1be3db49a79a4f7c15af4` |
| `constructor-module-cache-gate-1/summary.json` | `dc94e7c96363c553c7064ba5a767677edc666b45c45e20bc476c128974070988` |
| `constructor-module-cache-gate-1/legacy.server.log` | `9b21d01a8a8c890b085b6a42e8edd92e7bf1353bd99114859d58598bb0ae76b9` |
| `constructor-module-cache-gate-1/indexed-batched.server.log` | `ec5193f005a085e8970e6363266f119107bf0e7c810313c2cceb9f2b9efd207c` |
| `constructor-module-cache-gate-1/conservative-semantic-units.server.log` | `af2585003ce3ecb31b266a192dabafe9860cae6951f31ea397eb9a68818a6c2f` |
| `constructor-module-cache-gate-1/trace-off.server.log` | `57aeca643eb3be8a2bf022e4e1cd08286d3000d2c60c654e3a8383910956886e` |
| `constructor-module-cache-off-gate-1/environment.json` | `cf281a07783126ccc3f10b1650537cd7d6b40526bb94e37e6fbea5dd5885e594` |
| `constructor-module-cache-off-gate-1/test.log` | `0cb9c9abb5a37e90f370dd00ef9fd6da0600e9198429df20ac8e94a5711f6cbe` |
| `constructor-module-cache-off-gate-1/summary.json` | `988735a6e258de3bf3056d0fd2648fbaff3f915af669f3de24785aa052fdc534` |
| `constructor-module-cache-off-gate-1/legacy.server.log` | `d3f2b36414561af6762f1d1dbeec8890ef5ea5fe8589e8dd0ad261714267a89a` |
| `constructor-module-cache-off-gate-1/indexed-batched.server.log` | `33d46bbaf61de7de63629662b26ac1b57e988a44314ce6de25ba67c09a55f4dd` |
| `constructor-module-cache-off-gate-1/conservative-semantic-units.server.log` | `1f21fb982fd3ba4cacf7cd63fa0260bd6faf2112f8ab180c13b196104a3bd728` |
| `constructor-module-cache-off-gate-2/environment.json` | `c0d38dc9f3df59cdd4e0bb0a5502385d289fc3ef9b4e80ae20a8343c824ec1a5` |
| `constructor-module-cache-off-gate-2/test.log` | `f3e126aa833959c579a8ba2ab4cd3db14c6d026d418173bac0f156abf4a5d899` |
| `constructor-module-cache-off-gate-2/summary.json` | `c15dc754cc3ae1e610830473fa64abcea924c39dab59761f6c6693c9d1b976f9` |
| `constructor-module-cache-off-gate-2/legacy.server.log` | `9576fed6bbf27bead859de9317769815cfae68ac81633ea9683003dbbf7a1998` |
| `constructor-module-cache-off-gate-2/indexed-batched.server.log` | `af27a86685607d623c9416cd8009563d591ef597695b38712d0a8b9d8d24398f` |
| `constructor-module-cache-off-gate-2/conservative-semantic-units.server.log` | `dc632aec0f81d0e6a168684d3db80fbe7066c1aa2d707cf94720e0511510a571` |
| `constructor-module-cache-off-gate-2/trace-off.server.log` | `cecfb7b056379d921766a4f1730b66335f001eabdd569f3ee5d836bd417218fb` |
| `worker-cpu-control-1/probe.mjs` | `79d76dca51c6fd20c4bc6b95ba9f56d988281367fbd746db378ae8cced0dff58` |
| `worker-cpu-control-1/environment.json` | `b186fec191ae2ef233dbd4fdc70f2f11a3dc17eea06dab0fba334d8276b2d438` |
| `worker-cpu-control-1/runs.ndjson` | `566160b4780c0cbabf6fc2e4e0798e43a9a9997fe2884fc01e6a7b0b55c31492` |
| `worker-module-prefix-preload.cjs` | `7751f1bc1c69f2745ac8858b0979f8e340b1ab0d0495d1c88fd13ccb8ae9dee6` |
| `constructor-module-prefix-cpu-gate-1/environment.json` | `757da0509d21c40e86b125db9ccba8f6b3d0f3aeb8c8f90ce44713e4ba136c60` |
| `constructor-module-prefix-cpu-gate-1/test.log` | `b640524316af433bc66a48c473278b4b7f6f562e2ca92958df2b243a995a52b7` |
| `constructor-module-prefix-cpu-gate-1/summary.json` | `d9e945b36ef18e0fa09d4bc3677227c52b9257110e618cfedbd2bb4edd46e90b` |
| `constructor-module-prefix-cpu-gate-1/legacy.server.log` | `9ac518800a73267bbf58b5a9848372e4468e96401b40e02c6ba6bd5c12aaa11e` |
| `constructor-module-prefix-cpu-gate-1/indexed-batched.server.log` | `f628196a23e8b14be8fb90394edeb4e8d08dde88432d2c67011e9967a50c34e9` |
| `constructor-module-prefix-cpu-gate-1/worker-prefix.ndjson` | `c01c459b7a3afda9511cbad74810a504143ab475d36f0b253a5a3f00ff90dcfd` |

No source, test, build, default, ADR or plan is changed by this report. Tiny
probe success or one cache-enabled gate pass does not close the retained
**1,078/1,093 whole-fast FAIL** or authorize constructor candidate exclusion.
Cold/edit 500 ms, original >3 GB,
final memory/PSS, complete search admission, native Windows and Node 20
remain separate unpassed gates. No commit, push or merge is requested.
