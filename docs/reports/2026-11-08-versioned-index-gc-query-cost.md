# Versioned index GC read cost and persisted-source scale failure

Status: confirmed defect; minimal SQL repair has mechanism RED/GREEN, final combined checks and large-session revalidation pending. No release/merge/deployment. ADR0043 remains Proposed.

Canonical issue ID is **IDX-V1-GC-005**. The first draft accidentally reused GC-001, already assigned to wait-for-GC cancellation on2026-11-05. Frozen source snapshots/raw receipts retain that draft label as historical evidence; they describe this scan-cost issue only when linked to this report. The original cancellation issue is unchanged.

## Identity and preserved failures

Parent: `298d65f5d7f796c347fe8be5c739e428066489d8`, isolated candidate `/private/tmp/arkts-index-versioned-maintenance-20261104`. Before this repair its complete unchanged2381-input snapshot passed2406/2406 Node tests, Rust414PASS/1existing ignored and all declared supplements. That whole-candidate pass applies to Native `9c65ce088fe10621d5fd2b044d3703adfb61ac89a50658ca9f43beb0256258eb`, not the new SQL candidate. Immutable round08 runtime preserves it.

Issue **IDX-V1-GC-005 (P1)**: generated20K-source public framed LSP save/duplicate-watch scale test fails its original30s terminal observation. Native catalog initially ready20000/20000. Save first file writes exactly1 document/10 logical facts; full qualification writes0, but end-to-end save15848.6ms. The next duplicate produces unchanged/0writes/0fact rows, yet complete qualification is absent before observation fails. Main and density controllers stopped;30K and two-hour session NOT_RUN. Sources restored, observed3 owned PIDs closed, server exit0, both databases integrityPASS. This is not evidence of OOM or corrupt output.

Evidence root: `.bench/index-versioned-maintenance-20261104/`:

- `final-acceptance-08/persisted-source-scale/runs/sources-20000-trial-0/`: original complete logs, resource samples, input manifests, raw Native streams and resultFAIL.
- `driver-failure-20261108/failed20k-native-chunk-timeline.json`: reception timestamps mapped from raw chunk byte offsets. These are wire intervals, not internal function timings.
- `driver-failure-20261108/native-progress/`: independent128/20K Native-only run, unchanged current release, generated isolated inputs and controlled stack samples. Not ordinary performance timing or UI.

## Causal chain and distinction from full writes

Public didSave/watch -> MaintenanceInputs.observe/deliver -> Native maintenance/changes -> precise file job -> maintenance_executor::launch -> Collection::before_input -> Barrier::wait -> CatalogCollector::collect -> VersionedFacts::collect_garbage. The control loop stays separate; the incoming data writer deliberately waits for an already dispatched GC quantum before taking the shared reuse/writer lane. A full maintenance/start subsequently establishes complete qualification under the same lane.

Raw failed-LSP intervals: duplicate changes at+26.841s; file unchanged terminal+39.837s (~13.0s later); full reconcile accepted+39.839s; shutdown at+57.806s. Thus only~18s remained for full qualification after the file result. No repeated facts rewrite occurred in those observed terminals. Lost/misassociated terminal is not the supported explanation.

Independent Native20K: save-file~24732ms, save-qualified~14965ms; duplicate-file~23725ms, duplicate-qualified~25899ms. Their combined duplicate work exceeds the original30s observation even though each local wait was below30s.128 control finishes file/qualification waits in~86–356ms. Stack sampling at10/20s shows the collection thread in collect_garbage -> change -> sqlite3_step, and the maintenance thread in Barrier::wait. Sampling itself adds overhead; these times cannot replace ordinary LSP measurements.

Important diagnostic limitation: the first Native-only driver's operation labelPASS omitted its5s post-shutdown exit protection.20K acknowledged shutdown but still had ongoing teardown/GC; the driver killed it (-9). That is a **closure failure**, not normal exit or whole-runPASS. Preserve the original receipt and use the validated interpretation below; do not infer automatic Worker crash. Signed near-zero ACK offsets are receive-time minus wait-start, which may begin after the queued ACK; they are not negative request latencies.

## SQL cause and evidence

`crates/index-sqlite/src/versioned_gc.rs::VersionedFacts::collect_garbage` selects an unreferenced file version. Its correlated `NOT EXISTS(SELECT 1 FROM manifest_entries e WHERE e.version=f.id)` lacks a version-leading manifest index. Existing manifest indexes lead by group/URI or URI/group. The observed plan scans manifest entries repeatedly for outer versions.4096 deleted-item/4MiB payload limits do not bound scanned candidates or SQL VM work, particularly when no row qualifies.

Read-only SELECT-body diagnostic against the sealed failed-run DB, system SQLite3.51.0: original exceeds50million VM-operation buckets and is deliberately interrupted; proposed noncorrelated reference set finishes~620000 operations/~34.46ms, no candidate. This is auxiliary SQL evidence, not the bundled Native engine or a complete transaction benchmark.

A regression invokes the actual public VersionedFacts create/write/stage/publish/collect APIs using bundled SQLite3.53.2; a test-only synchronous sqlite progress callback measures the whole collector, including all SQL. No copied implementation SQL or wall-clock threshold is asserted.512 ->2048 published files:

| Candidate | 512 approximate VM steps | 2048 approximate VM steps | growth |
| --- | ---: | ---: | ---: |
| original correlated anti-probe (RED) | 549000 | 8488000 | ~15.46x |
| reference set once (GREEN) | 28000 | 116000 | ~4.14x |

This demonstrates an avoidable quadratic-like scan component in this controlled range, supported by the specific correlated-plan code. It does not prove the entire language server or all GC stages are O(N²), nor that the new entire server is scale-independent.

RED command: `cargo test --locked -p arkts-index-sqlite --lib current_manifest_collection_avoids_per_version_full_manifest_scans -- --nocapture`. First attempted `--exact` short filter ran0tests; retained as setup error, NOT the RED proof. Actual RED is `gc-vm-work-red-executed.log`, GREEN `gc-vm-work-green.log`.

## Minimal repair and safety

Select versions not in a single noncorrelated set of non-NULL manifest versions. Keep all candidate state/creator/live-owner pin predicates, same writer transaction and post-selection collecting-state semantics. Include every manifest group as before; this does not weaken staging/published references or stale reader protection. Explicit `IS NOT NULL` is necessary because rejected/removed entries have no version.

No schema migration, index creation on startup, format bump, GC disablement, longer deadline, altered budget or lost input fence. Full qualification still requires real complete scans; its remaining cost must be measured independently after removing this avoidable GC component.

Tests: test-only module `versioned_gc_work_test.rs` measures public collector work and first/middle/last retained document visibility. Public integration `versioned_gc_null_references.rs` preserves current accepted facts and live pins while reclaiming an orphan beside rejected/removed records. That characterization passes original code; deliberately removing the non-NULL guard from the rewrite makes it fail (retained mutation RED). Existing GC budget/concurrent-collector/owner-sweep/catalog collection tests must remain GREEN. Default and experimental layout, Native release, full checks and exact failed public20K sequence must be revalidated on the final new candidate.

## Separate test-observation defect IDX-V1-OBS-006

Raw tee `observation/native-audit.mjs` originally spawned actual Native with empty argv. Automatic cache-GC CLI consequently entered stdio mode and exited without a report; logs contain index.cache.gc.failed/Unexpected end of JSON. This is an audit-driver failure, not established product CLI failure. Those runs' LSP/counter/symbol/integrity checks remain observations, but automatic cache-GC was NOT validly tested. Preserve old adapter/hash in `driver-failure-20261108/`.

Adapter now forwards exact process.argv.slice(2). Existing raw20MiB/no-truncation and independent launch tests plus argument-preservation regression3PASS after RED. Actual same-release CLI with a fresh empty isolated cache returns schema arkts.index-cache-gc.v1, exit0. It touches no real cache. This adapter correction does not explain away Native internal GC scans, reproduced directly without the adapter.

## Official basis and boundaries

Context7 resolve for SQLite was attempted and failed transport; no query success is claimed. Official fallback references: [query plans](https://www.sqlite.org/eqp.html), [expression/subquery/NULL semantics](https://www.sqlite.org/lang_expr.html), [VM-step counters](https://www.sqlite.org/c3ref/c_stmtstatus_counter.html). Plan text is diagnostic output, not a stable application API or a string-matching regression contract. Actual bundled engine tests determine this candidate's behavior.

Original Photos/user caches untouched.500ms remains an experience goal. Full30K references/rename limits, SDK partial coverage, no-event namespace recovery and true UI/Windows gaps remain separate open items. New SQL source invalidates any claim that the previous complete2406 pass certifies the final changed candidate; fresh final checks are required.

## Final repair focused/public checkpoint (2026-11-08)

Default focused GC12PASS and experimental WITHOUT ROWID GC12PASS, including actual bundled collector VM work.
Release rebuilt13.84s; Native6553ab87ff0c9d20a36344062fa9b38fa095251fbbaeae0d91adf3395d2c9b2e.
Independent complete79-asset public LSP replay on new20K/30K fixtures passes original30s observations,3unique saves,
3duplicate watches and restore, exact symbols/forged payload refusal, source manifest restoration, process exit0/closure
and integrity. No automatic cache-GC error after adapter argv correction.
20K save median2355.2ms/max2440.5ms; duplicate median2377.9ms/max2381.1ms.
30K save median3376.2ms/max3484.1ms; duplicate median3358.0ms/max3360.0ms.
These are3 in-session samples, not independent cold trials. Earlier failed20K first save15848.6ms and duplicate30s
failure remain, not a valid many-round performance ratio; adapter argv also differs, while direct Native stack/VM
experiments independently isolate SQL scan cost. Full scans still grow with real source count; no500ms success claim.
Evidence `driver-failure-20261108/repaired-public-summary.json` and all underlying runs.
Fresh combined whole-candidate checks and gated full scale/original30K2h are next, not yet passed.

### Strict-close persisted-source four-level scale complete (round10)

Generated independent plain-class sources; SDK intentionally unavailable, no semantic Program or Photos/UI claim.
Three saves/duplicates within one session per size, not three independent session trials. Real framed public LSP,
complete79-asset current runtime, Node20.19.5, Native6553ab87.

| actual sources/native indexed | save median /max ms | duplicate-watch median /max ms | save/duplicate document writes | close |
| --- | ---: | ---: | --- | --- |
|128|415.95 /442.50|409.93 /410.89|1 /0|NORMAL|
|2048|541.50 /568.65|513.76 /521.80|1 /0|NORMAL|
|20000|2413.60 /2463.19|2273.22 /2378.58|1 /0|NORMAL|
|30000|3454.30 /3484.08|3480.68 /3493.96|1 /0|NORMAL|

Each session has7 file terminals (3save,3duplicate,restore),8 real qualified terminals,15 full-start requests but only8
accepted starts. Refused-busy admission attempts are not extra builds/publications. Including required cold facts,
logical documents written are N+4; qualification writes0 documents. This supports per-file delta facts and no full
facts rewrite, while complete-current qualification/read work still grows. It does not prove parser-call or physical
write-byte counts; release read/hash/parse/realpath calls remain UNMEASURED.
Exact persisted symbols after close/forged save payload rejection, restored input manifests, unchanged artifacts,
normal shutdown/no protection and DB integrity allPASS.128 calibration is separate from the formal128 row.
Raw results and sampled per-PID RSS retained in `final-acceptance-10/persisted-source-scale-summary.json`.

Semantic matrix now running, including candidate128 exact17-action calibration PASS. Old baseline20K/30K actual
trace confirms configuration-witness-capacity at4096 and safe normal close/integrity; preflight records remainFAIL,
not successful samples. Later ordinary baseline cases may continue only under the verified narrow failure policy;
current candidate gets no such exception. Full three-round matrix/density/original Photos30K2h remain unfinished.
