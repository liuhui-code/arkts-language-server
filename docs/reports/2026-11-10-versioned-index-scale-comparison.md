# Versioned index scale comparison: stopped for diagnosis

CURRENT:95 recorded sessions,67PASS/17WITH_FUNCTIONAL_GAPS/11FAIL. One current candidate ordinary completion
hit the unchanged30s execution deadline;10 other failures are retained baseline capacity failures.
Two ordinary trials complete; third incomplete,2 last baseline cells and32 profiles NOT_RUN. Density25/topology26 NOT_RUN.
First-trial tables below remain historical single samples, not final multi-round medians.
[Failure, independent strict diagnostic and root-lifetime evidence](2026-11-10-30k-ordinary-completion-deadline.md).

Candidate is the frozen IX17/Photos23 runtime, parent298d65f plus candidate changes; baseline is pinned298d65f.
Detailed runtime/SDK hashes, normal closure/integrity and request records are linked in each result.
Node20.19.5, real API24 SDK remains partial. No product timeout/memory/scale threshold changes.
New facts write scaling has a separate index-only persisted-source fixture; do not substitute its absent-SDK setup here.

## Input and cache semantics

Two modes: unrelated grows total source inventory while static target closure stays fixed; dependencies grows real reachable closure.
The latter also changes source bytes and topology, so it is not an isolated fanout/depth or single-variable complexity experiment.
Dedicated density25/topology26 controls remain pending. Static closure != actual Program membership; trace counts are pending.
Cold: new Node process and empty application index. Warm: another new Node process with retained disk index,
NOT a retained Program or a proven result-cache hit. OS page cache uncontrolled. Both states remain separate.
Each row below has exactlyONE sample, not a multi-round median/max. Failed/gap times are not successful operation latencies.

## First ordinary trial: public response times (ms)

D=definition-first, C=completion-first, R=rename-first, ER=edit-first-references.
GAP/FAIL explicitly label error responses; UNMEASURED means execution stopped before that operation.

| Mode | N | Runtime | Index state | Session | D | C | R | ER |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: |
| unrelated | 128 | candidate | cold | PASS | 70.913 | 87.050 | 118.545 | 252.471 |
| unrelated | 128 | candidate | warm | PASS | 79.518 | 87.134 | 119.014 | 252.398 |
| unrelated | 128 | baseline | cold | PASS | 73.039 | 83.031 | 39.202 | 179.003 |
| unrelated | 128 | baseline | warm | PASS | 79.934 | 58.800 | 38.684 | 177.874 |
| unrelated | 2048 | candidate | cold | PASS | 201.499 | 143.958 | 1290.652 | 1719.449 |
| unrelated | 2048 | candidate | warm | PASS | 201.752 | 142.817 | 1291.400 | 1752.197 |
| unrelated | 2048 | baseline | cold | PASS | 207.653 | 107.614 | 71.179 | 646.355 |
| unrelated | 2048 | baseline | warm | PASS | 201.754 | 105.962 | 70.407 | 623.009 |
| unrelated | 20000 | candidate | cold | PASS | 1790.248 | 823.758 | 10803.157 | 15029.154 |
| unrelated | 20000 | candidate | warm | PASS | 1918.234 | 837.609 | 10250.391 | 15330.420 |
| unrelated | 20000 | baseline | cold | PASS | 1819.671 | 487.357 | 299.980 | 5127.883 |
| unrelated | 20000 | baseline | warm | PASS | 1889.791 | 487.637 | 299.287 | 5099.575 |
| unrelated | 30000 | candidate | cold | COMPLETED_WITH_FUNCTIONAL_GAPS | 691.641 | 627.101 | FUNCTIONAL_GAP 329.017 | FUNCTIONAL_GAP 1238.020 |
| unrelated | 30000 | candidate | warm | COMPLETED_WITH_FUNCTIONAL_GAPS | 620.791 | 606.869 | FUNCTIONAL_GAP 380.549 | FUNCTIONAL_GAP 1179.356 |
| unrelated | 30000 | baseline | cold | COMPLETED_WITH_FUNCTIONAL_GAPS | 624.321 | 599.054 | FUNCTIONAL_GAP 394.160 | FUNCTIONAL_GAP 70.196 |
| unrelated | 30000 | baseline | warm | COMPLETED_WITH_FUNCTIONAL_GAPS | 620.833 | 626.284 | FUNCTIONAL_GAP 331.520 | FUNCTIONAL_GAP 65.008 |
| dependencies | 128 | candidate | cold | PASS | 99.362 | 61.567 | 120.680 | 259.850 |
| dependencies | 128 | candidate | warm | PASS | 103.907 | 62.488 | 120.029 | 262.651 |
| dependencies | 128 | baseline | cold | PASS | 95.626 | 57.393 | 38.408 | 193.899 |
| dependencies | 128 | baseline | warm | PASS | 101.353 | 56.988 | 36.994 | 187.224 |
| dependencies | 2048 | candidate | cold | PASS | 383.247 | 323.110 | 1247.176 | 1984.980 |
| dependencies | 2048 | candidate | warm | PASS | 407.884 | 307.722 | 1244.063 | 1982.541 |
| dependencies | 2048 | baseline | cold | PASS | 402.808 | 266.645 | 372.179 | 912.043 |
| dependencies | 2048 | baseline | warm | PASS | 409.214 | 263.037 | 374.556 | 894.326 |
| dependencies | 20000 | candidate | cold | PASS | 3542.751 | 2565.425 | 12130.935 | 18277.119 |
| dependencies | 20000 | candidate | warm | PASS | 4001.352 | 2550.029 | 12212.599 | 18228.585 |
| dependencies | 20000 | baseline | cold | FAIL | FAIL 743.732 | UNMEASURED | UNMEASURED | UNMEASURED |
| dependencies | 20000 | baseline | warm | FAIL | FAIL 724.955 | UNMEASURED | UNMEASURED | UNMEASURED |
| dependencies | 30000 | candidate | cold | COMPLETED_WITH_FUNCTIONAL_GAPS | 17576.674 | 15914.064 | FUNCTIONAL_GAP 399.199 | FUNCTIONAL_GAP 1651.945 |
| dependencies | 30000 | candidate | warm | COMPLETED_WITH_FUNCTIONAL_GAPS | 17310.649 | 16194.693 | FUNCTIONAL_GAP 390.862 | FUNCTIONAL_GAP 1601.946 |
| dependencies | 30000 | baseline | cold | FAIL | FAIL 14579.512 | UNMEASURED | UNMEASURED | UNMEASURED |
| dependencies | 30000 | baseline | warm | FAIL | FAIL 14620.536 | UNMEASURED | UNMEASURED | UNMEASURED |

## Boundaries and observed concerns

- Old true-dependency20K/30K baseline refuses definition at its4096 configuration-witness capacity boundary,
  separately confirmed by actual trace preflights and strict normal-close/artifact/integrity controls.
  All4 ordinary failures remainFAIL; later operations areUNMEASURED, not excluded successful samples.
- Candidate true-dependency20K cold/warm complete exact result oracles; cold edit-first references18.277s.
  Functional availability beyond the old refusal does not mean acceptable tail latency.
- Both unrelated runtimes at30K and candidate true-dependency30K have full references/rename gaps.
  Current incomplete membership policy changes the exercised path at this boundary; faster rejected or partial paths
  cannot be compared to complete20K searches as successful scale improvements.
- Candidate true-dependency30K definition-first17.577/17.311s and completion-first15.914/16.195s (cold/warm)
  are recurring slow observations across two new processes. No exact phase or O(N)/O(N squared) attribution yet.
- First2048 observations show candidate edit-first references slower than baseline. No universal speedup is claimed.
  Follow actual trace/readiness/freshness evidence before proposing a fix; unrelated cache TODO remains paused.

## Evidence and remaining work

Evidence root `.bench/index-versioned-maintenance-20261104`:

- namespace-final-20261109/scale24-first-ordinary-trial-complete.json:32 result paths/hashes, preparation,
  complete operation outcomes and explicit unexecuted rows; source for the table above.
- scale-acceptance-24/execution.json: actual serial controller status, known failures and supporting diagnostics.
- scale-acceptance-24/scale-runs/*: exact UTF-16 positions/symbols/edits, full wire, results, resource and integrity evidence.
- scale-acceptance-24/fixtures/*.manifest.json: input hashes and static import graph measurements.
- namespace-final-20261109/scale24-measurement-coverage-audit.json: Program/trace counter scope and unmeasured read/realpath totals.

Summary tool controls6PASS verify that failures, unfinished samples, calibration, ordinary/profile, runtime,
source count/mode and new-process cache states stay separate. No physical write bytes inferred from logical facts/DB/WAL sizes.
Full3-trial ordinary distributions, separate profile interpretation, density and topology comparisons remain incomplete.
[Actual original Photos30K single-session endurance and remaining gaps](2026-11-10-photos30k-final-protocol-endurance.md).
No product edits during the frozen matrix, no commit/merge/deployment/release. UI NOT_RUN, Windows SSH timeout.

## Second ordinary trial actual completion

All32 second-trial cells completed:22PASS,6WITH_FUNCTIONAL_GAPS,4retained old-baselineFAIL.
Together the two ordinary trials contain64 cells:44PASS/12gaps/8FAIL, calibration excluded.
Every completed row retains result path/SHA, exact operation responses, normal closure/integrity and artifact checks.
Runtime order is reversed in trial1 relative to trial0; this controls order partly, not OS-cache state.
Third ordinary trial is active, separate trace/density/topology still pending. This is not final3-sample statistics.
Second-trial evidence: namespace-final-20261109/scale24-second-ordinary-trial-complete.json.

## Read-only diagnostic before profile completion: measured ordinary queue scopes

Three pending explanations were kept separate: extra full-input proof work, repeated Program update,
and background/queue waiting. No product fix was made from these hypotheses.
`project-source-namespace.ts` iterates membership, reads available disk sources and sorts digest entries
when full capture is requested. `reference-cache-admission.ts` and the Native strategy entry request
before/after source admission; `ReferenceNamespaceAdmission.run` provides separate edit-set fences.
A known partial SDK disables the optional legacy cache capture but does not authorize removing mandatory Native source identity.
This is a verified static call chain, not a measured number of filesystem calls or exclusive query cost.

Actual closed first-trial unrelated20K ordinary edit-first-reference windows:

| Runtime | Public ms | Worker dispatch methods observed | Diagnostic quiescence ms | Parent admission-to-send max ms | Worker receive-to-dispatch max ms |
| --- | ---: | --- | ---: | ---: | ---: |
| candidate | 15029.154 | semanticReadiness2, references1 | 0.216486 | 0.370116 | 0.189796 |
| baseline | 5127.883 | references1 | 0.225638 | 0.451020 | 0.216764 |

Thus diagnostic quiescence cannot explain most of this particular candidate sample. These narrow queue measures
do not include undelivered-message time, every earlier task or all compiler/filesystem work.
No cross-isolate monotonic clocks were subtracted; nested durations were not summed.
Query-certification events cover certification, NOT entire preparation or source-namespace capture.
The extra public elapsed difference cannot yet be assigned wholly to namespace proof or Program rebuilding.
Evidence with timestamp-window selection and original events:
namespace-final-20261109/scale24-20k-edit-reference-ordinary-queue-observation.json.
Program identities/build counts and detailed compiler phases still await independent profile sessions.

### Nonoverlapping observed dispatch windows for the15.03s sample

Actual logger plumbing was checked: Worker `postLog` sends fields; Parent `semantic-worker-host.ts:236-238`
invokes StructuredLogger, which creates `ts` at receipt. Therefore these are parent-log receipt windows,
not exact internal compiler/proof start/end timestamps. The two intermediate spans also agree with
SAME Worker/epoch dispatch-monotonic differences; no cross-isolate clocks were subtracted.

| Observed window | Wall ms |
| --- | ---: |
| client send to first readiness-dispatch log | 3 |
| first readiness-dispatch log to reference-dispatch log | 4736 |
| reference-dispatch log to last readiness-dispatch log | 5499 |
| last readiness-dispatch log to client response | 4791 |

These disjoint windows total15029ms (client monotonic15029.154ms); they are not summed with nested queue/
certification measurements. Before/after windows total9527ms, localizing most extra work around the added
source-admission flow, but not proving9527ms exclusive filesystem/hash/Program CPU.
Static complete-source capture iterates members/reads/digests/sorts; semanticReadiness also performs input admission/readiness.
Which exclusive substeps dominate remains UNMEASURED until further instrumentation/profile evidence.
For incomplete membership, project-readiness returns before full namespace capture; rejected30K references
therefore do not perform the same work as successful20K references. This is a code-path boundary, not a speedup claim.
Evidence: namespace-final-20261109/scale24-20k-edit-reference-dispatch-windows.json, original closed logs and request10.
No Native source identity/final freshness fence is removed to make this observation faster.

### Full proof inner-loop source audit: Map lookup versus actual disk authority

`project-source-namespace.ts` full capture loops members and reads/hashes each admitted disk source,
sorts digest entries and refreshes membership afterward. `document-store.ts:311` tokenFor uses Maps,
not an N-member includes scan for every file; this checked inner lookup does not establish an N-squared search.
`read:322` rechecks token, lstat, canonicalSourcePath/root boundary and safeRead.
`physical-path-identity.ts:29` normally realpaths once; `workspace-disk-source.ts` expected-physical successful path
realpaths before/after fd/name identity checks, with lstat/open/fstat/bounded read and stability/UTF8 validation.
Thus there are three explicit realpath sites on this successful per-file path, not a measured syscall count.
Fallback/overlay/error paths and membership scans differ; no actual3N/6N total or complexity claim is inferred.
`refreshMembershipSnapshot` really scans/compares, not a constant-time revision read.
This proof step reads/decodes/hashes source text; it is not compiler AST parsing. Engine input admission/readiness
can perform other work separately; its exclusive costs remain to be measured. No identity guards removed.
Exact source hashes/call chain: namespace-final-20261109/scale24-source-proof-disk-read-call-chain.json.


## New IX18 candidate: scale28 first unrelated-file trial only

This separate current-candidate checkpoint does not replace the failed scale24 history above.
All16 cells (128/2048/20000/30000; candidate/baseline; cold/warm) of the first ordinary unrelated-file trial
are terminal. The target static dependency closure is fixed by the fixture; actual compiler Program counts
are not inferred from that closure. Raw result paths and SHA256s, every operation/outcome and resource peaks:
`namespace-final-20261109/scale28-first-unrelated-trial-receipt.json`.
No raw-log aggregation or competing profiling was run during ordinary timing. Three-round medians/maxima remain pending.
Cold/warm here describe index cache/new-process sessions; neither implies a result-cache hit.

The following are individual first-trial samples in milliseconds, cold / warm, not multi-round statistics:

| Unrelated project source count | Candidate first definition | Candidate first completion | Candidate edit-first references | Baseline edit-first references |
| --- | --- | --- | --- | --- |
|128|79.89 /80.17|72.49 /74.60|324.05 /295.59|203.83 /204.58|
|2048|290.01 /215.88|175.65 /255.75|1836.95 /1833.17|759.08 /758.10|
|20000|1992.41 /1893.61|910.65 /899.18|16465.60 /16365.51|5645.28 /5621.25|
|30000|774.63 /685.35|46.84 /43.99|FUNCTIONAL_GAP,1304.42 /1319.52|FUNCTIONAL_GAP,71.38 /83.71|

Both candidate30K sessions have8 retained full-reference/rename gaps each; they are not full functional PASS.
The partial-membership branch changes which work runs, so the30K rejected-reference time cannot demonstrate
better scaling than20K successful references. No error sample is discarded from the matrix.
The fresh samples continue to show full-scope work growing with unrelated file count through20K, and current
edit-first reference latency is worse than the pinned baseline in this trial. Prior source-namespace capture
and dispatch evidence above provides a mechanism to investigate; it does not establish an exclusive timing
attribution for these new samples. No claim of O(1), O(N), or a universal speedup follows from one trial.
True dependency-growth runs are now executing; later ordinary rounds and separate traces remain required.


### Current first true-dependency20K cold session

TerminalPASS at2026-11-10T04:46:39.446Z;17 measured functional operations passed their oracles,
19 protocol requests including initialize/shutdown. Normal acknowledged shutdown/exit0; no interventions,
artifact identity unchanged, DB integrityPASS, no new findings. This is one ordinary cold sample, not a multi-round result.
First/repeat definitions4048.945/4853.144ms; first/repeat completion2776.156/2679.837ms;
edit-first references19581.947ms; declaration-origin first rename23045.188ms.
Node RSS peak1752.535MiB, actual Native48.832MiB, sampled tree1800.242MiB; separate peaks are not added.
Partial API24 SDK is explicitly reported as `sdk-inputs-incomplete`/`declaration-not-found`.
Preparation `sourceNamespace.sources=20000` measures the source namespace proof, not actual Program membership.
The fixture static closure is20000; actual ordinary Program source count remains unmeasured here pending trace.
Full response/oracle authority remains raw session evidence. Selected receipt/hash:
`namespace-final-20261109/scale28-20k-dependency-first-cold-receipt.json`.
These slow but correct responses do not demonstrate acceptable tail latency or complete SDK support.


The paired first-trial20K warm-cache/new-process session also terminatedPASS at04:50:06.840Z,
17 functional operations/19 protocol requests, no limitations/findings, artifacts unchanged, normal exit0,
DB integrityPASS. Edit-first references19417.584ms; declaration-origin first rename23098.400ms.
Node RSS peak1809.336MiB, actual Native84.895MiB, sampled tree1893.527MiB.
Cold/warm similarity here is an observed pair, not three-round statistics or a proof of result-cache hits.
Receipt: `namespace-final-20261109/scale28-20k-dependency-first-warm-receipt.json`.


### Current first true-dependency30K cold session

First ordinary cold session terminated `COMPLETED_WITH_FUNCTIONAL_GAPS`, with8 retained full-scope gaps,
no new findings, normal process closure and integrityPASS. First/repeat completion2855.8/3139.0ms,
first/repeat definition19185.7/5676.1ms. The prior ordinary completion deadline did not recur in this sample;
this is not a multi-round fix certificate, an OOM resolution claim, or complete30K references/rename support.
Receipt/result hash: `namespace-final-20261109/scale28-30k-dependency-first-cold-receipt.json`.
Separate traces and later ordinary trials remain pending; actual compiler source count is not derived from30000 native sources.


## Scale28 first ordinary trial closed:32 cells

Receipt: `namespace-final-20261109/scale28-first-ordinary-trial-complete.json` pins every result SHA,
individual operation/outcome, preparation, resource peaks and process/DB closure status.
Calibration and two baseline capacity preflights are separate; the32 cells include every planned ordinary
trial0 mode/count/version/cold-warm combination, including failed cells.

| Version | PASS cells | Completed with functional gaps | FAIL cells |
| --- | --- | --- | --- |
| Current IX18 candidate |12|4|0|
| Pinned298d baseline |10|2|4|
| Total |22|6|4|

The four baseline failures are the retained true20K/30K capacity rejections, not candidate victories;
subsequent operations in each failed session are unmeasured. Six gap cells are not feature PASS.
Candidate true30K warm first/repeat completion3418.73/2839.09ms, first definition19093.45ms;
normal closure and integrityPASS. Neither candidate cold nor warm repeated the old completion deadline,
but both retain8 full-reference/rename gaps and material definition latency.
Trial1 now starts with the reverse version order; trial2 and separate profiling still follow.
No three-round median/max, result-cache-hit guarantee or asymptotic complexity conclusion is available yet.


## Second ordinary unrelated-file subset closed

All16 reversed-version-order unrelated-file cells are complete:12PASS/4functional-gap cells, no new failure.
Every result/hash, individual operation, limitation and closure is preserved in
`namespace-final-20261109/scale28-second-unrelated-trial-receipt.json`.
Second-trial20K edit-first references: candidate cold/warm16456.967/16465.388ms,
baseline5682.813/5620.924ms. The first-trial regression persists with reversed version order;
this does not assign exclusive internal cost or establish asymptotic complexity. True-dependency trial1 is running;
third ordinary trial and separate profiling remain pending. No failed/gap sample is removed.


## Scale28 second full ordinary trial closed

All32 trial1 cells closed, reversed version order:22PASS/6functional-gap cells/4retained baseline capacityFAIL,
matching the first-trial classification. Candidate12PASS/4gaps/0newFAIL; baseline10PASS/2gaps/4FAIL.
Across both complete ordinary trials:64cells,44PASS/12gaps/8FAIL; calibration/preflight remain separate.
Receipt `namespace-final-20261109/scale28-second-ordinary-trial-complete.json` contains every result SHA,
operation/outcome, limitation, preparation and closure. No error sample was discarded.
Candidate true30K trial1 cold completion first/repeat2914.63/2783.42ms; warm3425.63/2766.91ms.
Neither trial0 nor trial1 cold/warm candidate session hit the old completion deadline; these four sessions
still have full-scope reference/rename gaps and first definitions around19s. No large-Program identity/build-count
claim is inferred merely from these timings. Third ordinary trial is now running, separate profiling still pending.


### Baseline refusal classification evidence strength

The shorthand baseline capacityFAIL in these tables means an exact first-definition public input refusal matching
independent traced preflights on the same pinned baseline artifacts/root/count. The preflights record
`configuration-witness-capacity`, retainedPaths4096. Ordinary runs intentionally disable that trace; their direct
observations are the exact-32803 message, one failed first operation, unchanged artifacts, positive resource samples,
normal acknowledged shutdown, closed sampled PIDs and integrityPASS. They do not independently log the internal
capacity branch in every ordinary cell. The continuation policy is `baseline_failure.py`, tested against changed
error/phase/artifact/transport/resource/closure cases. All such cells remainFAIL; later operations remain unmeasured.
No candidate failure can take this continuation exception, and no ordinary refusal is recategorized as success.


## Three ordinary unrelated-file trials now complete

48 cells:36PASS/12functional-gap cells. Cold/warm and successful/refusal latencies remain separate;
three-round medians/maxima for completion, definition, local/origin rename and edit-first references are in
[IDX-V1-SCALE-004](2026-11-10-unrelated-file-query-latency-regression.md).
The9-regression stdlib CLI and frozen-input BYTE_IDENTICAL replay are evidence-only tooling outside the frozen
product worktree; no product threshold/source/runtime change or raw-log profiling was made for aggregation.
True-dependency trial2 is still running; independent profiles/density/topology and final resource/native analysis remain pending.


## All96 ordinary cells closed: three full trials

Current IX18 candidate, not the old scale24 runtime. All96 planned ordinary mode/count/version/cache/trial cells
are terminal:66PASS/18functional-gap cells/12baseline public input refusals matching the capacity preflights.
Candidate36PASS/12gaps/0newFAIL; baseline30PASS/6gaps/12FAIL. The12 failed baseline sessions do not acquire
successful latencies for later unexecuted requests. All failures and gaps remain in raw results.
There are1632 protocol requests including initialize/shutdown,1440 measured operation responses:
1284PASS/144functional gaps/12FAIL. Operations are protocol calls, not UI actions.

`namespace-final-20261109/scale28-all-ordinary-terminal-receipt.json` rechecks all96 result hashes and
actual headers:normal server exit0/acknowledged closure, sampled-owned-PID closureCLOSED, DB integrityPASS,
artifact identity unchanged. These process outcomes do not turn query refusals into success or prove unobserved orphan absence.
Definition/reference oracles compare exact locations, rename compares exact versioned edits; completion checks
expected `value` member presence, not every completion-list detail or SDK behavior.

### True dependency growth: three-round medians / maxima

All durations milliseconds; cold/warm mean index-cache state in new processes. Static closure grows with source count,
fanout capped32; this is not a constant-closure experiment. Independent fanout/depth/sharing controls remain pending.
Program source counts/build counts and per-operation cache hits are not supplied by the ordinary summary.
A FAIL response time is not a successful definition; UNMEASURED means execution stopped before that operation.

#### candidate

| Sources | Index cache | First completion | First definition | First local rename | First origin rename | Edit-first references |
| --- | --- | --- | --- | --- | --- | --- |
|128|cold|73.76 / 74.66|100.54 / 101.37|152.37 / 184.96|294.78 / 360.83|300.46 / 301.91|
|128|warm|73.57 / 74.31|103.15 / 104.69|132.05 / 182.35|257.46 / 362.75|304.59 / 310.17|
|2048|cold|333.28 / 333.69|531.76 / 561.03|1302.20 / 1305.34|1980.32 / 1980.76|2102.46 / 2131.04|
|2048|warm|331.23 / 332.58|534.23 / 622.95|1295.18 / 1300.04|1974.00 / 1981.51|2071.84 / 2075.84|
|20000|cold|2759.01 / 2776.16|3976.64 / 4048.95|12868.14 / 12936.05|23327.76 / 23352.73|19581.95 / 19657.87|
|20000|warm|2714.45 / 2741.94|4086.51 / 4136.95|12845.70 / 12846.99|23098.40 / 23154.35|19461.01 / 19576.56|
|30000|cold|2906.08 / 2914.63|19127.13 / 19185.74|FUNCTIONAL_GAP 3/3|FUNCTIONAL_GAP 3/3|FUNCTIONAL_GAP 3/3|
|30000|warm|3420.86 / 3425.63|19011.01 / 19093.45|FUNCTIONAL_GAP 3/3|FUNCTIONAL_GAP 3/3|FUNCTIONAL_GAP 3/3|

#### baseline

| Sources | Index cache | First completion | First definition | First local rename | First origin rename | Edit-first references |
| --- | --- | --- | --- | --- | --- | --- |
|128|cold|69.13 / 69.44|103.39 / 106.31|45.38 / 45.54|80.80 / 86.49|230.89 / 260.12|
|128|warm|69.70 / 75.09|103.16 / 104.25|39.89 / 48.53|57.67 / 58.59|220.97 / 234.00|
|2048|cold|282.91 / 290.16|593.83 / 689.55|250.65 / 262.04|288.75 / 294.27|1043.87 / 1071.47|
|2048|warm|284.18 / 286.79|547.46 / 621.32|242.57 / 245.53|284.68 / 288.59|1035.68 / 1056.64|
|20000|cold|UNMEASURED|FAIL 3/3|UNMEASURED|UNMEASURED|UNMEASURED|
|20000|warm|UNMEASURED|FAIL 3/3|UNMEASURED|UNMEASURED|UNMEASURED|
|30000|cold|UNMEASURED|FAIL 3/3|UNMEASURED|UNMEASURED|UNMEASURED|
|30000|warm|UNMEASURED|FAIL 3/3|UNMEASURED|UNMEASURED|UNMEASURED|


Frozen input `scale28-all-ordinary-input-01.json`, summary `scale28-dependencies-three-trial-summary-01.json`,
independent BYTE_IDENTICAL replay and9-test CLI proof `scale-metrics-cli-proof.json`, under namespace-final-20261109.
For the fixed2-file closure controls see [SCALE004](2026-11-10-unrelated-file-query-latency-regression.md).
Both ordinary axes show material costs, but source-count, effective closure, membership completeness and failure paths
must be separated.30K partial-membership refusals cannot be compared as equivalent faster complete work.

No completion deadline recurred in the six candidate true30K cold/warm sessions across three ordinary trials;
first/repeat completion remains about2.8-3.4s and first definition about19s. This is controlled protocol evidence,
not original real-Zed OOM/continuous-click acceptance. Full30K reference/rename, SDK and UI/platform gaps remain.
Independent profile matrix is now running; density/topology and final Native/resource/raw-wire analysis follow.


## Actual post-query Program coverage in the independent profiles

Measured from tested Worker-name/trace-event mapping, not inferred from fixture closure or Native index count.
All32 profile sessions produce112 uniquely associated post-query observations,4 missing observations for rejected
first definitions,12 operations not executed after those failures. Missing is UNMEASURED, never zero.
Raw hashes, request IDs, Worker epoch/thread/request IDs and metric events:
`namespace-final-20261109/scale28-profile-program-observations-qualified-02.json`.

The candidate's first-definition cold and warm snapshots match for the following fields:

| Fixture mode | Project sources | Static target closure | Program project / total sources | Program project / total roots | SDK / other sources |
| --- | ---: | ---: | ---: | ---: | ---: |
|unrelated|128|2|128 / 497|128 / 130|256 / 113|
|unrelated|2048|2|2048 / 2417|2048 / 2050|256 / 113|
|unrelated|20000|2|20000 / 20369|20000 / 20002|256 / 113|
|unrelated|30000|2|2 / 371|2 / 4|256 / 113|
|dependencies|128|128|128 / 497|128 / 130|256 / 113|
|dependencies|2048|2048|2048 / 2417|2048 / 2050|256 / 113|
|dependencies|20000|20000|20000 / 20369|20000 / 20002|256 / 113|
|dependencies|30000|30000|30000 / 30369|256 / 258|256 / 113|

These are post-first-definition Program sizes, not initialization counts, constructor counts or ordinary-run measurements.
Through20K even the fixed2-file static closure observes every project source in the existing Program.
At30K the incomplete-membership paths diverge: unrelated target loads2 project sources, real import graph loads30000.
A root list of256 in that last case does NOT bound the dependency closure to256 files.
Native indexing30000 in both cases therefore cannot establish either Program size or complete semantic project membership.
Despite the real-dependency Program containing30000 files, full references/rename still require the missing complete
project namespace proof and remain errors; the reported snapshots do not override that refusal.
The113 other sources are the trace classifier's other category, not an independently verified standard-library inventory.

### Root-retention fix: post-query identity evidence

For unrelated30K, both candidate cold/warm definition->completion snapshots keep ProgramSequence1,
checkerSequence1 and project roots2(total4). Parent baseline cold/warm changes observed ProgramSequence1->2,
checker1->2, project roots2->1(total4->3) without an edit. Both keep2 project source files/371total.
This independently corroborates root retention under the public sequence. The baseline completion snapshot also
reuses both project and256SDK SourceFile identities: a new observed Program does not imply full AST reparsing.
Post-query identities cannot count all intermediate/failed Program attempts or parser invocations. Completion metrics
have no grouped createProgram field, so its absence is not converted to zero.

The initial ad-hoc extractor confused LSP names with Worker define/complete and completion.program.complete;
it conservatively marked data missing and is retained as `scale28-profile-program-observations-unqualified-01.json`.
It was not used as measured Program coverage. Corrected evidence-only stdlib CLI has3 public regressions
including4 ambiguity/missing/wrong-URI subcases, a nonterminal refusal and BYTE_IDENTICAL fixed-input replay:
`program-observations-cli-proof.json`, `session-analysis/program_observations.py`(67lines),
`program_observations_test.py`(98lines). No product/runtime/controller change or Node gate count inflation.

Replay from the evidence session-analysis directory, with a NEW output path:

```sh
python3 -m unittest program_observations_test -v
python3 program_observations.py ../scale28-terminal-controller-snapshot.json /private/tmp/scale28-program-replay.json
```

Program/stat getters are trace-only and occur after callback timing; actual source read/realpath counts,
exclusive parse/build costs and exact total Program construction counts remain unmeasured here.


## Closed ordinary initialization and process-peak comparison (pre-optimization)

Exact raw result hashes were rechecked against both48-cell ordinary summaries; all96cells retained,
including the baseline capacity refusals. Values are median/max across3ordinary trials. Init+prepare
and index-ready elapsed clocks overlap; do not add them. Node RSS includes Worker threads; Native
child aggregate separately, tree includes auxiliary descendants. Peak medians/maxima are not
simultaneous stage values or PSS, and a failed short session cannot be called more memory efficient.
This remains f33288b9/Worker52b5296b evidence, not successor028bd76f validation.

| mode | project files | version | process/cache | statuses | init+prepare ms | index ready ms | Node peak MiB | Native peak MiB | tree peak MiB |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| dependencies | 128 | baseline | cold | {'PASS': 3} | 9154.39/9165.42 | 9308.00/9322.00 | 812.23/813.62 | 7.27/7.34 | 819.45/820.89 |
| dependencies | 128 | baseline | warm | {'PASS': 3} | 9048.80/9050.67 | 9206.00/9209.00 | 809.83/813.44 | 3.34/3.36 | 813.18/816.70 |
| dependencies | 128 | candidate | cold | {'PASS': 3} | 9057.83/9074.26 | 9214.00/9227.00 | 798.61/809.73 | 7.80/7.93 | 806.53/817.41 |
| dependencies | 128 | candidate | warm | {'PASS': 3} | 8967.65/9052.98 | 9123.00/9206.00 | 801.54/806.08 | 6.12/6.20 | 807.64/811.82 |
| dependencies | 2048 | baseline | cold | {'PASS': 3} | 11150.49/11245.72 | 11306.00/11403.00 | 881.66/888.80 | 29.70/29.77 | 911.36/918.42 |
| dependencies | 2048 | baseline | warm | {'PASS': 3} | 11059.02/11187.12 | 11211.00/11343.00 | 879.78/884.10 | 6.23/6.24 | 886.02/890.29 |
| dependencies | 2048 | candidate | cold | {'PASS': 3} | 11054.28/11156.00 | 11208.00/11311.00 | 999.61/1009.68 | 15.20/15.29 | 1014.90/1023.96 |
| dependencies | 2048 | candidate | warm | {'PASS': 3} | 11150.64/11241.55 | 11309.00/11410.00 | 1006.54/1006.80 | 17.93/18.76 | 1023.77/1024.73 |
| dependencies | 20000 | baseline | cold | {'FAIL': 3} | 24762.44/24770.29 | 24919.00/24925.00 | 1232.77/1243.86 | 102.60/102.75 | 1317.77/1322.22 |
| dependencies | 20000 | baseline | warm | {'FAIL': 3} | 24158.99/24275.31 | 24310.00/24430.00 | 1351.00/1352.88 | 34.07/34.19 | 1385.07/1386.17 |
| dependencies | 20000 | candidate | cold | {'PASS': 3} | 28235.07/28272.98 | 28389.00/28425.00 | 1752.54/1759.50 | 48.83/49.58 | 1800.24/1806.91 |
| dependencies | 20000 | candidate | warm | {'PASS': 3} | 27972.95/28572.50 | 28128.00/28731.00 | 1751.27/1809.34 | 84.89/86.88 | 1837.58/1893.53 |
| dependencies | 30000 | baseline | cold | {'FAIL': 3} | 11252.18/11258.15 | 11408.00/11738.00 | 1367.38/1370.10 | 110.42/110.53 | 1455.56/1466.82 |
| dependencies | 30000 | baseline | warm | {'FAIL': 3} | 10159.23/10263.14 | 10318.00/10418.00 | 1397.96/1413.99 | 47.78/47.85 | 1441.21/1457.30 |
| dependencies | 30000 | candidate | cold | {'COMPLETED_WITH_FUNCTIONAL_GAPS': 3} | 10132.41/10243.41 | 20308.00/20515.00 | 1851.01/1864.08 | 74.21/74.22 | 1923.43/1938.02 |
| dependencies | 30000 | candidate | warm | {'COMPLETED_WITH_FUNCTIONAL_GAPS': 3} | 9942.68/10040.16 | 10100.00/10200.00 | 1855.52/1856.92 | 123.21/126.27 | 1976.55/1982.97 |
| unrelated | 128 | baseline | cold | {'PASS': 3} | 8950.39/8978.49 | 9107.00/9129.00 | 811.09/817.86 | 6.79/6.80 | 817.89/824.65 |
| unrelated | 128 | baseline | warm | {'PASS': 3} | 9148.03/9151.73 | 9304.00/9309.00 | 814.54/815.75 | 3.38/3.44 | 817.86/819.19 |
| unrelated | 128 | candidate | cold | {'PASS': 3} | 8969.10/9465.73 | 9119.00/9621.00 | 797.74/807.76 | 7.49/7.70 | 805.23/815.25 |
| unrelated | 128 | candidate | warm | {'PASS': 3} | 9048.01/9073.82 | 9204.00/9229.00 | 802.80/807.90 | 6.19/6.23 | 808.84/813.88 |
| unrelated | 2048 | baseline | cold | {'PASS': 3} | 10441.99/10446.31 | 10595.00/10601.00 | 885.29/889.90 | 22.83/22.88 | 908.16/912.57 |
| unrelated | 2048 | baseline | warm | {'PASS': 3} | 10238.64/10240.10 | 10397.00/10399.00 | 877.27/886.68 | 6.18/6.20 | 883.45/892.88 |
| unrelated | 2048 | candidate | cold | {'PASS': 3} | 10348.69/10557.69 | 10505.00/10706.00 | 944.41/951.80 | 14.31/14.34 | 958.72/965.37 |
| unrelated | 2048 | candidate | warm | {'PASS': 3} | 10351.81/10354.33 | 10506.00/10511.00 | 946.46/950.28 | 17.94/18.43 | 964.90/968.07 |
| unrelated | 20000 | baseline | cold | {'PASS': 3} | 22744.21/22854.01 | 22901.00/23001.00 | 2244.30/2258.27 | 97.46/98.04 | 2317.04/2327.71 |
| unrelated | 20000 | baseline | warm | {'PASS': 3} | 22274.34/22550.52 | 22427.00/22699.00 | 2261.28/2270.83 | 33.20/33.65 | 2294.32/2304.02 |
| unrelated | 20000 | candidate | cold | {'PASS': 3} | 22245.54/22255.74 | 22394.00/22414.00 | 1824.84/1878.54 | 50.16/50.26 | 1874.01/1928.54 |
| unrelated | 20000 | candidate | warm | {'PASS': 3} | 22154.04/22647.34 | 22319.00/22808.00 | 1851.97/1866.67 | 85.56/86.00 | 1937.47/1951.93 |
| unrelated | 30000 | baseline | cold | {'COMPLETED_WITH_FUNCTIONAL_GAPS': 3} | 10946.44/11048.68 | 11093.00/11203.00 | 807.91/808.05 | 107.80/108.30 | 888.03/903.05 |
| unrelated | 30000 | baseline | warm | {'COMPLETED_WITH_FUNCTIONAL_GAPS': 3} | 10143.84/10155.67 | 10295.00/10314.00 | 807.40/812.64 | 47.55/47.70 | 855.10/860.18 |
| unrelated | 30000 | candidate | cold | {'COMPLETED_WITH_FUNCTIONAL_GAPS': 3} | 10137.39/10139.94 | 18105.00/18496.00 | 823.91/831.03 | 63.97/64.96 | 888.86/894.17 |
| unrelated | 30000 | candidate | warm | {'COMPLETED_WITH_FUNCTIONAL_GAPS': 3} | 9946.58/10045.67 | 10103.00/10197.00 | 841.08/851.31 | 122.97/123.68 | 962.91/974.44 |

Unrelated-static-closure2 must not be confused with actual Program coverage: observed complete
128/2048/20000project-source Programs still include all project roots;30Kpartial unrelated profile
uses2project sources, while true30Kclosure reaches30000. This changes the regime at the20Kmember
boundary and prevents a single linear/polynomial fit across all rows. Actual phase parsing, GC and
exclusive construction counts are not inferred from memory. Source counts, fixed SDK and all
functional/performance limits remain as above. Data:
`namespace-final-20261109/scale28-three-trial-initialization-resource-summary.json`.


## Current IX20 / scale33 persisted-source mechanism

Current source68aa4629/Photos32 runtime,79pinned assets, four isolated public-framed-LSP sessions. SDK intentionally absent: this table measures persisted source-to-index qualification, **not semantic Program/query latency or UI**. Each scale has one independent session containing3successive saves and3duplicate watches, not3independent trials.

| Project source files | Logical documents per save | Per duplicate | Save median ms | Save maximum ms | Initialize+catalog ms |
| --- | --- | --- | --- | --- | --- |
| 128 | 1,1,1 | 0,0,0 | 432.07 | 446.28 | 612.23 |
| 2048 | 1,1,1 | 0,0,0 | 532.31 | 576.87 | 1716.48 |
| 20000 | 1,1,1 | 0,0,0 | 2518.70 | 2537.23 | 11452.41 |
| 30000 | 1,1,1 | 0,0,0 | 3553.90 | 3558.74 | 16970.11 |

All four preserve input restoration, normal close, observed-owned-process closure, DB integrity and unchanged runtime checks. Facts-writing counts stay1/0 across these scales; whole save-to-qualified latency still rises. No phase-exclusive attribution or asymptotic complexity follows from these four timings. The final qualification terminal can report0written documents because a preceding file task already wrote1; the verified logical total includes that task. Zero facts writes is not zero metadata or physical I/O. Semantic scale33 ordinary sessions remain running, with old baseline capacity failures retained.

Receipt: `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/scale33-persisted-four-level-mechanism-summary.json`, pinning every result hash and all individual timings.


## Current scale33 ordinary three-trial results: no demonstrated speedup

Scale33 controller completed129sessions:96ordinary/32independent profile/1calibration. Ordinary outcomes66PASS/18functional-gap cells/12baselineFAIL. Three ordinary trials are fully aggregated separately for unrelated versus actual dependencies. Final fixture/SDK/runtime endpoint audit remains pending the serialized factor controls; these counts are controller and result evidence, not real UI acceptance.

Below: current candidate, unrelated target static closure2, median/max milliseconds from3ordinary trials. Cold/warm mean empty/reused index cache in fresh server processes; OS page cache is uncontrolled. Same-session repeated queries are separate categories in raw summaries, and no result-cache hit is inferred just from latency.

| Project sources | Index cache | First completion median/max | First definition median/max | First rename median/max | Edited-first references median/max |
| --- | --- | --- | --- | --- | --- |
| 128 | cold | 103.26/104.56 | 78.87/80.47 | 154.38/227.36 | 318.69/342.81 |
| 128 | warm | 79.82/84.78 | 81.14/153.93 | 220.36/233.91 | 327.96/333.69 |
| 2048 | cold | 202.25/244.76 | 280.30/306.88 | 1192.54/1270.60 | 1941.78/1991.87 |
| 2048 | warm | 256.61/258.62 | 299.09/389.02 | 1148.21/1207.17 | 1949.41/1964.17 |
| 20000 | cold | 932.21/1021.80 | 2279.24/2292.91 | 11287.37/27123.95 | 17268.16/18194.10 |
| 20000 | warm | 928.88/960.53 | 2197.38/2221.50 | 11160.55/11209.39 | 17409.84/17721.79 |
| 30000 | cold | 48.93/49.24 | 837.14/856.40 | 388.52/398.32 refused | 1534.88/1577.17 refused |
| 30000 | warm | 140.59/166.32 | 777.88/893.81 | 398.67/410.98 refused | 1347.23/1441.54 refused |

30K refused entries are errors, not successful faster full answers; coverage differs across the20K boundary, so these rows do not form a single complexity curve. Current Program member counts await qualified profile aggregation and must not be replaced with static closure2 or native indexed counts.

Against pre-optimization f332 three-trial20K cold rename10746.63/10847.80ms, current11287.37/27123.95ms does **not** demonstrate an end-to-end benefit. Warm10819.62/10919.27ms becomes11160.55/11209.39ms. Edited-first references likewise remain slow: cold16465.60→17268.16ms median; warm16465.39→17409.84ms. Root cause of the additional cost is not established by this comparison. Single27.1s parent-log windows and clock limits remain separately recorded in SCALE004. Do not claim the first bounded realpath optimization solved growth or latency.

Reproducible qualified extraction uses the existing tested `session-analysis/scale_metrics.py` with frozen `scale33-terminal-controller-snapshot.json`, separately for `unrelated` and `dependencies`; outputs `scale33-unrelated-three-trial-summary-01.json` and `scale33-dependencies-three-trial-summary-01.json`. Failures stay included, subsequent unexecuted operations remain UNMEASURED. Density34 is running; topology35 waits.


### 2026-11-11: terminal endpoint qualification supplement

All current scale33/density34/topology35 controllers are terminal (129/97/145
recorded runs respectively). The closed-matrix audit verified2441 source inputs,
158 candidate/baseline runtime assets,135072 fixture source files and3536 SDK
inputs against their pinned manifests, and checked the logged power windows.
Audit status is PASS_ENDPOINTS_LOGGED_POWER_NOT_FUNCTIONAL_ACCEPTANCE, receipt
namespace-final-20261109/closed-matrices-33-35-endpoint-02/result.json.
It supersedes earlier RUNNING/endpoint-pending notices only. It does not erase
baseline failed cells, partial/full-scope errors or turn protocol runs into UI
acceptance; profile-stage aggregation and successor-format validation are distinct.


### 2026-11-11 current profile Program-size observations

The tested closed-log extractor has now processed the current32 scale profiles,
24 density profiles and36 topology profiles. It found112/96/144 single matched
post-query observations respectively. Scale additionally has4 missing/ambiguous
and12 not-executed observations; they remain UNMEASURED. This is separate from
ordinary timing and counts Program files **after** the query, not Program builds,
parses, file reads or a source-only dependency closure.

With a static target dependency closure of2 files, unrelated-file profiles at
128/2048/20000 project files still observed Program sizes497/2417/20369. The30000
partial-mode profiles instead observed371. Thus the target closure alone does
not explain actual Program size; complete-root and partial routes must not be
plotted as one continuous scale curve. Density/topology fixed2048 profiles all
observed2417 Program files. These include non-project inputs; no unmeasured SDK
breakdown or construction count is inferred by subtraction.

Evidence: namespace-final-20261109/{scale33,density34,topology35}-current-program-
observations-01.json; each matched event retains request ID, Worker context,
raw event and source-result/log SHA256. No instrumentation was inserted into
ordinary sessions, and no true UI claim is made.
