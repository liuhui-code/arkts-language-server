# Photos30K final-candidate protocol endurance: completed, with functional gaps

The single-session run and postflight audit completed. This is protocol-driven, NOT real Zed UI acceptance.
Full30K references/rename, definition tail latency and platform/UI coverage remain open.

## Identity and inputs

Worktree: `.bench/worktrees/index-versioned-maintenance-20261104`, branch `feat/index-versioned-maintenance-20261104`;
parent298d65f5d7f796c347fe8be5c739e428066489d8 plus uncommitted candidate. IX17 actual complete check:2455/2455PASS,
zero failures/skips,2438 frozen inputs unchanged. Rust checks explicitly reused against249 identical inputs and identical Native,
NOT fresh Cargo runs. No commit, merge, deployment or release.

Node20.19.5, compiler ohos4.9.5-r10; API24 SDK at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
3536 available declaration/JSON/link endpoints match manifest89a6b94b92c1e92388b7c486005e759b979150411c50c191ed99c94ab6870eaf.
This does not certify SDK completeness, intermediate byte continuity or physical identity continuity.

- server SHA3145633150f4f76e32616f6bf6a6cc4cbd80e1dbfb435e560127380e50fb5b31
- semantic-worker SHA63e80188fe6b5e1c5f69450f77701fccc93b7ce4926d63c45149b0bdd43d9129
- Native SHA5f648342ba3b0de2e7d8788212922fcc5097c7e4f166bd6c3b19fd133a1a3ad3

Original Photos input copied into an isolated fixture:13900ETS+16100TS, plus60 configuration/resource files.
Original project and daily caches preserved. Cold Native index:30000/30000, skipped0,335.341s.
Semantic preparation still degraded/project-membership-incomplete. Native completeness is not Program completeness;
Worker projectFiles is membership/document inventory, not compiler getSourceFiles.
Default RSS budget null, ARKTS_MEMORY_BUDGET_MB unset; only test2GiB stop waived. No V8/timeout/scale-threshold change.
Native raw tee enabled throughout: this is instrumented timing, not ordinary unobserved timing.

## Actual single-session window

UTC2026-11-09T20:45:50.221Z to22:46:55.069Z, recorded7264.848s (121.08min), excluding initialization/calibration.
Beijing Nov10 04:45:50 to06:46:55. Last mixed action finished22:45:52.785, followed by long idle and recovery query.
Entire run finished22:47:36.627. Manual restarts0.
All-session1189 composite actions/5255 requests; audited formal window1132 actions/5140 requests.

Formal actions: reading147, development136, navigationCancel145, tabsModules135, dependencyBarrel141,
filesystemWatch134, configuration145, original-save212 once, original-close255 once,
edit-first-repeat-references-rename98, diagnostic-version49.
All1132 composite action oracles passed, but these explicitly retain known full references/rename errors;
this is NOT an all-feature success rate. Exact edits, UTF-16 positions, symbols, versions and responses are in raw evidence.

## Formal-window response distributions

Client send-to-response milliseconds, nearest-rank quantiles. Mixed cold/warm/edit states are not a single-stage attribution.

| Method/outcome | Count | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| completion ok | 435 | 212.853 | 385.249 | 1095.303 | 1190.505 |
| completion resolve ok | 283 | 184.234 | 343.968 | 440.937 | 502.023 |
| definition ok | 2934 | 332.751 | 3878.567 | 4010.965 | 5248.528 |
| hover ok | 292 | 214.278 | 1390.851 | 1818.354 | 2170.236 |
| highlight ok | 292 | 433.514 | 1527.813 | 2119.247 | 2238.381 |
| documentSymbol ok | 147 | 567.925 | 955.512 | 1051.678 | 1075.092 |
| typeDefinition ok | 145 | 405.732 | 1411.455 | 2022.635 | 2095.083 |
| workspaceSymbol ok | 23 | 2180.748 | 3926.751 | 4885.306 | 4885.306 |
| definition cancelled -32800 | 145 | 22.601 | 23.770 | 30.407 | 88.738 |
| references input changed -32801 | 141 | 2.670 | 5.144 | 67.014 | 72.026 |
| references failed -32803 | 196 | 2125.662 | 2361.325 | 2436.186 | 2450.042 |
| rename failed -32803 | 98 | 4067.669 | 5197.800 | 5924.432 | 5924.432 |

Another9 codeAction responses succeeded. Formal totals:4560 success,145 cancellation,141 invalidated input,294 functional failure.
All-session knownGaps296 differs from formal294. No complete successful full references/rename result is claimed.
Definitions exceeded500ms in1233/2934 successes, a sustained tail rather than merely occasional jitter.
Completion details exceeded500ms once/283. 500ms remains an experience target, not a new hard gate.

## Closure, integrity and resources

Shutdown acknowledged, exit0/signal null, interventions empty;5 sampled owned PIDs CLOSED with none remaining.
This does not rule out unobserved orphan processes. Both closed/checkpointed databases passed immutable integrity checks:
data DB30.042s, control DB0.006s, stdout ok. No open progress tokens. Fixture restored.
Actual pmset query exit0; no Sleep observed in formal window; audit PASS.

Sampled peaks: Node RSS1218.086MiB, Native class237.633MiB, owned tree1486.051MiB.
Node PID RSS includes Worker threads and is counted once; isolate heap is separate and not additive to RSS.
Category peaks need not coincide; summed RSS is not PSS; these observations do not establish no leak.
Cache unique-logical peak1871199460B (~1.743GiB), unique-allocated1887846400B,
DB1863774208B, WAL7416064B, SHM65536B. Final WAL/SHM0.
File-size snapshots are not device write bytes or physical write amplification.

## Native terminals and retained input races

Final closed raw stream:1650 terminals, no duplicate attempt IDs:288qualified,589cancelled,573data-updated,
196unchanged,3published-unqualified,1failed. Initial30000 documents/14220087 logical fact rows is separate.
After initialization1059 terminals report counters:720 write0,339 write1; reported totals339 documents/273538 logical rows,
maximum1 document per counted terminal.589 cancelled and1 failed terminal omit cumulative counters: OBS012 remains UNMEASURED,
not zero. No complete physical-write ratio or zero-cost cancellation claim.

The failed input524 terminal for TimelinePage.ets arrived21:51:47.895, source fence failed, dataPublished=false.
Action686 applied then restored a duplicate watcher burst for16 files; both foreground definitions succeeded.
Native input525 restoration notification arrived21:51:47.894, immediately before the old input524 failure terminal.
Input527 became fully qualified/currentInput=true at21:51:57.614,9.719s after failure receipt.
This is a recovered input race, not evidence of persistent unavailability. Exact internal inspect instant is UNMEASURED;
no per-symbol validation is claimed for the unqueried TimelinePage target. All3 published-unqualified terminals
reported qualification source fence failed, writtenDocuments0 and no qualification; they are not complete successes.

## Evidence and remaining work

Evidence root: `.bench/index-versioned-maintenance-20261104`.

- final-acceptance-23/execution.json, sleep-free-validation.json, power-audit.log, sdk-content-after.json.
- final-acceptance-23/protocol-runs/versioned-final-23/: actions.ndjson, requests.ndjson, wire.ndjson.gz,
  resources, cache snapshots, Native raw request/response, service logs, result.json.
- namespace-final-20261109/photos23-final-session-analysis.json: formal distributions and12 slowest exact request records.
- namespace-final-20261109/photos23-final-native-terminal-analysis.json: final Native counters and raw SHA.
- namespace-final-20261109/photos23-final-source-fence-failure-timeline.json: failure/recovery/public response alignment.
- namespace-final-20261109/ix17-complete-check-receipt.json and ix17-rust-reuse-evidence.json.

Actual launch is preserved in final-acceptance-23/after-gate-photos.py, invoking harness/run.mjs soak versioned-final-23.
Reproduction requires a new isolated output/cache tag, never overwriting this archive; fixed seed is in result.json.
Scale24 started persisted-source scale only after final audit PASS, then the serial scale/density25/topology26 experiments.
These are not yet completed. UI NOT_RUN; Windows read-only SSH still TCP timeout.
ADR0043/0044 retain Proposed workflow, with no invented review/whole-feature acceptance.

## Subsequent persisted-source scale: actual completed subcheck

One calibration128 plus four measured sessions128/2048/20000/30000 allPASS, inputs restored, normal closure and integrityPASS.
SDK intentionally absent in this index-only fixture; this is not the SDK-pinned semantic scale matrix.
Each measured session contains3 saves and3 duplicate watches; these are not3 independent cold sessions.
Time is disk-write/watch to current complete qualification receipt, including polling, not isolated SQL latency.

| N | Init/catalog ms | Save median/max ms | Duplicate median/max ms | Save writes | Duplicate writes |
| --- | ---: | ---: | ---: | --- | --- |
| 128 | 715.322 | 415.050/417.358 | 412.268/413.233 | 1/1/1 | 0/0/0 |
| 2048 | 1620.663 | 539.662/566.014 | 521.479/534.270 | 1/1/1 | 0/0/0 |
| 20000 | 11065.672 | 2437.236/2527.599 | 2371.712/2407.510 | 1/1/1 | 0/0/0 |
| 30000 | 16177.962 | 3546.935/3693.969 | 3365.296/3397.770 | 1/1/1 | 0/0/0 |

New facts writes stay file-local, but complete qualification time still grows with N. No asymptotic complexity or physical I/O claim follows from these four cells. Full reconciliation has an N-input inventory/hash/source fence by design; its exclusive time was not measured here. Detailed rows and restored-content counts: namespace-final-20261109/scale24-persisted-source-summary.json.

## Scale24 first ordinary observations (matrix incomplete)

At this checkpoint calibration plus9 measured cells have completed (10 recorded runs);20K candidate warm is active.
Baseline20K/30K true-dependency preflight diagnostics retainedFAIL, confirmed configuration-witness-capacity4096,
normal closure/integrity and pinned artifacts. Later unexecuted operations areUNMEASURED, not zero or success.
The descriptive summary includes only controller-recorded completed paths; ongoing mutable results are not labelledPASS.
Existing summary controls6PASS retain failures and separate calibration/profile/cold/warm/runtime/input dimensions.

The first candidate unrelated20K ordinary cold-process session completedPASS with exact result oracles,
normal closure and integrityPASS. Definition-first1790.248ms, definition-repeat973.455ms,
completion-first823.758ms, references-first13241.127ms, references-repeat12431.140ms,
edit-first-references15029.154ms, edit-repeat-references13150.084ms; these are single observations, not3-trial medians.
The first2048 candidate observations also had slower edit-first references than baseline (about1.72s versus0.65s cold);
no universal latency improvement or scale independence is claimed from the file-write optimization.
Actual Program counts and causes remain pending the separate trace phase; static closure is not Program membership.
Evidence: scale24-partial-completed-summary.json and scale24-unrelated20k-first-ordinary-observation.json
under namespace-final-20261109. No product change made during the frozen acceptance matrix.

### First-trial20K/30K preparation boundary (not final scale conclusion)

Candidate unrelated20K cold/warm both exact-oraclePASS; edit-first references15029.154/15330.420ms,
repeat references12431.140/13129.267ms. Warm is a NEW Node process retaining disk index,
not a retained Program or proven result-cache hit. No success-cache attribution is assumed.
Candidate unrelated30K cold/warm completeWITH_FUNCTIONAL_GAPS: preparation degraded/project-membership-incomplete;
definition-first691.641/620.791ms, while references fail-32803 (complete workspace snapshot required).
These quicker partial-path observations cannot prove a scale improvement over20K successful full searches.
Actual Program membership remains pending separate trace; no unmeasured stage is blamed.
First-trial boundary records and exact source result hashes: scale24-first-trial-20k-30k-boundary.json.

### True-dependency20K candidate cold: first completed session

First ordinary trial exact-oraclePASS on17 operations, normal closure, integrityPASS, unchanged artifacts.
The generated static graph contains20000 reachable files/19999 import edges, max fanout32/depth5.
These graph measurements are not compiler Program membership measurements; profile evidence remains pending.
Definition-first3542.751ms/repeat4529.675ms; completion-first2565.425ms; references-first15185.159ms,
edit-first-references18277.119ms/repeat15345.864ms; reopen-definition5008.309ms;
origin-rename-first21364.883ms. Node RSS sampled peak1779.852MiB, Native48.863MiB, tree1827.586MiB.
Initialization/preparation26078.018ms and indexReady26211ms overlap and are not added.
Old same-size true-dependency baseline preflight refused its first definition on the confirmed4096 proof-capacity boundary;
that failure and unexecuted later operations are retained. Candidate correctness recovery does not imply low latency.
Evidence: namespace-final-20261109/scale24-dependencies20k-first-ordinary-observation.json.
The growing-closure mode also changes dependency topology/source bytes; independent topology/density controls are separate,
not inferred from this single mode/count comparison. No O(N)/O(N squared) claim from this observation.

### Final resource classification audit

The actual Native binary PID73282 (pinned by raw tee lifecycle identity) has3839 resource samples,
peak237.6328125MiB, exactly the reported Native-command class peak for this run.
Root Node PID73276 peak1218.0859375MiB includes its Worker threads.
Observer Node wrapper PID73281 peak45.1328125MiB is not in the Native class; it contributes only to owned tree RSS.
Short sampled cache-GC wrapper PIDs are also separate. The owned-tree peak1486.05078125MiB is not PSS
and not necessarily the sum of each PID's individual peak. Full per-PID breakdown and classifier evidence:
namespace-final-20261109/photos23-final-resource-accounting-audit.json. No new load, policy change or deployment.


### Closed-window latency/resource and complete Native-log supplement (2026-11-11)

The tested analyzers now cover the closed7200.369s formal window:4868requests,
3598process resource samples,32056semantic Worker heap samples. Formal Node RSS
peak1133.79MiB, Native240.68MiB, auxiliary81.75MiB, simultaneous observed tree
peak1390.68MiB. These are separate maxima; do not sum them to invent a peak.
Worker heap-used peak1004.11MiB is inside Node RSS, never added again. Whole-session
peak and formal-only peak differ; the earlier1162.46MiB Node value covers the
whole session. RSS sum is not PSS or proof of a leak/absence of a leak.

Selected formal successful response distributions (ms, p50/p95/p99/max):

| scenario | n | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| completion detail |270|205.48|355.54|443.16|521.64|
| typing completion |144|205.42|1134.35|1210.95|1245.28|
| close/reopen definition |375|1185.65|1890.72|1958.26|1997.67|
| edited barrel definition |72|1206.43|2172.13|2816.74|2816.74|
| external create definition |44|1762.27|3226.10|3413.83|3413.83|

The single save212 definition measured222.55ms; it is one protocol observation,
not repeated UI acceptance. Cache-hit state is UNMEASURED in these buckets.
Successful protocol responses alone are not independently revalidated feature
successes. Known279full-scope formal errors remain outside successful distributions;
cancellation and stale errors are separated.500ms remains a soft experience target,
while sustained multi-second latency is explicitly retained.

The main Native complete raw transcript (initialization/calibration/formal combined)
has1603maintenance terminals:287qualified,551cancelled,584data-updated,
177unchanged,4published-unqualified.598report dataPublished=true. Initial terminal
reports30000documents/14220087logical fact rows. Of1602later terminals,1051carry
write counters totaling348documents and279705logical rows, maximum1document per
counted terminal;551cancelled terminals do not carry these counters and remain
UNMEASURED, not zero. Exactly one storeId is observed. This supports retained-store
incremental behavior for the measured outcomes, not a physical I/O amplification
ratio or an assertion that cancelled work wrote nothing. Eleven Native RPC errors
are retained in the raw extraction and require classification rather than exclusion.

Evidence: namespace-final-20261109/photos32-closed-formal-latency-resources-01.json
and photos32-closed-native-main-01.json. Native request/response raw SHAs are bound
in the latter. This remains frozen IX20 format8 protocol evidence; it does not
validate the new9/109 owner successor or real Zed clicks.

The11Native RPC errors have now been joined to their exact requests: all are
index/status with cancelled/read cancelled, not full reference or rename errors.
Each old input revision has a following accepted new input (122→123,202→203,
286→287,390→391,444→445,529→530; some have two outstanding reads). No explicit
matching request-token cancel appears in the complete raw request transcript.
The accepted maintenance input path main.rs312 calls reader.invalidate, which
cancels waiting/active reads of other inputs and emits this single terminal.
This supports input-freshness cancellation; waiting versus running branch and
exclusive time are not observed. The11errors remain counted rather than dropped.
Receipt: photos32-native-status-input-change-joins-01.json under namespace-final-20261109.


### Final format10 IX22 terminal and live endurance checkpoint (2026-11-11)

Fresh full pnpm check:fast exited0 at2026-11-10T22:59:29.788603Z:2466PASS,
0fail/skip/cancel/todo,3815.775729s; all2475source inputs unchanged. Strict combined
gate revalidates exact282-input same-candidate fresh Rust checks reused by this
Node gate, the actual Native800e binary and79complete runtime assets. Raw gate
log SHA25653c28f8c42c07d4e055f488120048f65d9624ef3cfa6dc38e02354570df0d86f.
Receipt: namespace-final-20261109/ix22-terminal-qualified-summary.json.
This is final10 verification; older9 full PASS is historical only.

Photos36 then copied verified artifacts and original isolated inputs, calibrated,
and started formal single session2026-11-10T23:06:46.905Z. At00:21:02.560Z it had
4455.655formal seconds,709formal actions/3192completed formal requests (provisional
snapshot), no failed actions or protective stop.183full-scope refusals remain
functional gaps, not successful references/rename. Current sampled peaks include
Node1164.14MiB/Native245.06MiB/tree1419.50MiB; independent peaks are not additive.
Do not infer final stability, memory leak absence or full feature completeness.
Readonly audit waits for true normal close, SQLite integrity, original restoration,
fixedSDK/actualruntime and logged sleep-free formal window. Scale37/density38/
topology39 wait for exact predecessor receipts and run serially only after review.
No matrix load yet, no realUI claim, no publication/merge/deployment.
