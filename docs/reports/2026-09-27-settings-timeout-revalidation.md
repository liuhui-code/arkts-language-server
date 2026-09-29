# Unchanged-source timeout gate revalidation

The original focused regression now passes **43/43**, and the fixed
Settings/API24 replay returns **267 exact Locations** within the original
deadline, with unchanged source and runtime artifacts. References still take
**98.039 s**, far above 500 ms. The fresh whole-fast gate is **RED: 1,015/1,058
PASS, 43 failures**. This is revalidation of prior timeout gates, not an SDK or
performance fix.
This report follows the preserved
[SDK configuration ownership evidence](2026-09-27-settings-sdk-configuration-ownership.md).

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; existing edits remain preserved. This
revalidation introduces no source or test change. No reset, commit, push or merge.

## Chronology and unchanged inputs

The earlier combined focused run completed 43 tests: 15 PASS / 28 timeout or
waiter failures, 419,078.702 ms, exit1. The sequential post-extraction port run
then completed 6/9 PASS with three timeout failures, 111,263.091 ms, exit1.
The isolated SDK mutation and production framed-stdio transcripts passed,
but did not replace either failed regression gate. Their original logs and
the original Settings replay remain preserved in the preceding report.

The same runtime artifacts remain pinned by the
[manifest](../../bench/references/manifests/settings-menucontroller-sdk-configuration-ownership-api24.json):

| Asset | SHA256 |
| --- | --- |
| Server | `0b9deae87bbea11a53716cbd03493b9fa985b938c0c87a30be0c4668ded69d7a` |
| Semantic Worker | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| Reference verifier Worker | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| Sidecar | `f2c967a36ff3918a12357928c497aa006cc31e80a0f515d17b458cf3c832850d` |

No timeout, assertion, production default, SDK-selection policy, diagnostic
capability, schema, Worker lifetime/count or memory budget was changed. Each
CPU-heavy gate runs alone, without concurrent tests or builds. Improved host
health is an associated observation, not proof of a sole cause of the failures.

## Original 43-case focused recheck

The original focus used the same fixture environment:
`ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927`;
that path was verified absent. Existing original deadlines remained in force.

The completed recheck is **43/43 PASS**, zero failures/cancellations/skips/todos,
exit0, total **58,047.284643 ms**.
[Raw focused recheck](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-focused-recheck.log).
It closes this 43-case focused gate for the unchanged runtime; it is not a new
whole-fast pass or evidence that an SDK or performance defect was fixed here.

Read-only health before the recheck: load 7.10/9.99/21.65, used swap 5,327 MiB.
After: load 4.09/8.03/19.40, used swap 5,095 MiB of 6,144 MiB. Keep the earlier
28 failures and associated high-load observations; a successful rerun cannot
retroactively turn the original failure into success or establish causality.

## Fixed Settings/API24 replay

The original replay exhausted the **180,000 ms references RPC deadline**,
runner exit1, with no complete response or exact 267 comparison. Catalog 1846/1846
was ready with 1 skipped; batches 0–2 finished before batch 3 and shutdown.
Normal diagnostic observation also timed out. Its
[raw failure](../../.bench/anchor-reuse-2026-09-27/menu-sdk-configuration-ownership-A-1.json)
and SHA256 `cff2f325de05d5828f13e9109565e23cc6fbd94d2456d5e19154b7aa305525f0`
remain historical evidence, not a zero-reference semantic result.

Read-only comparison with the preceding completed candidate-snapshot replay
shows broad elapsed-time dilation: catalog 7.67×, rejected-seed Program 7.89×,
batch 0 readiness 7.94× and query 7.50×, batch 1–2 readiness 9.08–9.55×.
The seed and completed batches 0–2 have identical Program/text/root topology and
raw counts 242/44/17; raw counts do not prove individual Locations unchanged.
Sampling gaps also widened (mean 121.54→732.52 ms). These observations support
a broad dilation hypothesis. The earlier server hash differs (`b752…` versus
current `0b9…`), so this comparison is not a matched old-server causal control;
unchanged Worker/verifier/standard-library/sidecar hashes do not remove that
confounder. Neither host load nor the SDK clone is established as the sole cause.

The unchanged-build independent rerun completed **PASS, exit0**. The client
received a complete references response with **267 expected / 267 observed
exact Locations**, validation.pass=true, errors=[], and no RPC error. The
original 180 s deadline remained in force. Server request.completed reports
ok at 97,861.38 ms; harness request start→response is **98,039 ms**.
The former failure is retained alongside this fresh result.

| Observation | Actual completed rerun |
| --- | --- |
| Catalog | Ready 1846/1846, skipped 1; initialize→catalog 8,657 ms |
| Search | Seed rejected: compiler-anchor-mismatch; 1496 files / 32 units / 14 conservative batches completed |
| Result merge | 768 raw Locations→267 unique exact Locations |
| Seed Program | 801 SourceFiles: 322 project / 427 SDK / 52 other |
| Batch 0 Program | 2049 SourceFiles: 1348 project / 649 SDK / 52 other |
| Normal diagnostic | Version 1, code 2307 for `@ohos.systemparameter`, observed 5,139 ms after references response |
| Target Node maximum sampled RSS | 803,155,968 bytes |
| Server process-tree maximum sampled RSS | 806,420,480 bytes |
| Sampler / harness maximum RSS | 117,010,432 / 73,396,224 bytes, separate |
| External sampling | 576 samples; requested 50 ms; actual gaps min 127 / median 194 / P95 268 / max 441 ms |
| Shutdown | Normal code0 |

Diagnostics remained enabled and were not suppressed. This one completed
exact replay closes its deadline/exactness check; 98 s remains unacceptable for
the 500 ms navigation target. A single completed run and sampled RSS do not
establish memory improvement or no regression. Worker-thread RSS is not summed
again; server-tree RSS is not product/Zed PSS or the original >3 GB reproduction.

[Raw completed rerun](../../.bench/anchor-reuse-2026-09-27/menu-sdk-configuration-ownership-A-recheck-1.json),
SHA256 `831aed8cfb9f57a2bdcecbda9b0e087abe603ae9e8d582c9ad751817fc472486`.

It uses Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`, clean project
`/private/tmp/arkts-settings-row-counts.BPJdST/project`; declared SDK23/20/20
and user-selected API24/6.1.1.125 remain unchanged. SDK declaration digest:
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Target MenuController constructor, zero-based UTF-16 **90:17**,
includeDeclaration=false; oracle 267 SHA256:
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
Node v26.3.0 on Darwin25.6.0 x64. This remains same-SDK compatibility evidence,
not API23/DevEco diagnostic equivalence or a Windows test.

For another independent replay, use an unused output path. The runner writes
exclusively (`wx`), so existing artifacts remain intact:

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
  --out .bench/anchor-reuse-2026-09-27/menu-sdk-configuration-ownership-A-recheck-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

## Fresh whole-fast gate: terminal RED

The fresh `pnpm check:fast` ran alone after the completed Settings replay with
the same verified-absent `ARKLINE_HARMONY_SDK_PATH` fixture environment. It
completed **1,058 tests: 1,015 PASS / 43 FAIL**, zero cancellations/skips/todos,
exit1, **3,676,362.477923 ms** (about 61.27 minutes). The rebuild preserves the
server, semantic Worker and verifier Worker hashes above. No source, test,
deadline, assertion or production-default change was made.

The 43 failures consist of 42 leaf failures and one failed parent test:

| Leaf failure category | Count |
| --- | ---: |
| LSP response deadline | 32 |
| `publishDiagnostics` waiter deadline | 8 |
| Cached parent/nested buffer bounded waiter | 1 |
| Initial catalog held-status wall-budget assertion | 1 |

The catalog test returned its exact five Locations before failing its unchanged
`elapsedMs < 2_500` assertion at **4,653.1 ms**; the configured initial catalog
wait is 250 ms and held status is 3,000 ms. See the
[public test](../../tests/semantic/references-initial-catalog.test.mjs).
Other failures include constructor alias/inheritance, batched cancellation and
recovery, and the 403-file references deadline. No URI/range equality failure is
reported, but unavailable responses cannot be treated as correct results. The
new SDK ownership/control cases pass; they do not certify this broader gate.

[Raw terminal whole-fast run](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-check-fast-recheck.log),
SHA256 `48322e62815f7d7878f77f10f47830628725a668002dc249f759e79546cdf01f`.
Read-only load during the run at 19:33 was 48.90/64.91/43.02. A restricted swap
probe was denied, so no swap value is inferred. These observations do not
establish a sole cause; focused 43/43 and one successful Settings replay cannot
replace the failed whole gate.

## Independent failing-boundary recheck: terminal RED

A bounded independent recheck kept source, artifacts and thresholds unchanged.
It completed **6 tests: 1 PASS / 5 FAIL**, zero cancellations/skips/todos,
exit1, **48,264.510043 ms**. Counts include the failed conformance parent and
its two failed child tests.

| Test | Result | Whole-test duration |
| --- | --- | ---: |
| Repository bundle | FAIL: LSP response id 1000 waiter | 6,443.810032 ms |
| Repository CLI from external working directory | FAIL: same response waiter | 6,380.249197 ms |
| Conformance parent | FAIL: both child cases failed | 12,849.946574 ms |
| Cached parent result invalidated by nested buffer edit | PASS | 16,118.556049 ms |
| Exact-range TS2552 diagnostic | FAIL: `publishDiagnostics` waiter | 6,188.522248 ms |
| Catalog held-status wall budget | FAIL: whole references RPC 6,309.0 ms >2,500 ms | 9,873.793205 ms |

The catalog case returned a successful complete response with its exact five
Locations before the latency assertion failed. The **250 ms** configuration
bounds the initial index-status wait, while `elapsedMs < 2_500` measures the
**entire references request**, including compiler work; the observed 6,309.0 ms
is not an isolated index-wait measurement. Test setup/teardown raises that
case's whole-test duration to 9,873.793205 ms. The bundle/CLI and diagnostic
waiters instead lack the required response/notification, so their semantic
results are unavailable. The restored nested-buffer transcript and successful
catalog Locations do not replace the failed latency assertions or whole gate.

[Raw bounded recheck](../../.bench/anchor-reuse-2026-09-27/configuration-sdk-owner-failure-minimum-recheck.log),
SHA256 `90dde4f38879fe2d466df56245832a810911207786fd404a7acee48097ac9dc2`.

## Gate boundaries

| Gate | Current evidence |
| --- | --- |
| Original 43-case focused regression | GREEN: 43/43, unchanged runtime/environment/deadlines |
| Fixed Settings exact constructor replay | PASS one same-build case: 267 exact within original 180 s; prior failure preserved |
| Fresh `pnpm check:fast` | RED: 1,015/1,058 PASS, 43 FAIL, exit1; no whole-gate graduation |
| Independent failing-boundary recheck | RED: 1/6 PASS, 5 FAIL including failed conformance parent; exit1 |
| Project configuration ownership | Open; separate public RED/GREEN required |
| Complete source admission / constructor narrowing | Open; no exclusion promotion |
| Cold/edit ≤500 ms / release memory / Windows | Not graduated |

The preceding controlled 1,056/1,056 PASS and default-host 997/1,056 with 59 failures
remain separate prior-source histories. This recheck does not certify the
default-host SDK integration gate. Whole test durations are not navigation
latency samples. One replay, incomplete work or coarse RSS sampling cannot
establish a memory no-regression comparison. The original >3 GB reproduction,
final release-memory gates and broader compatibility gates remain open.
