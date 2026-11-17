# Versioned index: isolated Windows validation

Status: **IN_PROGRESS**, not UI acceptance or a completed Photos endurance run.
Mac serial scale/density/topology timing remains separate. No product changes,
daily installation, daily Zed restart or real-cache deletion occurred.

## Fixed input and environment

- Parent298d65f5d7f796c347fe8be5c739e428066489d8 plus current uncommitted IX20 candidate.
- Source snapshot68aa4629acb6683a330b85ff7f4d795a128dee6833b48f80b9239e38c255b68f.
- All2441 source inputs and78 platform-independent runtime assets matched on Windows.
  Mac Native was excluded; Windows Native is built from the same Rust inputs.
- ZIP14748519bytes, SHA256aa6a96b705151293d1dec6ccbc39aa82450b324e451b6be6fea7c1977cb7e987.
- HostDESKTOP-REQCEV6, Node20.19.5, Cargo1.95.0.
- SSHSession0; explorer was observed inSession12. This does not prove the input
  desktop is unlocked or UI automation is available. No desktop input was sent.
- Existing declaration SDK path:
  `D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`.
  Fresh SDK byte manifest and current-candidate Photos testing are not yet done.
  Prior Windows declaration-SDK evidence is not current Mac SDK equivalence.
- New isolated root:
  `D:/DevSetup/diagnostics/index-versioned-maintenance-20261110-ix20`.
- Cargo target:
  `C:/Users/liu xun yuan/AppData/Local/Temp/arkts-index-ix20-20261110-target`.
  Actual available disk was C207050547200bytes/D15745200128bytes before preparation.

## Actual execution and errors

1. Initial read-only directory probe used absent `quser`, invalidating that probe.
   Corrected read-only discovery succeeded; its failed result was not used as evidence.
2. Initial directory-preparation command used an unvalidated20GB estimate and
   stopped before mkdir/upload. That estimate was removed as an acceptance gate
   after measuring actual volumes. Existing resource protection is unchanged.
3. New root created, ZIP uploaded and all2441/78 hashes independently checked.
4. `cargo build --locked -p arkts-index-sidecar --release` **exit0**,
   2026-11-10T15:24:58.746Z–15:30:35.421Z. This is a build result, not test success.
5. Initial SQLite focused command **exit101 before running tests**:
   `versioned_cache_retirement` belongs to the sidecar package, not SQLite.
   Original `native-execution.json` and `sqlite-focused.log` remain preserved.
6. Corrected focused-v2 command is running using the existing release candidate.
   SQLite targets: file_version_publication, versioned_lifetime,
   versioned_crash_recovery, versioned_gc_sweep.
   Sidecar targets: versioned_cache_retirement, maintenance_parser_lifetime,
   maintenance_event_scope, catalog_incremental_maintenance.
   Counts and Windows-specific skips remain pending; no tests or assertions changed.

A separate read-only Get-Process/log-tail probe remained live without returning a
JSON record at last observation. It is not a Native-test result or product hang.
Its handle and raw stdout/stderr are recorded separately; no workload was restarted.

Later terminal observation: that read-only probe handle37108 exited1. Its preserved
stderr contains PowerShell CLIXML `ConvertTo-Json / PSInvalidCastException /
InvalidCastFromAnyTypeToString`. This was an observation-script serialization
failure, not an index process hang, Native test failure or evidence of a product
process being killed. The stale live handle is now cleared; no cleanup kill was used.

## Evidence and remaining work

Local evidence: `.bench/index-versioned-maintenance-20261104/windows-ix20-20261110/`.
Includes preparation/remote hash proof, release log, original command failure and
raw diagnostic-probe streams. Remote focused-v2 logs/receipt remain under the
isolated root until terminal collection. Authoritative live handles are in
`.bench/index-versioned-maintenance-20261104/progress.json`.

Still required: focused test counts/terminal proof, Windows Native SHA,
public LSP/save-watch lifecycle, isolated Photos current-candidate validation,
SDK identity and final input/runtime/resource checks. Actual UI remains NOT_RUN;
no protocol or Rust result can substitute for desktop interaction.


## Focused Native terminal result

Corrected commands completed: SQLite14PASS, sidecar10PASS, total24PASS across8integration binaries;0failed/ignored/measured/filtered. Compile-time cfg-excluded tests are not counted. Windows releaseNative SHA256 `f975ac5f352a46f6af72f2b8a57d7b98cf1bdda82cbacf39dfa28e9147823477`. Receipt `windows-ix20-20261110/native-qualified-summary.json` pins each raw log hash and command. Earlier nonexistent-target exit101 remains preserved.

The next isolated stage copies this exact Native into the test source target, installs locked pnpm8.15.9 dependencies, and runs existing public framed-LSP tests: `lsp-index-versioned-maintenance`, `lsp-resource-source-namespace`, `lsp-directory-namespace-lifetime`. It has started; test counts and hash postflight are pending. No UI or Photos validation follows merely from these tests.


## Public LSP failure: Windows audit-launch incompatibility confirmed

Original13public LSP cases:9PASS/4FAIL/0skip, exit1. The4failures are audited file-maintenance/resource-source namespace cases reporting index degraded0;8directory-lifecycle cases and1resource-only case passed. Original log/receipt retained.

Both original index-test controls failed: default extensionless binary path and supported explicit `.exe` override. Thus extension correction alone is not a demonstrated fix. Their stderr only shows degraded0, not the initiating spawn exception.

Independent mechanism probe on Node20.19.5/Windows: direct `spawn(native-wire-audit.mjs,[],{shell:false})` throws synchronously `UNKNOWN / spawn UNKNOWN`. `spawn(process.execPath,[sameScript])` using the same real Native exe records its SHA/PID and exit0 without guard intervention. Product `src/index/sidecar-session.ts` directly spawns its configured executable; the test substitutes a POSIX shebang `.mjs`. This proves an audit-launch compatibility defect; it does not establish a customer Native-executable regression or fix the4failed public cases. Extensionless paths read by the auditor remain a separate static portability risk, not a completed runtime root-cause proof.

Evidence: `audit-launch-probe.cjs`, `audit-launch-probe-result.json`, both `fixture-path-*` control logs and copied original LSP stderr under the local Windows evidence root. Native SHA is unchanged. Context7 resolve failed with transport HTTP error; pinned official Node20.19.5 [child_process documentation](https://nodejs.org/download/release/v20.19.5/docs/api/child_process.html) was consulted as fallback; the `.mjs` result above is empirical, not inferred from documentation about `.cmd`.

Next boundary: reuse the existing passive `native-child-lifetime-audit.cjs` approach for portable stdin/stdout observation, add meaningful CLI/public-LSP regressions, preserve assertions and actual Native executable launch. Do not add product shell/argv configuration or extensionless binary copies merely to make tests pass. The current frozen product/source candidate and Mac timing controllers have not been changed.


## Passive-observer test-only variant: RED / GREEN / postflight

The existing lifetime observer was copied into an isolated diagnostic area. One real-Native lifecycle/output characterization passed; the new complete-wire test initially failed because the audit file was absent. Minimal optional passive observation then passed both CLI cases, including split UTF8 across write/end, unchanged response bytes, callback counts, return identity/backpressure and actual Native exit. No protocol response was synthesized; logging observes writes admitted to the parent stream, with Native terminal responses providing processing evidence.

Four additive test files reuse direct real-executable launch plus this preload observer. Both original test bodies retain every original assertion; only audit setup and reading change. The same13public LSP cases then passed13/13,0fail/skip/cancel. Original9PASS/4FAIL and both failed path controls are retained. This is a tested fixture variant, **not a rewrite of original results or an integrated W candidate**.

Windows postflight matched every original2441 input,78runtime assets, all4test overlay hashes and Native SHAf975ac5f…7823477. Proof: `portable-postflight.json`; full RED/GREEN/raw-log hashes: `audit-portability/qualified-controls.json`; exact additive files: `audit-portability/overlay-manifest.json`. No product code or running Mac artifact was changed. Official integration and a fresh applicable whole gate remain pending after frozen timing controls. Real Photos/current SDK validation and actual UI remain unexecuted.

## Later execution: real Photos 30K cold index (terminal, protocol only)

This supersedes the preceding Photos-pending status, without changing the earlier
fixture failures or implying desktop UI coverage. The original Windows snapshot
was copied to the new isolated `photos-project`: 30000 TS/ETS sources, 30288 total
files, no source symlinks. SDK inventory has 1674 total files; this is not a
declaration-file count and is not the Mac SDK inventory.

The cold session ran **2026-11-10T17:44:06.138Z–17:49:54.704Z**. The product
catalog terminal reported **ready, 30000/30000 indexed, skipped0**. Initialize
was observed at749ms process-relative; both index and semantic preparation
terminals had been observed at348402ms. Those intervals overlap and must not be
added or described as exclusive native build time. Shutdown ACK was received,
then server exit0/no signal; no protection termination was needed.

Semantic preparation nevertheless reported **degraded / project-membership-incomplete**,
no ready capabilities and no semantic generation. Index completeness does not
establish complete semantic capability. This run did not issue interactive
queries and is neither mixed endurance nor a real Zed 99%-stall reproduction.
334Worker metric records report a20000-file Host set, max totalSemanticWorkerCount1,
heap-used peak532294584bytes and heap-total567492608bytes (inside the Node process).
This matches the existing `MAX_PROJECT_FILE_SET_PATHS = 20_000` at
`src/core/workspace/document-store.ts:42` and membership gate at
`src/semantic/project-readiness.ts:36`. It does **not** measure actual compiler
Program source count. Native audit records one identity and matching normal exit0.
No protocol report in [99%,100%) was observed; only the final100%/end was seen,
so the measured99%-window is **unmeasured/null**, not zero or proven resolved.

Seventy resource samples completed without sampling errors. Observed Node PID2936
working-set peak was617558016bytes (588.95MiB), native PID20000 peak76521472bytes
(72.98MiB). Node includes Worker threads; the two independent peaks are not a
simultaneous process-tree peak or PSS. Worker isolate heap remains separately
recorded and is not added to RSS. Minimum available D-disk13474148352bytes;
minimum system available-memory fraction0.63746. Default product RSS budget was
unconfigured; test Node2GiB protection remained waived. Existing1GiB disk and
15% system-available-memory guards were retained.

Read-only postflight at17:52:31.262Z matched all original30288 files, all isolated
30288 files, all1674 SDK files and the exact launch server/Worker/native hashes.
No original source or SDK content was changed. Calibration retained: a deliberately
wrong count3 for2 real files failed; corrected count2 passed with normal shutdown.
An initial progress observer incorrectly included100% in the99% window; its
assertion failed and a separate corrected calibration passed. Earlier results
were preserved, not overwritten.

Evidence below `.bench/index-versioned-maintenance-20261104/windows-ix20-20261110/`:
`photos-preparation.json`, `photos-cold-index-01-qualified-summary.json`,
`photos-cold-index-01-postflight.stdout`, `photos-cold-index-01-evidence.tar`,
`collected/photos-cold-index-01/{result.json,resources.ndjson,native-owner.ndjson,worker-memory.ndjson,logs/server.log}`.
Raw result SHA256 `b16011c6ec70a6950827efb9f0f05c1f316d2cf80df5f531ee958f49fd4caa3a`.
`photos-index-probe.mjs` preserves exact invocation/recording behavior. Actual UI,
mixed queries, complete semantic correctness and Windows whole-gate remain open.


## Later execution: definition lifecycle diagnostic (running)

A separate calibrated driver now checks exact definition URI/ranges after open,
hot repeat, unsaved append, undo, and close/reopen. Disk content is asserted unchanged.
The two-file real-LSP calibration deliberately shifted the expected declaration
start by1: its actual public response was rejected (exit1), then normal shutdown
ACK/exit0. With the correct independently located declaration, all5requests passed
at130.78/118.59/201.02/189.39/125.65ms, again normal close. This is an oracle/driver
calibration, **not product RED→GREEN or a measured30K result**. Evidence:
`definition-calibration-evidence.tar`, `definition-calibration-qualified-controls.json`.

The same driver has started on the isolated30000-source Photos project and the
original PickerUIExtensionAbility__copy_003 ScreenManager.getInstance cross-module
target, using a new cold cache and unchanged candidate/SDK/product limits. Its
100000ms request observation budget matches the prior replay; it is not a product
timeout change. Current result is RUNNING, not five definitions verified. Exact
driver/spec hashes, live handle and output directory are in
`photos-definition-stage.json`. Prior cold-index evidence remains preserved.
This stage is protocol-only and is not UI, mixed workload, or a2h endurance run.

### Definition lifecycle terminal result

The run completed **18:00:05.111Z–18:05:51.088Z**,345977ms including the new cold
index. Catalog reached30000/30000, skipped0 at18:05:48.000Z. Every definition
queried PickerUIExtensionAbility__copy_003.ets at0-based53:19 for
`ScreenManager.getInstance()`, and exactly matched
`common/src/main/ets/default/model/common/ScreenManager.ts`,0-based81:9–81:20.

| Precondition | Request ID | Milliseconds | Exact URI/range |
| --- | --- | --- | --- |
| First open | 2 | 1464.31 | PASS |
| Same-session repeat | 3 | 330.62 | PASS |
| Unsaved append | 4 | 420.08 | PASS |
| Undo to original bytes | 5 | 418.19 | PASS |
| Close/reopen | 6 | 280.39 | PASS |

Edit was the exact suffix `\n// Windows isolated unsaved diagnostic edit\n`;
versions1(open),2(append),3(undo),4(reopen). No save/watch/file-system mutation
was sent. This checks returned locations across those versions, not whether the
comment-only edit semantically invalidated a checker cache. Repeat is not proven
result-cache hit. Request100000ms is the external observation budget; product
deadlines were not changed. There is one sample per precondition, not a multiround
median or tail distribution. A1464ms first response is measured, not hidden by
the soft500ms target.

Normal shutdownACK id7, Node exit0/no signal; one recorded Native identity and
matching exit0.344Worker metrics report Host sizes20000and87; this distinguishes
initial root membership from the later interactive profile, and does not count
actual Program files. Max sampled totalSemanticWorkerCount1, heap-used555040656bytes;
Node working-set peak614232064bytes, Native76390400bytes, counted separately.
Initial semantic preparation remains degraded/project-membership-incomplete;
successful local definitions do not certify full30K references or rename.

Postflight matched original project, isolated project, SDK and the exact launched
server/Worker/native hashes. Evidence: `photos-definition-lifecycle-01-evidence.tar`,
`photos-definition-lifecycle-01-qualified-summary.json`,
`photos-definition-lifecycle-01-postflight.json`, plus complete collected raw logs.
Raw result SHA256 `47032d956d8af1862d3c562ff1061965197ef1c573b3656bbbeba6f9b33bb018`.
Actual UI, mixed Windows load, dependency moves, disk saves and Windows endurance
remain **NOT_RUN**; this successful short protocol sequence does not close them.


## Final format10 Windows Photos30K protocol supplement (2026-11-11)

Scope: five serial definitions on real isolated30K input, NOT UI, mixed endurance,
disk save, complete references/rename, or uninstrumented timing. Original and
isolated30288-file inputs (30000sources), SDK1674files and launch artifacts match
both preflight/postflight manifests. Node20.19.5, server691b1cce, Worker86bf5c28;
new Native A64504. Exactly one actual matching Native identity and normal exit0;
server shutdown/exit0, observed Worker epoch1/max1, no recovery/retirement events,
server errors, sampling errors or protection stops.

Session 2026-11-10T22:08:13.997Z to 2026-11-10T22:14:16.569Z, total362572ms. Driver start to
initialize return1036ms, semantic terminal14277ms, both preparation/index terminals
observed359325ms. These overlapping intervals include baseline resource sampling:
do not sum them or call them exclusive compiler time. Native indexREADY30000/30000,
no skipped files. Semantic readiness remains degraded/project-membership-incomplete;
correct local definitions do not certify full semantic readiness.

Caller: product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets,
ScreenManager.getInstance(), zero-based LSP(53,19). Every result exactly matches
common/src/main/ets/default/model/common/ScreenManager.ts (81,9)-(81,20).

| Order / state | Current format10 ms | Earlier IX20 format8 single ms |
| --- | ---: | ---: |
| opened-first | 1510.96 | 1464.31 |
| hot-repeat | 342.17 | 330.62 |
| edited-first | 424.64 | 420.08 |
| undo-first | 438.35 | 418.19 |
| closed-reopened | 312.57 | 280.39 |

States: open originalv1, same-version repeat, full-text unsavedv2 adding only
\n// Windows isolated unsaved diagnostic edit\n, restore originalv3, then
close/open originalv4. Disk unchanged. Each state has ONE observation, not a
multiround median/maximum or statistical comparison. OS cache/background load
uncontrolled; these differences do not establish improvement/regression. Input
hashing warms filesystem cache: cold means fresh DB/process, not cold OS cache.
No99-percent protocol event was observed; no UI99-percent dwell conclusion.

Resources:73Windows WorkingSet samples,0errors; Node peak
603.28MiB, Native peak
71.66MiB; simultaneous sampled tree peak
640.37MiB.360Worker metrics give
Node process RSS peak605.25MiB and Worker heap-used peak
530.38MiB. Worker heap is already inside Node process memory, do
not add it again; sampling peaks are not exact instantaneous peaks or PSS.
Host projectFiles metric20000->87 is not measured Program.getSourceFiles total
(UNMEASURED). This short run cannot establish a memory leak or long-term plateau.

Database integrity was not separately measured in this Windows session. Only
WindowsApps Python aliases/no usable SQLite CLI were found; no dependency install
or cache mutation was done. Rust scratch tests do not substitute for this real DB
check. Raw archive: owner-retention-control/format10-photos-definition-01-evidence.tar
(excludes index DB). Requests/results/progress/resources/Worker/native raw output
are in format10-photos-closed. Qualified summary:
owner-retention-control/windows-format10-photos-qualified-summary.json.

Mac IX22 whole check, final Photos36 endurance and serial scale37/density38/
topology39 still pending. No UI acceptance, deployment, merge or publication.
