# Hot-query performance slice: current W7 acceptance

Status: this slice implemented and protocol validation completed, with significant
remaining performance costs. Overall performance/UI/endurance acceptance is open.
No commit, push, merge, release, daily Zed deployment or user-process restart.
Full diagnostic history: [source digests](2026-11-22-hot-query-source-digests.md).
Decisions: [ADR0047](../adr/0047-query-qualified-reference-result-cache.md),
[ADR0048](../adr/0048-source-digests-with-fresh-membership.md), both Proposed;
implementation authorization is not fabricated independent acceptance.

## Candidate and scope

Worktree `/private/tmp/arkts-lexical-reference-probe-20261123`, revision W7;
baseGit1e3886df3c4d27755a53c073462f1456b0a3de7e plus inherited Q4 and task WIP.
This is not a clean-main commit. Root worktree and unrelated changes preserved.
Frozen source manifest `.bench/hot-query-20261122/final-source-freeze134.json`
contains1068 source/test/tool inputs, no source changes during the full check.
Node20.19.5; pinned compiler4.9.5-r10, SHA
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`.

| Running asset | SHA256 |
|---|---|
| server |27517a3ce973baf59f7852841eea029d8b44f7819af0eb0a84aa9fa242114fb3|
| semantic Worker |1e6dbd900d77bdad0d16a0797e48bdecddcc73735175693aac716b7c3bbd7d53|
| reference verifier |41651837934bda3faf362c7d0f844d685607335a435282d77165f84923f75ec3|
| Native |800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c|

All benchmarks here are Mac protocol-driven, not Zed UI/Windows/endurance.
500ms remains an experience goal, not a binary failure line. Only the test
Node2GiB RSS early-stop is waived; product RSS/V8/deadline/size policies and
remaining protection limits are unchanged.

## What changed

1. Reuse closed-source SHA digests under a current, Store-issued strong
   membership observation. Seed at the actual guarded initial source read;
   reuse derived bytes, never an old validity boolean. Active-document raw
   reads and independent final checks remain. No AST/text retained in this
   bounded32MiB derived-data family cache.
2. Consume completed same-phase Native numeric observations directly, avoiding
   duplicate identity DTO/JSON formatting. Capture immutable witness validator
   callables once, but execute their live validity checks every time. Preserve
   producer/final order, native observation quotas and original final union.
3. For eligible local bindings, attempt query-root verification before broad
   reference batches. Accept only actual compiler lexical coverage; otherwise
   discard all probe results and use complete conservative fallback. Full SDK
   and dependency closure remain;1024 soft fallback target is unchanged.
4. Exclude property/key/declaration-name syntax from the cost hint while keeping
   real object-variable expressions eligible. Refuse invalid local statement
   modifiers that the compiler parser does not diagnose. Preserve cancellation,
   stale-overlay isolation, verifier admission and final publication fences.

## Correctness checks and identity exception

- Focused135:120/120 PASS; zero skipped/failed/cancelled/todo.
- Actual `pnpm check:fast`136:2801/2801 PASS; exit0, zero skipped/failed/
  cancelled/todo. It ran2026-11-22T22:00:48.040Z–23:19:03.530Z.
- Extra strict all-dist guard134 **FAILED** because the suite rebuilt an old
  copied test-only `sdk-discovery-driver.cjs`. That failed record is preserved.
- Source1068, four production entrypoints, standard-library assets and Native
  are unchanged. `tests/sdk-discovery.test.mjs:12–21` builds its own fixture
  entry `tests/fixtures/sdk/sdk-discovery-driver.ts`; only tests reference it.
  Its sole byte difference is the already-frozen statement-modifier refusal.
  Original SDK test145 independently rerun12/12 PASS and reproduced the same
  new helper hash. No product/test assertion was relaxed or modified.
- Independent production identity adjudication145 records both the actual
  full PASS and preserved all-dist guard failure. Do not claim that original
  all-dist snapshot passed. No product source/runtime changed in adjudication.

The final native hash and original full output are retained in the evidence
folder. SDK test12 and focused120 are subsets/extra runs, not added to2801 to
inflate the complete-suite count.

## Actual isolated Photos: default policy

Project `.bench/index-versioned-maintenance-20261104/final-acceptance-36/harness/project`;
query `product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`,
`extensionWindow`, zero-based43:9. Each fresh process initializes, then sends
four sequential references queries; first returns3 exact Locations and later
three are actual result-cache hits. SDK remains
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, selectedAPI24
6.1.1.125 against projectAPI20; semantic report truthfully remains partial.

Raw source inventory30000ets/ts files; semantic eligibility29995; actual
Program87 project+282 SDK+113 other=482. Roots1 project+2 SDK=3.
The5-source eligibility difference is not attributed here. Whole30288
files/links inventory hash remains
`42c5f5147f88b91897e63c10c02615e473a6f3a483e925c7b4cace1f7873f90b`.

| Operation | Samples | Median ms | Max ms |
|---|---:|---:|---:|
| initialize through semantic-preparation terminal |3|84288.32|85192.57|
| first local references |3|7968.10|8051.03|
| repeated actual result-cache hit |9|1023.28|1070.05|

Three sessions126:12 exact functional queries/9 actual hits. Native directory
fresh first, reused later; background full Native index did **not** finish
qualification before shutdown. Do not call later runs qualified warm indexes.
Source/selectedSDK metadata hashes, observed owned-process close and SQLite
integrity all pass; integrity is not index completeness. OS cache is uncontrolled.

The former refs-first81 reached external45s protection with no first1025-root
batch completion. It is censored failure, not a completed baseline latency or
proved OOM/deadloop. New actual one-root proof avoids that irrelevant entry
breadth, without truncating the answer or lowering SDK/timeout/size thresholds.

For the median run7968.10ms, nonoverlapping outer boundaries are approximately
2640ms before probe(33.1%),4211.20ms verifier(52.9%),1116.90ms after(14.0%).
These are wall boundaries, not exclusive CPU attribution. Nested getProgram
contains createProgram and is inside verifier time; do not add it again.
getTypeChecker accessor time is not all binding/checker CPU. Unmeasured internal
work is not assigned a guessed cause. Raw phase values: summary140.

Sampled RSS peaks (Node includes all Worker threads once; Native separate,
process-tree deduplicates process RSS; not PSS/continuous heap peaks):
Node2051.54MiB, Native64.82MiB, tree2115.32MiB.

The semantic-Worker observer does not count all nested verifier threads.
No semantic retirement/recovery occurred; shutdown exit1 was intentional
termination, not crash evidence. Worker heap snapshots remain in raw metrics.

## Final generated scale and real overlay lifecycle

Controller146 completed9/9 sessions,72 exact queries and27 actual reference-cache hits.
All12 isolated-process functional cases (9generated+3read-onlyPhotos) closed
observed owned processes and passed SQLite integrity. Add overlay147 as a
separate13th session, not accumulated single-session endurance.
Actual definition AND reference Programs each contained16 project files in
every generated run. Other N−16 fixture sources are disconnected from this
query, but still scanned/preprocessed; they are not absent from input admission.

All values median/max milliseconds. First class references occur after four
definitions, not as the first user request. Each level has3 first samples and
9 hot samples; these small samples do not establish production tail percentiles.

| Eligible sources | Init | First def | Hot def | First class refs | Actual cached refs |
|---:|---:|---:|---:|---:|---:|
|2048|3451.07/3550.54|260.91/261.49|90.75/134.47|1784.43/1828.52|95.69/126.56|
|20000|13787.27/13960.26|1009.56/1016.05|454.90/550.41|4293.41/4811.22|586.54/679.01|
|30000|19581.28/19658.51|1555.76/1562.66|663.77/727.72|5728.87/6547.45|928.43/1108.22|

Memory sample peaks MiB; Node includes Worker threads once.

| Sources | Node | Native | Distinct-process tree |
|---:|---:|---:|---:|
|2048|434.28|23.22|456.24|
|20000|812.23|97.88|910.11|
|30000|961.93|136.57|1098.41|

All previous completed W5 cache directories reused; current qualification is
checked in real logs. This is fresh-process/cached-index input, not OS-cold
storage. Results positively correlate with source count even at actual P16.
Code still enumerates the source namespace and constructs full proof/maps;
diagnostic87 measured two current membership passes of30029lstat each and
30000 numeric loans with0 additional query project opens/lstat/realpath.
Those diagnostic counts are W5 mechanism evidence, not newly instrumented W7
ordinary CPU percentages. The loops prove remaining size-dependent work;
three sizes do not establish whole-operation O(N), O(NlogN) or O(N²).

Prior paired W4/W5(79/89) demonstrated lower first-reference time but retained
init/hot regressions. Current W7 batches are not a contemporaneous W4 counterfactual.
Do not attribute differences between historical batches entirely to one change.

### Actual Photos overlay lifecycle147

Single session, no project disk writes, default policies. Init86273.74ms;
eight exact references queries, two actual cache hits; no transport/functional
errors. Added `void extensionWindow;` after the first use inside the method
through version2 overlay only; version3 restores original bytes. Query cursor
remains43:9. Full request/notification content and versions are retained in
actions.ndjson and framed wire logs.

| Action/query | Exact locations | ms | Actual cache hit |
|---|---:|---:|---:|
|opened-base-first|3|8069.84|0|
|edited-first|4|4800.95|0|
|edited-cache-hit|4|1113.42|1|
|undo-first|3|4837.44|0|
|undo-cache-hit|3|1026.58|1|
|saved-current|3|4702.63|0|
|closed-disk-current|3|4824.94|0|
|reopened-current|3|4623.80|0|

Each row is a single sample, not a multi-round median. Sequence is open(v1),
edit(v2), repeat, undo(v3), repeat, save, close/disk, reopen(v4).
Six verifier attempts completed; first Worker cold, later five reused. Each
recorded a createProgram call: getProgram3343ms first,1013–1109ms later, with
createProgram nested. Reused SDK Worker/syntax is not a retained incremental
project Program or a result-cache hit. Parser/binder CPU and project source
reparse counts were not independently sampled here. Remaining prefix/final
proof costs also matter; do not attribute the4.6–4.8s total solely to Program.

Overlay RSS sample peaks Node2212.99MiB, Native98.22MiB, tree2306.83MiB.
No semantic recovery/retirement is inferred from normal shutdown. This short
session cannot demonstrate long-term memory stability or real UI behavior.
Whole30288-file/link postflight149 and selectedSDK metadata match the original
input across all four Photos sessions; process closure and SQLite integrity pass.

## Remaining limits

- Initialization~84s, first local references~8s and cached~1s remain materially
  slow; this is not a claim that the experience target is achieved.
- Full namespace validation, derived maps and configuration/input proof work
  remain; no claim of total-file-count independence. Prior paired79/89 showed
  first-query wins plus small hot-query/init regressions; all kept.
- SDK partial is truthful; complete30K global references/rename and full Native
  qualification are not solved/accepted by finite local coverage.
- Real Windows/Zed UI and formal mixed single-session endurance are not this
  protocol slice. Prior failures and aborted runs remain preserved.

## Reproducible evidence

All paths below are under `.bench/hot-query-20261122`:
`final-source-freeze134.json`, `final-runtime-identity134.json`,
`focused135.log`, `actual-checkfast136.log`, `final-gates134.json`,
`product-identity145.json`, `sdk-test-fixture-rebuild145.log`,
`photos-lexical-controller126.{mjs,json}`, `photos-lexical-default97.mjs`,
`photos-w7-summary140.json`, per-round requests/wire/logs/resources,
`final-scale-controller146.mjs`, `photos-overlay-controller147.mjs`.
Historical119 preserves superseded W6;144 preserves W7 delta/runtime.
Completed archive `candidate148-frozen-source.tar.gz` includes1068 frozen
JS/TS/test/tool inputs plus actual runtime and Native (not full Rust source,
SDK or Photos). SHA256 `da85930ad81eb7cbb81d2d75e51c59ff171ceee6be6858b5ce1b51843e1255fa`.
Task-only patch `task-only-source-diff148.patch`, SHA256
`2a4d498c7a425b38c588d71cf2e4a46759acbbbc8891a6f36a3d625e915190ca`,24 source/test/tool files, maximum472lines;
`git apply --check` against inherited Q4 passes. It is not a clean-main patch.
The canonical source manifest and product identity remain134/145; archive
includes the preserved strict all-dist failure and explicit fixture adjudication.
Original failures, superseded runs and driver errors remain separate evidence.
