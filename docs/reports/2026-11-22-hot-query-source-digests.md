> Current W7 implementation and final checks: [2026-11-23 acceptance report](2026-11-23-hot-query-acceptance.md).
> Actual full2801PASS/production identity145; extra test-fixture all-dist failure134 preserved.
> Scale146 and Photos126/147 passed, with significant latency limits. No merge/deploy/UI pass.
> The dated sections below are historical checkpoints, not current RUNNING status.

# Hot query source-digest reuse

Status: W2 full2790 PASS (historical). Current W5 frozen candidate focused111 PASS; actual full71 2792/2792 PASS. W3 full39 failed original preparation deadline; predecessor suites stopped and raw failures preserved. No final performance/Photos acceptance yet.
No merge/push/deploy. Scope: Mac protocol, not UI/Windows/endurance.

Evidence directory: primary repo .bench/hot-query-20261122.
Base Git revision1e3886df3c4d27755a53c073462f1456b0a3de7e plus inherited candidate
changes; predecessor Q4 serverb8ed84281e5c82f2c03c30e42cdac68afe792855760e50017adbf3abbff8964e,
Workerab989fffa6f03c8853adf1798e8119edac9b9c4dcef49abd4b058b348da37b44.
Pinned Node20.19.5, compiler4.9.5-r10 and Native800e6628 unchanged.

## Cause and first slice

Actual cached-reference path still calls fresh namespace admission. The namespace
loop used documents.read for every non-borrowed source, reopening guarded file
contents and rehashing them each request. Program/AST/answer reuse does not cover
that loop. Prior fixes remain present; this is an uncovered derived-data path,
not evidence that all earlier optimizations regressed.

2048 diagnostic baseline retains exact answers, SQLite and CLOSED; hot
prepareProjectReadiness554.75–610.86ms and nested projectSourceNamespace499.45–
543.87ms in the last measured commands. Nested/inclusive calls overlap and must
not be added. Timing is diagnostic, not ordinary CPU self-time or a30K estimate.
Raw span receipts: baseline-n2048-diagnostic01/cost.ndjson.

Public RED digest-public-red01.log: correct3references and actual result hit,
but96 unchanged noise files reopened. First implementation green02 still FAIL:
base Store views do not carry operation-scope WORKSPACE_MEMBERSHIP_PROOF. This
was not bypassed: capture the real Store proof at the original revision instead.
Corrected green03 PASS, actual file identity checks retained and0noiseopens.

Silent restored-mtime edit digest-lifecycle04 PASS: only edited noise content
reopened, previous answer proof invalidated, next query actual hit. Expanded05
22PASS/0skip includes edit injected in a retained-digest window: old request
-32803 and next query correct4references. These exact public sequences use real
framed stdio children. The controlled race proves that seam, not arbitrary OS
race coverage or a field reproduction.

See ADR0048 for family ownership, original guarded-read identity, weak/unknown
fallback,32MiB optional metadata bound and independent final/raw checks. No
source text/AST/SQLite reader retained; no watcher-only authority introduced.

## Pending receipts

paired-series06.json:18 serial same-fixture protocol sessions, baseline/candidate
order alternates each round, three processes/scale, cold Native first then reused;
OS cache uncontrolled. Each has4definitions and4reference queries with exact
locations,3actual reference hits, input restoration, DB postflight and CLOSED.
No focused suite overlapped the series: focused05 finished15:09:16Z; series
started15:09:34Z. Full gate will wait for the series rather than pollute timings.

## Completed same-input comparison

paired-series06.json:18/18PASS,144functional queries,54actual result-cache
hits. Every session passed exact answers, source restoration, per-DB integrity
and sampled-process CLOSED. Three fresh processes per version/scale; first
Native cache cold, next two reused. Each hot cell contains nine samples (three
per process), not nine independent starts. Versions alternate order by round.
No changes to product policies or SDK were used to obtain these results.

Median/max milliseconds:

| N | hot references baseline | hot references candidate | first references baseline | first references candidate | hot definition baseline→candidate median |
|---:|---:|---:|---:|---:|---:|
| 2048 | 591.15/626.30 | 113.73/120.08 | 2973.59/3021.19 | 2570.80/2573.83 | 98.37→96.37 |
| 20000 | 5656.45/6945.90 | 761.24/773.02 | 14831.80/16311.09 | 10685.68/11355.82 | 478.27→483.25 |
| 30000 | 8522.26/9138.16 | 1695.07/1818.94 | 27896.63/27980.19 | 16371.09/16707.36 | 715.29→704.55 |

These are same-protocol comparisons, not UI. The namespace digest fix affects
references directly; definition changes are small and are not claimed as a new
definition optimization.30K hot references remain~1.70s, not500ms or scale
independence; physical all-member/configuration/SDK/current/final obligations
still exist. New cold first query and initialization remain material costs.
Do not extrapolate these fixed-P16 synthetic results to actual Photos topology.
The final full candidate gate and subsequent isolated Photos session are pending.

## Final frozen identity

1063 source inputs; server unchangedb8ed84281e5c82f2c03c30e42cdac68afe792855760e50017adbf3abbff8964e,
new Worker ed0dba7d3571289315ba253485910dd6d75c88608738621eae1488babda512de.
final-source-freeze07.json/final-runtime-identity07.json pin all inputs/assets.
The predecessor trailing blank line was removed before freeze; git diff --check
PASS. Source/runtime may not change during final gates. Actual commands and
terminal exits are retained by final-gates07.json, not inferred from prior PASS.

Final targeted frozen focused08 suite completed97/97PASS,0fail/skip/cancel/todo.
Actual pnpm check:fast09 is still RUNNING; Photos readonly session waits for its
terminal PASS. This is not a final full-suite or Photos acceptance receipt.
Task-only patch task-only-source-diff12.patch applies cleanly (--check) to Q4,
excluding inherited WIP; all9changed source/test files remain<=500lines.

## First full gate failure and corrected overlay boundary

The first frozen full gate is **NOT PASS**. actual-checkfast09.log found the
existing Native disk/unsaved-overlay regression: first admission performed one
raw shadowed disk read, second reused its digest and read zero; original oracle
requires one guarded read in every admission while an overlay is active.
The exact failure is reproducible with all3original file tests:2PASS/1FAIL,
zero skips (`overlay-original-contract-red15.log`).

No original assertion was relaxed. Reuse is now explicitly **closed-source only**:
projectSourceNamespace passes strongMembership=false for active overlays, taking
the original guarded disk read each admission. This preserves the existing dual
authority boundary and does not clear the global cache. Closed sources retain
the measured optimization. An independent observation additionally verifies
every actual namespace digest against an independently built disk-content
projection, different from the unsaved overlay-content projection.
`overlay-closed-only-green16.log`:6/6PASS,0skip (original3 plus new3).
The failure did not demonstrate wrong answer bytes, but was a real regression
against the existing raw-read contract and was corrected in product code.

After the confirmed failure, only9owned check-stage processes were terminated;
known-overlay-failure-stop14.json retains commands/start identities/signals.
The later references-direct-proof-trace file failure occurs after that deliberate
termination and is not independently classified as a new product defect.
The incomplete gate is retained with STOPPED_PRESERVE_FAILURE, never relabeled
GREEN. Its waiting Photos controller stopped without launching a Photos run.

Final correction candidate is now
`/private/tmp/arkts-hot-query-overlay-oracle-20261123`; old frozen candidate and
all earlier18session data remain unchanged. New paired-final19 repeats all18
new/old same-input sessions with new per-version caches; final-gates20 waits,
then reruns focused21 and actual-checkfast22 on a new1064input freeze.
photos-controller23 waits for the new gate. Earlier timings are predecessor
evidence, not final-correction receipts; await the new measured results.

## Final closed-source-only candidate: new scale receipts

paired-final19.json completed18/18PASS,144functional requests,54actual cache
hits. Every process passed exact results, source restoration, SQLite integrity
and CLOSED. New version-specific caches, first Native cache cold then2reused,
OS cache uncontrolled, alternating serial version order. Each hot cell has nine
values across3processes. The earlier18pair series is not counted toward this.

Final same-batch median/max milliseconds:

| N | baseline hot references | final hot references | baseline first references | final first references | hot definition baseline→final median |
|---:|---:|---:|---:|---:|---:|
| 2048 | 493.38/500.74 | 110.50/112.05 | 2611.02/2653.42 | 2274.17/2274.54 | 96.65→93.29 |
| 20000 | 4700.30/4747.31 | 724.64/759.02 | 12313.27/12798.99 | 9176.81/9241.77 | 509.11→441.84 |
| 30000 | 7095.63/7373.05 | 1509.16/1628.39 | 18563.63/18580.85 | 13520.75/13693.83 | 660.51→659.37 |

Baseline30K hot median also moved8.52s→7.10s between batches, demonstrating
ordinary environment/OS-cache variation. Do not attribute that movement to the
fix. Final same-batch30K reduction is~78.7%, with1509ms remaining; no claim of
500ms/constant-time queries. These are generated P16 protocol fixtures, not
actual Photos/UI. All raw values and per-process resources are retained in
paired-final-summary24.json and the18final19session directories.

Final freeze1064source inputs; Worker
16690d5768b60c81fadf0bbd7babc1e4e68e3b346f2167016c76131c1bff7f19,
server remainsb8ed84281e5c82f2c03c30e42cdac68afe792855760e50017adbf3abbff8964e.
Native/compiler unchanged. Final focused21/full22 are running in sequence and
Photos23 is waiting; no old full-gate PASS is substituted.


## Closed-source checkpoint W2: completed gate and actual Photos limitations

W2 Worker `16690d5768b60c81fadf0bbd7babc1e4e68e3b346f2167016c76131c1bff7f19`:
`focused21.log`100/100 PASS; `actual-checkfast22.log`2790/2790 PASS,
zero fail/skip/cancel/todo. `final-gates20.json` pins1064 unchanged source
inputs and unchanged runtime assets. This is W2 acceptance, not a later W3 gate.
`paired-final19.json`18/18 PASS,144 exact queries and54 actual reference hits;
summary24 contains per-scale medians/maxima. The original W1 failure stays above.

Actual isolated Photos29995-source SDK24/target20 remains partial, honestly.
`photos-final23/result.json`: initialization84474.69ms; extensionWindow local
reference at PickerUIExtensionAbility__copy_003.ets43:9 (zero-based) did not
return within the existing45s external response protection. Driver terminated
only its owned test tree; no OOM/Worker-watchdog diagnosis is implied. Sampled
Node peak3844.91MiB, Native67.28MiB; process CLOSED and SQLite integrity PASS.
No subsequent cache-hit/edit query was executed in this failed sequence.
The Worker first tried an unsupported index direct proof, then planned30
conservative batches and began batch0 with1025 roots; no batch completion before
protection. This is a remaining first-reference defect, not a successful test.

Separate actual Photos definition controls (`photos-def-controller26.json`)
queried ScreenManager at the same Picker file53:5. Both versions returned the
exact declaration in common/.../ScreenManager.ts48:13–26. One fresh process
per version, three hot samples, fresh Native cache/OS cache uncontrolled:
Q4 hot2341.97–2360.24ms; W2 hot2427.88–2538.24ms. No demonstrated definition
benefit; one pair cannot establish a small regression. W2 after diagnostic,
`photos-def-ordinary-after30`, again hot2465.35–2529.55ms with exact results.

Calibrated diagnostic (`definition-calibration31.log` public PASS,
`m5-current-boundaries29.cjs`, `photos-def-diagnostic29/phases.ndjson`) proves
hot definition uses existing Program/checker:0 parse/createProgram, five sync
entries all version-early-return; actual Program87 project/282SDK/113other.
Compiler definition callback~2–3ms. Hot command4 counts145889 project lstat API
calls (prepare30772/query28292/final86825), configurationIdentity reads28389
query/28482final, final witness wrapper273270 calls but79513 actual fact
comparisons; inner facts already share some work. These are calls, not syscalls
or distinct source files. Diagnostic hot4220–4663ms vs ordinary~2500ms shows
material instrumentation cost: diagnostic self-time is NOT ordinary percentage,
and nested inclusive spans must not be added. Scope graph/config/path checking
remains an independent performance problem. The older adapter runtime FAILED
with obsolete boundary.begin; calibration28 logs are preserved, not product
ordinary failure. The corrected adapter was calibrated through actual LSP.

## W3: consume completed numeric observations without rematerializing identities

`namespace-30k-diagnostic33` proves a different, concrete namespace overhead:
30000 source identity calls,21972 same-phase borrowed and8028 fallback reads;
7401 optional-record quota overflows at33554432bytes. Recreating path/JSON
identity DTOs evicted pending Native regular-file observations. This is the
request observation metadata quota, not RSS policy or a reason to increase it.

W3 uses the original current-phase completed regular-source record directly:
checks regular mode/physical-parent qualification and the guarded token's
original dev/ino/size/mtime/ctime. Five parsed numeric fields are retained with
the digest. Missing/ineligible/consumed observations retain the original raw
identity fallback; final Native and input union ordering is unchanged. No quota,
timeout, member limit, V8 or product RSS setting changed. Entry accounting grows
160→224 bytes for numeric metadata under the same per-family32MiB optional cap.

Public TDD `primitive-source-record-red34.log`: correct answer/cache hit but
192 duplicate identity strings for96 noise sources. GREEN35 six public tests
PASS with zero duplicate identity records while fresh checks, silent mutation,
controlled reuse-window rejection and original overlay raw-read assertions hold.
W3 proper worktree `/private/tmp/arkts-native-digest-records-20261123`,
Worker `72f1be0be789c6f32cfe8b69e254b30317626972f4db3093d3bde9fa1927425e`;
server/Native unchanged. Source/runtime freeze37 records exact provenance.

`paired-primitive36.json`:18/18 serial sessions PASS,144 exact queries,
54 real result-cache hits, all SQLite/CLOSED/source postflights PASS. Baseline
here is W2 (not Q4), three processes/version/scale, three hot samples/process.
Each first process has cold Native cache, next two reused, alternating order;
OS cache uncontrolled. `paired-primitive-summary40.json` ordinary med/max ms:

| N | W2 hot references | W3 hot references | W2 hot definition | W3 hot definition |
|---:|---:|---:|---:|---:|
|2048|105.71/110.93|92.34/95.96|89.84/144.63|91.77/148.71|
|20000|738.40/856.26|598.56/658.93|448.74/553.36|442.85/472.48|
|30000|1507.77/1566.80|857.72/915.48|660.06/683.96|660.94/682.40|

Measured30K hot reference median reduction43.1% over W2 in this pair. Still
scales with all-member metadata, not constant-time and not actual Photos/UI.
First references still~13.1s in W3 generated30K; this slice does not solve cold
Program/search cost. `focused38.log`100 PASS; `final-gates37.json` currently
running actual-checkfast39. Do not describe it as full PASS before terminal.
Count-only diagnostic41 is separate and overlaps correctness suite39; its
wall timings must not be compared to the ordinary serial pair36.


### Numeric observation diagnostic confirmed

`namespace-30k-primitive41` PASS exact8answers/3actual reference hits, SQLite and
CLOSED. Each hot namespace command consumes30000/30000 eligible current-phase
regular observations; project query open/lstat/realpath calls0. Fresh prepare
and final member scans each remain1 (each~30029 lstat calls). Query observation
accounting peak6241584bytes vs W2 33554432;7401overflows→0. W2 namespace-path
sourceIdentity.read8028→0. These are actual invocation/offer/hit counts, not an
inference from missing DTO instrumentation; raw `phases.ndjson` and count-only
summary42 retain evidence. No ordinary timing ratio is taken from this diagnostic.

## W4 isolated evaluation: validator ownership, not cached validity

Worktree `/private/tmp/arkts-load-proof-validators-20261123` retains W3 and moves
four freshness() factory calls to the end of their immutable source-boundary,
module/SDK binding and external-node load. Those local witnesses have no in-place
reset/append path after capture. Retained functions still test live owner,
resetEpoch/revision/facts, checkpoint and register the original final input union.
No final composition memoization or observer ordering changes. ADR0044 applies;
this is a derived callable representation refactor, not a new validity contract.

Public RED44: exact answers but210 validator creations on an unchanged hot
request. Capturing functions removes these allocations. The old composition
observer counted factory calls, which incorrectly became0 after refactoring;
updated observer wraps invocation of the returned validator. Original prepare
unique-owner and independent final-call equality assertions remain unchanged.
Observer calibrated on W3 with the same existing public test (`...baseline51`:
1PASS,5name-filtered; this is calibration, not a full run). First attempt43 had
wrong Worker method name; green46 referenced a nonexistent file; receipts retained
as driver mistakes, never product evidence. GREEN47/50 and focused49 failures
are preserved, not relabeled PASS.

The added restored-input assertion initially expected immediate success after a
second silent replacement. Independent public controls53 show BOTH W3 and W4
return -32803 for changed, -32803 for restored, then exact success on the next
request. The test now explicitly asserts those two old requests fail and the
next returns the original exact location, with no arbitrary retry loop.
This retains the old-request freshness contract rather than weakening it.

Corrected `scope-validator-focused54.log`:32PASS0skip, includes original
source-origin, final late-member/SDK fence, resident final-source, witness
reset/owner lifetime and disk-dependency tests. Typecheck48/build55 PASS.
Frozen W4 Worker `2d24625057b45e5161d0ae23eac162392adafda4db1a9c350b3e881a4e4f9e36`,
1065 source inputs, server/Native unchanged. Final gate56 runs focused57 then
actual full58. Correctness suites39/58 may overlap; no comparative performance
claim is made from their test durations. Real ordinary Photos AB/BA/AB controls59
wait until BOTH full gates finish and require PASS before running. Three fresh
processes per version with three hot samples each; no profiler. W4 is evaluation
until those results exist; fewer allocations alone does not prove user latency
improved. If no reproducible benefit, keep W3 rather than carry extra complexity.

Task-only source patch61 and metadata61 compare against Q4, excluding inherited
WIP; git apply --check on Q4 PASS. All17 changed handwritten files<=500lines.
Patch60 lacked new-file mode markers and failed apply-format check; retained.
No patch has been submitted, merged or deployed.


## Current W5: seed derived digests at original guarded initialization reads

Public RED65: the first namespace admission reopens96 unchanged files that were
already read during initialization. W3/W4 only populate content digests at query
admission. W5 seeds the same optional derived cache at the actual guarded
`readAdmittedProjectSourceSnapshot` boundary, before returning its snapshot.
Only an opaque Store-issued complete native catalog family plus matching actual
snapshot physical path/token/mode can retain a digest. Missing/legacy/weak/unknown
provenance cannot manufacture an entry; subsequent admission still requires its
current strong membership, closed-source authority and independent final fences.
No snapshot/text/AST is retained and no published readiness state changes.

The helper moves to `src/project/source-content-digests.ts` because both guarded
workspace reads and semantic namespace admission consume it; core workspace does
not import a semantic-layer utility. Actual guarded bytes are hashed at capture;
SourceRolePool's own role-key SHA is not yet shared, so this slice avoids repeated
content I/O, not every duplicate hash computation. It may add initialization CPU
and optional metadata retention; scale/Photos initialization must be measured,
not promised faster. The per-family32MiB accounting bound is unchanged.

RED67 on W4: a same-size/mtime-restored silent edit after initialization but before
first query rereads all16noise files. W5 GREEN68:13/13 PASS0skip; first query
returns exact3local locations, rereads the changed file, reuses untouched siblings.
It also retains the original overlay one-raw-read-per-admission oracle, actual
independent disk-vs-overlay namespace SHA, provenance checks and mid-reuse race
rejection. Typecheck/build66 PASS. Frozen focused70:111/111 PASS0skip.

Current source `/private/tmp/arkts-initial-source-digests-20261123`, base Git
1e3886d plus inherited WIP and these recorded slices, not clean main. Freeze69
has1065 source inputs. Runtime now changes in THREE entry points because the
common guarded reader participates in multiple bundles:

- server27517a3ce973baf59f7852841eea029d8b44f7819af0eb0a84aa9fa242114fb3
- Worker2b545e0533e58aa4f744dfbece2422be93713a9ecb51ef2b40494dfd4008f5ec
- reference verifier938a674009d19b2f9de758dee8c7c280ec028fdf9ee2ae9027b7e1487e908b1c

Native800e and compileraf9e remain unchanged. Actual full71 is the required final
same-candidate gate, not W2/W3 or the earlier targeted receipts.

## Original initialization deadline failure and test isolation correction

Full W3 `actual-checkfast39.log` contains an original failure:
`comment completion and import details reuse prepared inputs in a complete large
project`, tests/semantic/partial-completion-admission.test.mjs:80. Test wall
30452.42ms; fixture-created6178.37ms. The actual semanticPreparation notification
wait at line100 is20000ms; the test timeout is60000ms. Server.started→initialized
includes creation of20001noise files BEFORE initialize. It does not prove a6s
handshake. Raw error shows ongoing per-file readiness checks throughUnused10053,
not OOM, a dead loop, lost terminal or Worker fatal exit. Full stderr excerpt is
truncated by the existing driver, so the exact remaining CPU stage is unmeasured.
`initial-timeout-correction78.json` corrects the stop77 reason's imprecise30s label.

Two full suites plus targeted work overlapped then; contention is a hypothesis,
not proved root cause. Running concurrent full suites was an orchestration error
for attribution. Stop77 signals only the12 recorded owned predecessor processes;
post-stop audit83 finds no original commands alive. W3 full37 and W4 full56 are
STOPPED_PRESERVE_FAILURE, never full PASS; W3's later signal-related test failures
are not separate confirmed product defects. Final W5 full71 continues with all
original tests/thresholds and without those predecessor suites. If it fails,
retain and diagnose it rather than waive its assertion.

Wait-only Photos59 had0runs and was explicitly stopped before queries to await
W5; raw stop72/postflight64 retained. The earlier waiting chain73/74/75/76 aborted
when predecessor gates stopped; it ran0performance sessions. Its FAIL/STOP labels
are controller prerequisites, not Photos query failures. No timings are selected
from these abandoned controllers, nor erased from history.

Current downstream chain, strictly serial after final full71:
quiet-initialization78 (entire original admission file on W3/W4/W5, no changed
20s/60s waits) → paired-initial79 (2048/20K/30K ×3processes/version, W4 vs W5) →
photos-three-candidate-controller80 (W3/W4/W5 ×3serial processes, exact ScreenManager
definition, first/hot/init) → photos-initial-controller81 (original refs-first
Photos sequence, same45s external protection). Independent input postflight82
compares all30288 regular-file/link identities with inventory63; individual
sessions also check selected SDK/input identities, SQLite and CLOSED.
These runs are pending; do not describe them as executed or UI/endurance.


### Final full71 reaches the original deadline case without waiver

Original complete-large-project admission test PASS in full71,40021.20ms wall.
Fixture-created2999.62ms, initialization-ready16939.03ms from test start;
interactive checks33319.97ms, global reference terminal37618.13ms. Actual20s
notification and60s test deadlines/assertions remain unchanged. W2 full22 had
fixture2908.23ms/init-ready15950.55ms/whole39285.91ms. These single full-suite
samples do not establish an initialization regression or explain all timing
variation. Quiet three-version controls78 remain required; the entire full71
is still running, not yet declared PASS.

### Native cache and file-count terminology in actual Photos controls

Project inventory63 has30000 .ets/.ts files (13900/16100), plus other files;
semantic report admits29995. Native catalog's discovered count is30000. These
are distinct eligibility universes; this slice does not attribute the5-file
difference or mix either with measured Program87project files.
Definition-only control26 did NOT await complete Native publication: its close
terminal is cancelled,9664/30000 indexed, and incomplete draft cleanup leaves
only~216KiB cache vs original refs-first23's~744MiB interrupted storage. SQLite
integrity alone is not index completeness. The three-version controls80 follow
the same semantic-preparation-triggered/default-background-indexing condition;
cache-directory existence/reuse must NOT be labeled a qualified warm index.
Final analysis must report actual Native terminal/counters for every run.
Comparative ordinary timings under that background condition are observations,
not isolated attribution of all latency changes to validator allocation.


## Final W5 correctness gate completed

`actual-checkfast71.log`: actual pnpm check:fast,2792/2792 PASS,
fail/cancel/skip/todo all0; source and runtime changes both empty in gate69.
Full stage19:22:53.735–20:40:48.405UTC,2026-11-22. Focused70 had111PASS0skip.
Native after gate remains800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c.
This is the actual final W5 receipt; earlier stopped37/56 are not reused as PASS.

Complete1065 frozen JS/TS/script/test/package inputs saved in
candidate69-frozen-source85.tar.gz (SHA256fc2286f1a0be223c697075c512d1d3c2a71ff21bac79ae6ffa6c007be6eeb655),
with verified Mac runtime/native copies in candidate69-frozen-runtime85;
archive receipt85 records scope. Task-only source patch84 applies cleanly to the
inherited Q4 candidate,18changed handwritten files<=500lines (largest464), not a
claim the patch applies directly to clean main. No commit/merge/deploy.

Quiet controls78 and serial ordinary scale79/Photos80/original-reference81 are
still pending/running. Full correctness PASS is not their performance acceptance.


## Serial initialization control78 and generated scale79 completed

Original admission file on unchanged W3/W4/W5:3/3 PASS each,9total, no skips
or changed deadlines. W3 formerly failed only during the overlapping full run;
quiet W3 fixture2908.68ms/init-ready16013.56ms, W4 3007.77/16231.01ms,
W5 2987.49/17438.89ms from test start. Serial success supports a workload-dependent
failure; it does not measure the original timeout's exact CPU/I/O cause.

Scale79:18/18 PASS,144 exact functional queries,54 real reference-cache hits;
source restoration, SQLite and sampled-process CLOSED all PASS. Fixed actual
P16 for definitions. First reference follows four definitions, so it is a cold
RESULT cache, not a cold compiler/first overall request. Three processes/version
per scale, nine hot samples/version/scale. Summary86 retains every value.
W4 baseline vs current W5 ordinary median/max ms:

|N|first references W4→W5|hot references W4→W5|initialization W4→W5|
|---:|---:|---:|---:|
|2048|2287.92/2318.13→1789.25/1809.43|92.44/97.31→92.75/128.06|3350.89/3443.13→3448.72/3457.14|
|20000|9198.83/9591.50→4342.62/4424.96|592.40/675.95→585.65/593.68|13266.51/13585.86→14051.80/14429.67|
|30000|13230.35/14072.31→5690.28/8659.75|855.29/911.53→986.41/1044.96|18745.12/19056.89→19785.87/37744.40|

This is a measured first-reference improvement with initialization CPU/retention
tradeoff; W5 does NOT improve every cell.30K hot median+15.3% remains a regression
observation requiring diagnosis, not relabeled fluctuation or excluded. The37.74s
initialization outlier is retained: first context creation at~6.26s matches
baseline~6.17s, but later preparation gap and Native catalog completion are much
later (Native ready~35.58s vs baseline~16.45s). Those intervals overlap; do not
add them or infer the cause. Native CPU totals28.07s vs20.90s are whole-session
CPU, not initialization exclusive cost. No phase CPU/I/O cause is established.

Post-seeding diagnostic87 waits until all ordinary Photos80/81 sessions finish
and owned processes/DBs close safely; calibrates the observer on public2048 then
records30K counts to check for repeat I/O. Its instrumented timing will not be
mixed into ordinary distributions. Actual Photos definition controls80 remain
in progress, refs-first81 has not yet run. No overall Photos/UI/endurance PASS.


## 2026-11-23 continuation: actual Photos first-reference failure and bounded lexical verification

Frozen W5 passed the actual full `pnpm check:fast`:2792/2792, no failures,
skips or cancellations (`final-gates69.json`, `actual-checkfast71.log`).
This does not establish Photos/UI/endurance acceptance. Ordinary Photos80
nine sessions returned36 exact definitions. W3/W4/W5 hot-definition medians
were2538/2538/2185ms; the bimodal distribution and overlapping Native background
index mean causal definition gains are not established. Native index completeness
was not reached; closing cancelled private drafts. SQLite integrity is not coverage.

Original refs-first81 still failed45,002ms. Its first batch had1025 roots;
no batch completion appeared before the external driver protection. This is not
an observed OOM or compiler deadlock. Front admission reached cache miss in
about1329ms vs9957ms in original23, so content-read reuse helped that boundary
but did not remove the subsequent broad verifier build. Init81 overlapped the
read-only whole-input inventory for~10s: do not use its81.6s as an isolated
initialization comparison. Query timing started after the inventory ended.

Diagnostic88 changed only the driver batch target to1, retaining the same
29,995-source Photos input, full SDK and deadlines. First lexical references
returned the exact3 locations in8278.88ms; three actual cache hits were
948.58/944.68/948.18ms. The executed first batch had2 roots, actual199 project,
282 SDK and113 other Program sources; getProgram3774ms includes
createProgram3316ms (do not add), query21ms, batch4737ms. Only one of29994
planned batches ran because actual lexical coverage excluded the rest. This is
a causal cost control, not a recommended batch1 default or complete global-query
acceptance. Remaining intra-compiler CPU costs are unmeasured.

Recommended next slice: preserve1024 fallback target and normal full SDK,
use syntax only to select a bounded one-root lexical verification attempt;
only actual compiler lexical proof plus existing coverage validation permits
return. Refused/incomplete probes contribute no results to the normal plan.
No proof = original complete conservative search. Current input/final fences,
cancellation, verifier admissions and maximum batch constraints stay in force.
The optimization changes proof discovery order, not the meaning of completeness.

Implementation W6: `/private/tmp/arkts-lexical-reference-probe-20261123`;
base1e3886d plus inherited frozen W5. Public LSP RED90 proves the existing
whole-batch route; GREEN92 and focused94(5/5) prove one root with3 exact
locations, cache receipt, full fallback for shorthand and no probe for classes.
Broader focused95 is running. Final freeze/full and actual Photos default-policy
validation are still required; prior W5 full results cannot certify W6.

Serial completed-cache recheck89 (6 sessions/48 queries/18 hits) retained the
hot-reference regression: W4 median852.54/max934.96 vs W5
889.64/1047.75ms (~4.4% median). First refs13039/14054→5895/6224ms;
init18767/18871→19761/19866ms. Earlier scale79~15% hot regression remains
historical; the recheck does not erase it. Diagnostic87 confirms zero extra
query project open/lstat/realpath and30000 numeric-observation digest hits,
but CPU/GC cause of residual timing changes is unmeasured. Do not claim every
operation got faster. `paired-hot-summary96.json` preserves exact statistics.


### W6 default-policy Photos result (108/113)

Three serial fresh-process sessions, twelve exact local reference queries,
nine actual cache hits. Default1024 fallback/fullSDK unchanged, no driver batch
or heap override. Init median/max85088.81/86574.95ms; first local references
8125.95/8156.65ms (all three7949.65/8125.95/8156.65); hot9 median/max
1021.59/1061.71ms. Prior81 is a censored45s failure, not a completed baseline
latency from which an exact speedup factor can be calculated.

Each first query used one query-root attempt and actual Program87 project,
282 SDK,113 other sources, total482; actual root count3 includes2 SDK roots.
No conservative batches executed; later result hits built no additional
verifiers. First-round verifier4203ms includes getProgram3293ms containing
createProgram2896ms, startup519ms, host127ms, query21ms. These nested values
must not be summed; remaining request work includes namespace/final fences
and other unmeasured boundary work. No new CPU profile is claimed.

All exact Locations, source/selectedSDK before-after hashes, sampled owned
process closure and SQLite integrity passed. Whole-project input postflight109
is performed after all ordinary sessions, avoiding81's inventory overlap.
Node RSS sample max2043.34MiB, Native64.88MiB, distinct-process tree2106.57MiB;
Worker threads share Node RSS and are not added again. These are sampled RSS
peaks, not continuous heap/PSS. Default RSS policy and V8 limits unchanged.
Native cache reuse is not claimed complete: definition/local short sessions
close before full background indexing qualification. Integrity is not coverage.

A new public error-recovery source counterexample found the old compiler
lexical producer incorrectly qualifying function-body `export let` despite
zero parse diagnostics. RED99/GREEN100 reject modified local statements while
preserving ordinary exact results; alias control101 was already refused and
received no speculative product fix. Public cancellation/stale-overlay/fresh
recovery now included in combined10712/12 PASS. Registration-count failures
102/104 retained and fixed with explicit380-entry/199-bundle expectations.
Final109 froze1068 inputs; focused110 and actual full111 are now running
serially. No W6 full PASS is claimed yet. Current synthetic scale112 waits for
that final gate and cannot run concurrently with full checks. No UI/Windows,
endurance or full-class references/rename acceptance follows from these tests.


### W7 review correction, no completed full-check claim yet

A public property-name control118/121 proved W6 syntax hint too broad:
`let isolated=1; const object={isolated:2}; object.isolated` returned the correct
2 property locations but dispatched an extra doomed local verifier before
ordinary fallback. This was avoidable work, not wrong-location evidence.
W6 full111 was intentionally stopped before completion; preceding focused110
115PASS and Photos108 remain historical checkpoints, not W7 certification.
Frozen1068source/runtime checkpoint119 archived (SHA96de66b8c4a19ab1bbb81585739c3072a2b553d0cc7f95781adc886247f13637).
All captured11owned processes closed, audit126. Driver117's first invocation
had a missing path; it is not the real public failure118. Type122 stopped the
build, so124 used the prior runtime and retained2 expected property failures;
these are not new independent defects. No original failure evidence erased.

W7 syntax selection rejects property/declaration names, labels and qualified
right names before guessing a local binding; genuine variable declarations and
expression uses remain eligible. Proof production/coverage/final fences remain
independent and unchanged. Public roles cover property key/access refusal and
object-variable positive qualification. Additional computed string-key and
Symbol escape controls compared old full-Program vs narrow route120: both
2PASS with equal exact references, no confirmed escape omission. These two
cases became permanent public regression controls. No speculative alias fix.

Revised type125/build and combined12517/17 PASS, zero skips. Source now frozen
under134 (same isolated worktree, revised Worker1e6dbd900d77bdad0d16a0797e48bdecddcc73735175693aac716b7c3bbd7d53;
server27517a3c/refverifier41651837/Native800e6628 unchanged). Default-policy
Photos126 is serial; frozen focused135/full136 follow, then scale137 and
actual overlay-only Photos138 (open/edit/undo/save/close/reopen). This is not
real UI or endurance. No final W7 full success claimed while these are pending.

Driver-only numeric substitution corrupted date paths in127/130/131; original
scripts preserved in133,127 stopped while idle before any check, zero product
queries from those failed launchers. Exact-string replacements134/137/138 are
syntax-checked; Photos126 was unaffected. Keep these separate from product
failures. Current ordinary Photos runs are not overlapped with full checks.
Observed Worker lifecycle116 counts the supervisor semantic Worker only;
nested verifier thread creation is not completely observed. No retirement or
recovery events appeared before shutdown; its observed exit1 at shutdown is
not evidence of a crash. RSS includes all threads once regardless of that
observer's scope; do not add Worker RSS to Node RSS.
