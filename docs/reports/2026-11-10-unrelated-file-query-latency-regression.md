# IDX-V1-SCALE-004: unrelated-file query latency regression

Status OPEN; performance regression diagnosis, not a500ms hard-gate failure.2026-11-10.
This records current candidate costs directly observed during ADR0043/0044 acceptance.
No product optimization, freshness relaxation, merge or deployment is performed by this report.

## Controlled ordinary evidence

Three serial ordinary trials of128/2048/20000/30000 project sources, two pinned versions,
index-cold/index-warm new processes:48 cells,36PASS/12completed-with-functional-gaps.
Every failed/gap operation is retained; calibration and tracing are excluded.
The input count includes Main.ets,lib/Counter.ets and count-2 generated files.
The target static dependency closure is2files/1import edge, unchanged while unrelated files increase.
Actual Program source count is NOT measured by this ordinary summary; neither static closure,
sourceNamespace.sources nor Native indexed count may substitute for it.

Current source snapshot f33288b9e4ca9b925679f5551be5e146b0e36523a77d940132bcaa9fb1a17c52,
parent/baseline298d65f5d7f796c347fe8be5c739e428066489d8; candidate remains uncommitted/frozen.
Server3145633150f4f76e32616f6bf6a6cc4cbd80e1dbfb435e560127380e50fb5b31;
Worker52b5296b32460757343ed4673d46615f12d02d3cbac1431ffc375fed1ed7a0e5;
Native5f648342ba3b0de2e7d8788212922fcc5097c7e4f166bd6c3b19fd133a1a3ad3.
Node20.19.5, installed OHOS compiler4.9.5-r10, API24 SDK partial.
SDK input manifest89a6b94b92c1e92388b7c486005e759b979150411c50c191ed99c94ab6870eaf;
endpoint content/link validation is separate from these query statistics.
OS file cache is uncontrolled. Warm means retained index/new server process, not a hot Program or result-cache hit.

## Reproducible query and edit sequence

Each isolated root is `scale-acceptance-28/fixtures/unrelated-<count>` under the evidence directory.
Native indexing and preparation.phase=complete occur before the operation sequence; semanticState may still be partial. Operation timers exclude that startup.
`scale-session.mjs:42-99` opens Main.ets v1, performs definition twice, completion twice,
references twice, local-import rename twice; rename WorkspaceEdits are validated but NOT applied.
Then didChange v2 replaces the full unsaved text with original+'\n// incremental input\n'; no disk save occurs.
Immediately query references twice, definition twice; undo via didChange v3 to original text, define,
close/reopen v4, completion/definition, open Counter.ets v1 and declaration-origin rename twice.
Thus edit-first references has its own timer and no preceding rename application; prior queries can warm state.
Main target Counter is UTF-16 zero-based(1,29); completion is(2,56), origin Counter declaration is(0,14).
Rename input is `newName: RenamedCounter`; references includes the declaration.

`harness/protocol.mjs:57-72` starts elapsedMs after client-slot admission immediately before framed send,
ends when the response has been parsed. Server queue/mutation processing can be included; clientSlotWaitMs is separate.
It does not directly measure exclusive compiler/SQL/filesystem CPU or editor UI response.
Full payload/oracle authority remains original requests/wire/session logs; this helper aggregates their outcomes only.

## Ordinary medians / maxima

All values below are milliseconds,3 samples per success bucket, median / maximum.
GAP3/3 denotes three error refusals, never a successful operation time. Their response-time buckets remain in JSON.
`rename-first` is the Main.ets local import alias; `origin-rename-first` is the Counter.ets declaration.

### candidate

| Files | Index cache | First completion | First definition | First local rename | First origin rename | Edit-first references |
| --- | --- | --- | --- | --- | --- | --- |
|128|cold|102.77 / 103.28|79.82 / 79.89|130.50 / 130.90|218.12 / 223.53|296.94 / 324.05|
|128|warm|74.60 / 75.20|80.90 / 82.28|168.64 / 196.87|240.36 / 248.45|292.51 / 295.59|
|2048|cold|193.36 / 196.41|216.61 / 290.01|1152.08 / 1167.83|1388.36 / 1396.58|1844.83 / 1854.90|
|2048|warm|198.64 / 255.75|215.93 / 222.92|1131.84 / 1191.05|1394.55 / 1424.88|1854.59 / 1867.44|
|20000|cold|839.01 / 910.65|1992.41 / 2090.32|10746.63 / 10847.80|13604.64 / 13679.19|16465.60 / 16481.25|
|20000|warm|894.65 / 899.18|2018.73 / 2068.15|10819.62 / 10919.27|13739.19 / 13755.48|16465.39 / 16516.91|
|30000|cold|47.46 / 47.71|812.34 / 880.21|GAP 3/3|GAP 3/3|GAP 3/3|
|30000|warm|47.09 / 47.91|683.38 / 685.35|GAP 3/3|GAP 3/3|GAP 3/3|

### baseline

| Files | Index cache | First completion | First definition | First local rename | First origin rename | Edit-first references |
| --- | --- | --- | --- | --- | --- | --- |
|128|cold|71.24 / 96.04|79.63 / 81.01|41.89 / 44.55|50.59 / 51.21|203.83 / 208.27|
|128|warm|68.27 / 69.68|79.90 / 81.44|41.34 / 44.55|50.15 / 50.33|204.58 / 214.75|
|2048|cold|152.44 / 152.83|218.95 / 223.35|171.95 / 172.93|90.55 / 90.59|759.08 / 767.23|
|2048|warm|155.24 / 159.14|214.82 / 217.51|167.90 / 192.41|90.69 / 91.14|758.10 / 760.95|
|20000|cold|520.62 / 523.29|2048.95 / 2119.98|319.84 / 349.12|330.27 / 330.45|5682.81 / 5732.81|
|20000|warm|514.56 / 517.51|2057.49 / 2133.80|317.15 / 319.88|329.03 / 333.52|5621.25 / 5670.31|
|30000|cold|802.53 / 838.84|696.44 / 701.12|GAP 3/3|GAP 3/3|GAP 3/3|
|30000|warm|639.81 / 664.56|683.67 / 683.76|GAP 3/3|GAP 3/3|GAP 3/3|

## What is established and what is not

Through20K, reference/rename latency grows materially with unrelated file count despite a fixed static target closure.
The candidate's20K local rename is~34x the baseline median, origin rename~41x, edit-first references~2.9x.
This repeats across version-order reversal, not a single slow sample. Functionally exact successful results are retained.
30K takes a different partial-membership path and all full-scope reference/rename attempts refuse:
its apparently faster local queries and short refusals do not demonstrate general scalability or complete support.

Existing call-chain evidence in `2026-11-10-versioned-index-scale-comparison.md` and
`namespace-final-20261109/scale24-source-proof-disk-read-call-chain.json` shows full source-namespace capture
iterates admitted members, reads/hashes sources and sorts digest entries. That code supplies a plausible scaling
mechanism; the new ordinary samples do NOT establish exclusive stage times, Program build counts, actual realpath calls,
physical write I/O or that all extra latency belongs to this step. Static loops support scope-specific scan/sort costs,
not an end-to-end O(N), O(N log N) or O(N squared) conclusion from these measurements.

Next: complete the current ordinary/independent-trace matrix; correlate each operation with readiness,
namespace capture, final proof, compiler and queue spans without summing nested intervals. Prioritize avoidable
repeated proof/readiness work belonging to this candidate. Preserve final disk authority, silent-change/identity guards,
old-request invalidation and complete results; no new timeout/cap/V8 threshold or global valid-cache shortcut.
A broader paused Host/result-cache redesign is not silently authorized by this issue.

## Evidence and replay

All following paths are under `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/`:

- `scale28-unrelated-three-trial-input-01.json`: frozen controller snapshot, contains raw result paths.
- `scale28-unrelated-three-trial-summary-01.json`:48 result hashes, operations/outcomes,3-trial buckets,
  cell status counts and missing categories. Runtime manifests are compared, not rehashed by this helper.
- `scale-metrics-cli-proof.json`:9 public CLI regressions, preserved RED/GREEN logs, helper hashes and BYTE_IDENTICAL replay.
- `session-analysis/scale_metrics.py` / `scale_metrics_test.py`: stdlib only,68/205lines at this checkpoint,
  outside the frozen product worktree. Refuses incomplete/duplicate/nonterminal cells, artifact drift and invalid elapsed data;
  keeps errors separate and failed-session unexecuted operations unmeasured. Counts do not certify payload correctness.

Reproduce from repository root using a NEW output path (existing files are never overwritten):

```sh
cd .bench/index-versioned-maintenance-20261104/namespace-final-20261109/session-analysis
python3 -m unittest scale_metrics_test -v
python3 scale_metrics.py ../scale28-unrelated-three-trial-input-01.json unrelated /private/tmp/scale28-unrelated-replay.json
```

Related decisions: ADR0043 versioned index maintenance (facts-write optimization does not promise scan-free queries),
ADR0044 load-owned proof lifetime (full actual read-set and final verification remain required),
ADR0036 namespace recovery. These findings change acceptance evidence, not those correctness decisions or ADR status.
SDK partial, true-dependency ordinary/profile matrix, density/topology, full30K references/rename and real UI/platform
validation remain separately pending/limited. No protocol result is presented as actual Zed UI acceptance.


## Closed diagnostic evidence: two full-project admission windows dominate

This section uses independent profile samples, never mixes their timings with the ordinary tables.
Raw exact20K request/window/source hashes and line/byte offsets:
`namespace-final-20261109/scale004-20k-rename-profile-window-01.json`.
Cross-scale closed controls:
`namespace-final-20261109/scale004-rename-closed-profile-controls.json`.

Hypotheses checked against the existing controlled loop: full input capture, Program rebuild, scheduling,
and GC/system pause. No new load or product patch was introduced for these observations.

For the20K cold profile, public request8 `textDocument/rename`, Main.ets(1,29), newName RenamedCounter,
is sent2026-11-10T06:00:16.893Z and parsed06:00:28.633Z, client monotonic11739.153ms.
Worker epoch1/thread1 dispatches readiness13, rename14, readiness15 in that order.

| Non-overlapping wall boundary | Milliseconds |
| --- | ---: |
| Client send to first parent admission |2|
| Readiness13 admission to rename14 admission |5014|
| Rename14 admission to readiness15 admission |1433|
| Readiness15 admission to frontend request.completed |5290|
| Frontend completion to client parsed response |1|
| Wall-clock total |11740|

Wall timestamps are millisecond-quantized; their sum differs from client monotonic elapsed by0.847ms.
The readiness windows total10304ms,87.77% of that wall total. They include IPC/parent continuations and all
readiness work; they are NOT exclusive namespace hashing, filesystem CPU or compiler measurements.
The three parent-admission-to-send values are0.328/0.250/0.331ms, worker-received-to-dispatch0.148/0.217/0.156ms.
No diagnose/other queue admission appears in this window. Long parent/Worker queue waiting is not supported
as the dominant cause of this selected rename, unlike the separate historical SCALE002 diagnostic-overlap sample.

### Actual code path and baseline change

- `src/lsp/register-semantic-capabilities.ts:314-322`: public rename handler calls semantic.rename.
- `src/semantic/semantic-worker-proxy.ts:322-334`: current rename wraps the document request in ReferenceNamespaceAdmission.run.
  Parent298d same method326-337 directly dispatched rename, without this wrapper (parent excerpt/hash in receipt).
- `references/reference-namespace-admission.ts:37-66`: before and after a complete edit set, read readiness with
  prepare=false,captureSourceInputs=true; check root input revision and compare namespace/disk hashes.
- `worker-project-preparation.ts:30-37` -> `semantic-worker-runtime.ts:258-272` -> legacy engine113 ->
  `project-readiness.ts:26-61`: prepareRoot, input admission, full source capture, then readiness report.
- `project-source-namespace.ts:11-45`: iterate complete membership, token/read eligible source content,
  hash/sort canonical URI digests, refresh and recheck membership. This is source-byte proof, not AST parsing.

Thus two new full-project observation RPCs are directly present in the regression path. Their purpose is
silent-disk/source-namespace correctness across complete edit publication. Removing them or trusting an old hash
is not an accepted optimization. Which exclusive inner step consumes their time still needs a targeted probe.

### Program reuse and observer bounds

The rename callback metric is18.326ms, collectorAvailable=true, createProgramMs=0, createProgramEvents=0.
Those are callback-local grouped compiler records, NOT an exact whole-request construction count.
Its observed Program has20369 sources:20000project/256SDK/113other; roots20002,20000project.
Direct earlier definition snapshots and rename report ProgramSequence1/checkerSequence1 in this Worker context;
rename reports all20000project and256SDK SourceFiles already observed, zero first-observed for each.
This supports reuse of the observed Program/ASTs; it does not mean only the2-file static target closure entered Program.
`semantic.prepare.complete`254.831ms and the callback18.326ms sit inside the1433ms rename window, not extra
intervals added to the table. Remaining rename-window work is unassigned.

`compiler-query-timing.ts:152-166` times the callback then gathers stats. `typescript-language-service.ts:347`
programFileStats calls service.getProgram after that timer, and the trace-only stats walk Program files/get the checker.
That diagnostic cost is not separately timed. Zero callback events cannot prove no build attempt anywhere else.
The profile11739ms versus ordinary cold median10747ms is a descriptive different-run difference, not a pure
instrumentation-overhead estimate. GC pause time and actual read/realpath API/syscall counts remain UNMEASURED.

| Closed candidate profile | Before readiness window | Rename window | After readiness window | Program/project sources | Rename callback |
| --- | ---: | ---: | ---: | ---: | ---: |
|128 cold|40|50|47|497/128|9.360|
|2048 cold|515|203|516|2417/2048|11.807|
|20000 cold|5014|1433|5290|20369/20000|18.326|
|20000 warm|4975|1517|5187|20369/20000|18.248|

Every selected window enqueues exactly readiness/rename/readiness. Each row is ONE diagnostic sample;128 has
additional client-to-first-admission time outside these three windows. The ordinary three-round table remains
the performance authority. These measurements prioritize the global observation path, not a blanket Program
rebuild, SDK reparse or scheduling explanation. They do not by themselves establish end-to-end asymptotic complexity.

Next bounded diagnosis: measure capture versus admission/source-fence portions and real path/read call scope
in a separate protected run after current timed controls; inspect redundant work without dropping before/after
freshness, input-revision rejection or correct complete edit sets. No product fix is applied in this checkpoint.


Further profile coverage extraction is now qualified by a3-test CLI and exact replay; the initial wrong method/event
mapping remains explicitly unqualified evidence. Candidate actual Program project sources are128/2048/20000/2
for increasing unrelated-source counts, versus128/2048/20000/30000 for real dependencies. These are post-query
profile observations only. See the actual Program coverage table in the scale-comparison report; no inference from
static2-file closure or Native indexed count is substituted for these measurements.


One proposed shortcut is already ruled out by source inspection: canonicalSourcePath and guarded disk reads
already use fs.realpathSync.native (`physical-path-identity.ts:8,32`, `workspace-disk-source.ts:37,75`).
Switching from legacy to native realpath is therefore not an unimplemented gain. Actual call multiplicity and
exclusive costs still require the bounded probe; no identity/final-fence check is removed based on this observation.


### Bounded namespace probe preparation (not a project measurement)

The independent diagnostic-copy injector and runtime now pass9 small CLI/real-Node fixture tests, with
RED/GREEN logs and source hashes in `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/namespace-probe-preparation-proof.json`.
The79-asset timed candidate, controllers and product source remain unchanged. The exact Worker52b5296b
in-memory injection layout passes; no generated diagnostic Worker has run on a project at this checkpoint.

The probe separates synchronous readiness invocation, namespace capture, input admission, membership refresh
and readiness validation. It preserves returned Promise identity and therefore does NOT claim to time asynchronous
settlement. Filesystem API counts/times are inclusive; the separate outer-call union avoids double adding nested
API calls. These are JavaScript API observations, not physical disk I/O or kernel syscall counts. Own log I/O is
excluded from counters, but instrumentation overhead still requires a separate uninstrumented comparison.
Actual project file/read/realpath counts remain UNMEASURED pending protected replay after topology timing.

Context7 resolution failed at transport; no fetched Context7 result is claimed. API semantics were checked against
the pinned official [Node20.19.5 fs documentation](https://nodejs.org/download/release/v20.19.5/docs/api/fs.html#fsrealpathsyncnativepath-options)
and [monotonic performance clock documentation](https://nodejs.org/download/release/v20.19.5/docs/api/perf_hooks.html#performancenow).


Probe v2 adds exact-string realpath argument counts (total, distinct, maximum repetition, non-string calls
separate);10 fixture testsPASS, including Buffer arguments and nested phase count characterization.
RED/GREEN logs and the previous v1 sources remain archived. Receipt:
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/namespace-probe-preparation-proof-v2.json`.
This is still PREPARED_NOT_REAL_PROJECT_RUN; distinct argument strings are not distinct physical files.


### Independent diagnosis launched after timed controls

Topology30 controller exited0,145rows allPASS (108ordinary/36trace/1calibration). Scale28 and density29
also terminal. `serial-matrices-endpoint-audit-20261110.json` verifies all per-run configs against158
actual current/parent runtime files,3536 available SDK inputs, and logged power windows. Endpoint equality
is not intermediate physical identity continuity or a complete SDK. The first read-only audit attempt assumed
a top-level density candidate field and failed before any decision; corrected audit uses per-run configs and
preserves the existing exact snapshots. Bulk payload/resource audits are still pending.

Independent SCALE004 runs are under `namespace-final-20261109/scale004-independent-probe-20261110`.
The copied fixture has20000 source files with all input byte hashes matching its source; original untouched.
A complete copied runtime changes only semantic-worker.cjs by tested diagnostic injection, from52b5296b
to cc65a3a4c0d7a40731c3ce2c44da83783c6d8c0ad598138264f485e28ada209e.
Ordinary control uses the original frozen runtime and has now started. Profile control and probed-profile
are prepared, not yet run at this checkpoint. Each uses a fresh isolated application cache and the unchanged
17-operation public oracle. These are independent single diagnostic controls, not additional ordinary
three-round acceptance or real UI. Failures, existing guards and complete-result assertions remain intact.


The first independent ordinary control endedFAIL:17operations all exact-oraclePASS and acknowledged
shutdown/exit0, but sandbox `spawnSync /bin/ps EPERM` prevented resource/owned-process closure and
therefore database postflight. Preserve `ordinary-control-environment-failure.json` and the raw result;
this is not an accepted whole run. Process access was then checked with authorized unsandboxed ps exit0,
and a separate fresh-cache `ordinary-sampled-control` was launched with the unchanged driver/guards.
No product/timeout/resource threshold or correctness assertion was changed. The earlier unqualified
run's timings remain descriptive evidence, not a replacement for sampled controls. Controller power
windows above include predecessor wait time; they are not cumulative active workload or formal endurance.


## Closed independent20K controls: actual phase/API evidence

All three sampled controls completed17 exact-oracle operations, shutdownACK/exit0, no manual intervention,
no open progress, observed-owned PID closureCLOSED, SQLite integrityPASS and runtime artifacts unchanged.
The prior sandbox-EPERM run remainsFAIL and is not included below. Each row is ONE diagnostic session;
these are not three-round medians. Same copied20000-source input/root/SDK/query order, separate fresh
application cache per run; physical OS cache uncontrolled. The copied Worker is diagnostic-only, not a product fix.

| ms | ordinary control | original profile control | additional namespace probe |
| --- | ---: | ---: | ---: |
| definition-first | 1988.41 | 2849.01 | 2911.74 |
| completion-first | 945.96 | 1768.53 | 1796.35 |
| references-first | 17203.55 | 14602.38 | 15356.83 |
| rename-first | 11369.61 | 12175.33 | 13029.94 |
| edit-first-references | 17020.05 | 17864.69 | 18740.65 |
| origin-rename-first | 15143.99 | 16904.27 | 17587.20 |

Different-run differences are not pure instrumentation overhead: notably first-reference control values
vary in both directions. The original ordinary three-round scale tables remain the distribution authority.

Probe public rename id8 took13029.942ms. Exactly two non-overlapping synchronous readiness invocation
windows occur inside it; both returned the original Promise, whose settlement is not timed by this probe.

| phase ms | before root25 | after root31 |
| --- | ---: | ---: |
| prepare-root | 428.857 | 423.593 |
| input-admission | 0.759 | 0.941 |
| source-namespace | 5236.975 | 5148.939 |
| readiness-validation | 0.662 | 0.713 |
| root inclusive | 5669.002 | 5576.460 |

Root invocation union11245.462ms =86.305% of the public request. Remaining1784.479ms is outside
these invocation windows and is NOT exclusively compiler work. Namespace stages total10385.914ms
and include their832.520ms membership-refresh children; do not add those children again.
Input admission and readiness validation are each below1ms in these two observations.

Each namespace stage measures20000openSync,40000readSync,40000fstatSync,20000closeSync,
80012lstatSync,40007statSync and60013realpathSync.native API invocations. Actual roots include
60289realpath calls each after prepare-root/admission, so the two entire roots total120578;
namespace-only total120026 must not be mislabeled as the whole request. Each namespace realpath
histogram sees20002 distinct exact string arguments; physical inode count and SDK/project argument
buckets were not captured. Source bytes are small enough for the guarded read plusEOF probe;
readSync counts are not physical disk reads or parsed-file counts.

Namespace filesystem API outer-call union3732.066/3685.514ms; native realpath inclusive2189.242/2157.935ms.
The APIs are non-nested in these namespace samples, but these times remain nested inside namespace/root
wall time. Native realpath accounts for4347.177ms (33.363% of public rename) in this diagnostic run.
The remainder includes unseparated hashing, URI/path work, decoding, instrumentation and possible runtime
pauses; no exclusive GC, kernel syscall or physical I/O attribution is available.

The three per-source realpath sites are `document-store.ts:332` (canonicalSourcePath) and
`workspace-disk-source.ts:37,75` (guarded pre/post identity). The latter must still detect path replacement
and aliases; source enumeration already derives physical identities from witnessed non-symlink directories
(`workspace-source-enumerator.ts:95-132`). This makes redundant initial canonicalization a bounded
optimization candidate, not permission to memoize stale identity across requests or drop final checks.
Whether existing membership ownership can safely supply that initial expected path still needs a failing
regression covering root aliases, retargeted roots/directories, missing/replaced inputs and cancellation.

Global complete-query proof currently reads all admitted sources even for a small target closure.
An incrementally reused Program does not imply a cached complete disk-namespace proof. Parent timings
exclude the new missing-source/in-flight-complete-rename safeguards; compare correctness and cost together.
This evidence does not justify restoring incomplete edit sets, removing before/after freshness, or claiming
the required global observation can be constant-time under arbitrary unnotified disk changes.

Evidence: `scale004-independent-probe-20261110/diagnostic-controls-and-rename-phases.json`, all three
`result.json`/wire/log/resource files, `namespace-phases.1.ndjson` (96closed phases/16root invocations,
zero probe write errors), original sandbox failure receipt and preparation/source-byte manifests.
No product fix has been applied at this checkpoint; IDX-V1-SCALE-004 remainsOPEN.


### First bounded optimization implemented; acceptance pending

`src/core/workspace/admitted-project-source-read.ts` isolates admitted-read physical-path handling.
Only a complete native catalog may supply the expected physical path derived from its witnessed lexical
scan origin and canonical physical root. Both live readDiskSource realpaths remain; injected/partial
catalogs use ordinary canonicalization. No cross-request proof validity, source-byte, final membership
or request revision check is removed. `document-store.ts`1567->1561lines (existing migration debt).

Before implementation, three characterization cases passed; the new fourth test failed with actual
3realpaths versus expected2. Minimal implementation and extra boundaries now pass22tests across four
files, including catalog alias identities, cancellation and test-layer manifest. A same-inode hardlink
alias retarget verifies that the post-read physical path check is still effective; injected/partial catalogs
explicitly retain3calls. TypeScript check and runtime buildPASS. Manifest registration initially missed
the fixed entry/layer count assertions; both failures are preserved, final exact332/138 counts and
new explicit unit-contract assignment pass. No assertion was relaxed.

Four actual framed-stdio LSP regression files passed22tests,0fail/skip in25.129s, covering silent source
lifecycle, membership recovery, rename completeness and disk-source protocol. All are the new product
build; these are not the22 port/manifest checks above and not a whole gate. Post-run fixture and
SDK byte/link identities matched; all three diagnostic runtime manifests stayed unchanged.

Current-source full check and optimized20K replay remain pending. Old frozen runtimes and all timing
evidence above are unchanged; no deployment, commit, push or merge. This does not closeSCALE004
or erase unavoidable global observation costs. ADR0043 clarifies expected-path versus current-proof
ownership without changing0036/0044 constraints or itsProposed status.


## IX20 final complete-check result

The repaired candidate source snapshot `68aa4629acb6683a330b85ff7f4d795a128dee6833b48f80b9239e38c255b68f` passed the fresh complete gate: **2463/2463**, zero failures, skipped, cancelled or todo; 4121.232 seconds wall time, ended 2026-11-10T12:11:15.096391Z. All2441 source inputs and the79 runtime assets matched the recorded candidate. Rust evidence is exact249-input reuse, not a fresh cargo run. Evidence: `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/ix20-terminal-qualified-check-receipt.json`. The intervened IX19 failure remains preserved; it is not relabelled PASS.

Photos32 is a separate, ongoing protocol-driven single-session soak; its completion and post-fix scale performance have not yet been established. This is not real Zed UI acceptance.


## Current scale33 first ordinary20K sample: tail retained

Current source68aa4629 trial0/cold/unrelated20000 returned correct results for all17operations but first rename took27123.95ms; same-cell pre-optimization f332 sample10847.80ms. Current repeat12642.42ms versus10953.32ms; edited-first references18194.10ms versus16465.60ms. This one sample does not establish a regression cause, a median or an asymptotic trend. It does disprove any claim that the bounded realpath change has already demonstrated an end-to-end benefit. All samples remain in the scheduled three-round comparison; no threshold or assertion changed. Raw result hashes and all17timings: `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/scale33-first20k-cold-tail.json`. Actual phase attribution remains pending; do not assign this to GC, compiler rebuilding, queues or filesystem costs without further evidence.


### Current27.1s sample: bounded parent-log evidence

Exact public request8 and serial trace13readiness→14rename→15readiness are now correlated. Nonoverlapping epoch-log windows: before-readiness16964ms, rename1116ms, after-readiness8967ms, all inclusive of responses/checks/continuations. Same-server monotonic first two boundary intervals are16982.059/1116.784ms. Parent admission→send0.730/3.611/0.809ms; Worker received→dispatch0.155/0.381/0.214ms. No competing request is shown inside this serial interval. These measured handoffs do not explain27seconds as queue contention. Readiness internals, actual compiler builds/GC and filesystem time remain UNMEASURED for this ordinary cell. Public monotonic elapsed27123.955ms differs from its epoch delta27102ms, so do not combine clocks into an exact additive stage total or exclusive percentage. Receipt pins the complete100714-byte server log and selected events: `namespace-final-20261109/scale33-first20k-cold-parent-windows.json`.


### 2026-11-11: current IX20 three-control proof-cost observation

A separate copied20K-unrelated fixture was measured using the unchanged17-operation
public protocol oracle: ordinary control, profiling control and profiling plus
namespace probe all passed17 operations and normal shutdown. Each is **one**
serial sample, not multiround speedup evidence. First rename measured10283.51,
11178.68 and11962.02ms respectively; edit-first references15984.27,16712.46 and
17682.62ms. Sequential samples cannot quantify causal instrumentation overhead.
The runtime158-asset, source20000-file and SDK3536-file postflight matched their
pinned inputs; the complete SDK manifest remains partial in capability terms.

Within instrumented rename request8, two actual synchronous readiness invocations
(root25 before,31 after) total10269.31ms of the11962.02ms public request. Their
intercepted filesystem API union totals6521.86ms **inside** those windows; do not
add it again. Each window calls native realpath40289 times, stat40273,
lstat100030, open20000, fstat40000, read40000 and close20000. These are intercepted
API counts, not kernel syscalls, physical reads or distinct file counts. The
realpath argument set has20002 distinct strings, not20002 physical identities.
At least40000 realpaths are the pre/post identity checks on20000 project sources;
the additional289 calls have not been attributed per namespace.

The prior optimization is active: the per-source redundant first realpath is
removed, reducing project path proofs from3 to2 per file. Full-source byte proof,
pre/post identity checks and membership fences remain, so this does **not** prove
end-to-end scale independence or faster rename. DocumentStore.read performs the
admission lstat; readDiskSource checks regular-file and expected identity, opens
and checks the handle before/after reading, and verifies the final named path;
projectSourceNamespace hashes all member bytes and refreshes membership afterward.
The present disk-authority contract deliberately does not trust missing watcher
notifications or reuse stale byte proof. Avoiding these reads safely needs proof
lifetime evidence; no whole-project cache shortcut was added in this diagnosis.

The readiness wrapper returns a Promise: these measurements capture synchronous
invocation only, not promise settlement, exclusive compiler/GC time or async
waiting. Request containment uses matching wall-clock begin/end events; mixed
performance.timeOrigin and epoch clocks differ by about22ms and must not be
summed. The remaining public time is **unattributed**, not presumed CPU/compiler.
Independent raw/receipt: namespace-final-20261109/scale004-ix20-probe-20261111/
postflight-and-rename-phases.json and namespace-phases.1.ndjson SHA256
4ce04bbdafdf2f0fc69d63e9663322a2c6169ad00a915c390c288761909dc42d.
This is protocol diagnosis, not UI, new-format9 acceptance or a complexity proof.
