# Awake-host regression recovery and fixed Settings replay

Status: **original timeout focus 9/9 PASS; complete fast gate 1093/1093 PASS**.
Fixed Settings mode C is **11 × 267 exact/valid**, normal diagnostics/exit0;
first/edit59.478/60.195s and hot25–46ms leave cold500ms open.
The unchanged original tests run under their original request deadlines.
This is an environment/replay checkpoint, not a production fix, speedup,
exclusive root-cause proof or constructor admission graduation.

Parent revision `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. Inherited changes are preserved.
This segment changes no production source, test, build configuration, memory
budget, semantic scope, default strategy, verifier lifecycle or diagnostics.
It neither commits, pushes nor merges. Generated runtime build outputs are
verified against the existing pins before the real-project replay.

## Recovery conditions and fixed inputs

The [preceding whitespace control](2026-09-29-verifier-whitespace-control.md)
retains baseline 2 PASS/1 FAIL and compact verifier 1 PASS/2 FAIL, including
one failure overlapping 1,803 seconds of macOS Idle Sleep. The baseline
artifact was restored; compact formatting remains disabled. Those failures
remain evidence and are not overwritten or reclassified as PASS.

This run uses `/usr/bin/caffeinate -i <utility>` to request an idle-system-sleep
assertion only while the utility runs. It changes no persistent power setting,
display policy or other application. It is not a constant thermal/CPU guarantee
and does not claim to exclude every kind of system sleep.

Read-only `pmset -g therm` preflight snapshots at 08:17:58 and 08:21:00 +0800
report CPU speed limit100%, scheduler limit100% and12 available CPUs.
The in-run assertion snapshot identifies this full-gate wrapper as PID29042,
on behalf of pnpm PID29040. A separate pre-existing caffeinate PID27663 also
has assertions; it is not controlled or stopped by this work. Do not attribute
the recovered result to this wrapper alone or claim an otherwise isolated host.

Actual tools are Node **v26.3.0, Darwin x64**, executable
`/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node`, and `/usr/local/bin/pnpm`
**8.3.1**, not the manifest's8.15.9. No dependency installation or toolchain
upgrade is performed. `NODE_OPTIONS`, `NODE_COMPILE_CACHE`,
`ARKTS_INDEX_SIDECAR_PATH` and `ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS` are absent
in the outer environment. Focus runs add no explicit compile-cache control,
preloader, RSS sampler or forced GC. Automatic diagnostics remain enabled.

The outer `ARKLINE_HARMONY_SDK_PATH` is the deliberate missing-SDK test control,
not the real Settings SDK. The original fixtures select their own SDK paths.
The later Settings replay must instead pass its pinned actual SDK explicitly.

| Retained input | SHA256 |
| --- | --- |
| `dist/server.cjs` | `ebac64e22a90a8ab0d1171f9b50c9a11272fc705569058dce64abc16515aac36` |
| `dist/semantic-worker.cjs` | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| `dist/reference-verifier-worker.cjs` | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| `target/release/arkts-index-sidecar` | `f8b9e0c7d0632fe87a6edd4858bc2e23b0a2a20d3f21db965e51a1ee87122070` |
| `tests/semantic/references-batching.test.mjs` | `110ce7e43c3bf0ca2a630f0a32dfdc635ace1cd751a240a259718f780860edcd` |
| `pnpm-lock.yaml` | `ece84ab0afea7a411c453aac7371f0e47381455c5e3cc03f639adff9d2bf1131` |

## Original three-case independent rechecks

All cases launch a real server child and use Content-Length framed stdio through
the existing `LspSession`. Three serial, independent Node test commands select
the same three original names and preserve the original 5s definition and30s
cancellation-recovery request deadlines:

```sh
set -o pipefail
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
  /usr/bin/caffeinate -i /Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  --test --test-concurrency=1 \
  --test-name-pattern='^(a watched create in a nested workspace invalidates a warm outer-root definition|a lockfile change refreshes a retargeted installation while retaining the unsaved consumer|cancelling batched references stops the active verifier without poisoning recovery)$' \
  tests/lsp-workspace-file-changes.test.mjs \
  tests/semantic/local-package-resolution.test.mjs \
  tests/semantic/references-batching.test.mjs \
  2>&1 | tee .bench/regression-awake-2026-09-29/original-three-recheck-new.log
```

Use a fresh output filename; do not overwrite the retained rounds1–3.
Each completed round has3 PASS/0 FAIL and zero cancelled/skipped/todo.
The times below are **whole test-case durations**, not individual RPC latency:

| Round | Nested watched create | Package-lock retarget | Cancel and complete recovery | Entire Node test run |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1608.409ms | 1520.347ms | 9773.173ms | 13296.421ms |
| 2 | 1574.673ms | 1767.613ms | 10245.765ms | 13957.766ms |
| 3 | 1522.176ms | 1609.046ms | 10418.129ms | 13884.162ms |

The definition cases retain their warm/fresh-process URI/range comparison and
unsaved-source assertions. The cancellation case preserves cancellation error
-32800,43 recovery results and21 complete recovery batches. It is not a new
independent normalized Location oracle or a real-project memory benchmark.

## What the cancellation evidence supports

Read-only analysis of retained baseline logs compares a passing round1,
passing round4 and failing round5 from the preceding experiment:

| Baseline round | Initial pre-cancel batch wall | Recovery miss to queue | Median completed recovery batch | Maximum between-batch wait |
| --- | ---: | ---: | ---: | ---: |
| 1 PASS | 428.53ms | 20ms | 404.26ms | 0.15ms |
| 4 PASS | 428.78ms | 22ms | 387.55ms | 0.18ms |
| 5 FAIL | 2136.17ms | 24ms | 1992.81ms | 0.66ms |

The slowdown is already visible **before cancellation**. The failing recovery
enters the queue after24ms, then completes15 of21 batches before the unchanged
deadline. Its completed startup/Program/query wall fields have medians
1052.413/795.917/107.875ms; overlapping fields must not be summed as disjoint CPU.

Source inspection finds no demonstrated missing terminate/queue fence: the
client may receive cancellation before the old terminal response, but the
supervisor retains the detached fence until that terminal; the new request has
its own cancellation cell. A batch awaits `Worker.terminate()` in `finally`.
Cancelled/partial results are not written to the complete-result cache.
These facts and the9/9 recovery focus do **not** justify a speculative lifecycle
fix, nor prove host conditions were the sole cause of every old timeout.

## Complete regression gate

The complete gate follows the focus checks, with no concurrent benchmark or
other test/build started by this work:

```sh
set -o pipefail
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
  /usr/bin/caffeinate -i pnpm check:fast 2>&1 \
  | tee .bench/regression-awake-2026-09-29/check-fast.log
```

This complete command finishes **exit0**, with typecheck/build GREEN and
**1093/1093 PASS,0 FAIL,0 cancelled,0 skipped,0 todo**. Node test duration is
**808475.081881ms** (13m28.475s), not a single RPC or the complete pnpm wall time.
It includes the unchanged constructor characterization (whole case102697.850498ms)
and original cancellation/recovery case (whole case9796.019790ms).
The prior **1090/1093 PASS,3 FAIL,exit1** remains historical failure evidence;
this fresh complete gate supersedes it for current regression status.

Pre/mid/post snapshots record CPU speed100% at08:21:00/08:32:27/08:35:27,
not continuous thermal control. The owned wrapper PID29042 is absent after
completion; no unrelated assertion or user process is terminated. Runtime
and original cancellation-test hashes match the frozen pins after rebuilding.
The fixed Settings replay starts only after the complete gate finishes.

## Raw focused evidence

Root: [`.bench/regression-awake-2026-09-29`](../../.bench/regression-awake-2026-09-29/).

| File | SHA256 |
| --- | --- |
| [original-three-recheck-1.log](../../.bench/regression-awake-2026-09-29/original-three-recheck-1.log) | `c888d8073b2a6ba761f49b399cc034bc3aefad56f5a683b77037686317df4255` |
| [original-three-recheck-2.log](../../.bench/regression-awake-2026-09-29/original-three-recheck-2.log) | `5fd125c56e2c623c372461dbd1289f89f902bad9b534f2e3a8619506332e2275` |
| [original-three-recheck-3.log](../../.bench/regression-awake-2026-09-29/original-three-recheck-3.log) | `4498329c68a487302516387f3ded77e2442edae813131b416fe82fb5ad60f938` |
| [first-preflight-thermal.log](../../.bench/regression-awake-2026-09-29/first-preflight-thermal.log) | `bda08b6579ce1498a2a24385a898d2c6d5afac9ec5211e09de10e894b1f26872` |
| [whole-fast-preflight-thermal.log](../../.bench/regression-awake-2026-09-29/whole-fast-preflight-thermal.log) | `9e496a479e8cfe14d42e5a28de028fec8a3473e40c07b2c6e5008495a983694a` |
| [whole-fast-idle-assertion.log](../../.bench/regression-awake-2026-09-29/whole-fast-idle-assertion.log) | `1480f30b4e98bbdb7bed21857f7c1cfcae7d64cb891865684c29ec8364e6fe49` |
| [whole-fast-midflight-thermal.log](../../.bench/regression-awake-2026-09-29/whole-fast-midflight-thermal.log) | `df0d8a7f7d84fd45fa20680cc3f2c35de450883367aceee6ca7acdfe19a7285d` |
| [check-fast.log](../../.bench/regression-awake-2026-09-29/check-fast.log) | `052a30ab078fd9fe57b4ec5aa332743d43c328281847530613bb00bc3e1ca398` |
| [whole-fast-postflight-thermal.log](../../.bench/regression-awake-2026-09-29/whole-fast-postflight-thermal.log) | `a7b565e8dc3176511eec5470a86fa8649cb2e00158e7110f9929c2ede0697a97` |

## Fixed real Settings mode-C replay

The subsequent replay is **PASS,exit0** using the existing real-child LSP
runner, not a synthetic size fixture or a replacement protocol engine.
Clean Settings revision `ecc550dfaed880e04e38a2477eb7235cd50475b9` remains at
`.bench/real-projects/settings-ecc550`; no project source, module boundary,
dependency or target is edited. SDK is explicitly
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API24,
component6.1.1.125, declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Declared compile23/target20/compatible20 remains the approved compatibility
track, not matched-API23/dialect equivalence.

Target: `common/src/main/ets/core/controller/MenuController.ets`, symbol
`MenuController`, zero-based UTF-16 **(90,17)**, includeDeclaration=false.
The pinned constructor oracle has267 tuples and SHA256
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
The [existing manifest](../../bench/references/manifests/settings-menucontroller-identity-sql-reuse-api24.json)
has SHA256 `90c3d25b129f5510273b05dd2e49348421dab18b12d1b0fd467b085351a6b74d`;
all runtime/native/adjacent-standard-library pins pass preflight and postflight.
Adjacent standard-library digest remains
`ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d`.

Fresh process/private index; strategy indexed-batched/full SDK/closure,
roots64, retention=dispose, budget1024MiB; anchor reuse0/local-export seed1/
conservative units1 remain explicit experimental controls, not default promotion.
Compile cache is explicitly disabled for this replay, unlike the focus checks.
Catalog, SQL, live-stage and insertion-progress observations are on; normal
automatic diagnostics stay enabled. Requested RSS interval50ms, idle1000ms,
request/catalog/diagnostic deadlines180000ms are unchanged from the preceding
fixed mode-C replay. No forced GC or heap snapshot is used.

| Observation | Result |
| --- | --- |
| Catalog | ready/complete;1846/1846 files,1 skipped entry |
| initialize response to catalog completion | 8076ms |
| Committed SQL insertion | 7094.088ms; generation1,1846 documents |
| First references, version1 | 59478ms;267 exact/valid tuples |
| References2–10, version1 | 31,35,46,33,36,34,29,25,26ms; all267 exact |
| Unsaved appended-comment retry, version2 | 60195ms;267 exact/valid tuples |
| Normal diagnostics | version2; code2307, unresolved `@ohos.systemparameter` |
| Final response to diagnostic arrival | 2168ms |
| Server shutdown | result=null; exit0,signal=null |

All11 arrays contain267 unique URI/range tuples and equal the fixed oracle,
with zero missing/extra locations and identical repeated results. Independent
source-range audit reads127 files: all267 ranges select valid identifiers and
split no UTF-16 surrogate pairs. The94 retained transcript entries have0 drops;
actual traffic has11 `textDocument/references` requests, no `workspace/symbol`
or `textDocument/documentSymbol`. Diagnostics are preserved, not zero or a
new diagnostic oracle certification.

Trace records2 misses,9 hits and2 stores. Each miss has one rejected constructor
seed (`compiler-anchor-mismatch`) followed by complete-scope fallback and14
completed batches (indexes0–13, sessions2/4). The30 batch starts include two
rejected seed attempts; accepted batch-complete count is28. Both misses search
1496 membership/candidates across32 semantic units. Largest completed Program
is1348 project/2110 total SourceFiles,649 SDK and113 other files; it does not
meet the full-original-membership coverage rule. No constructor candidate
exclusion is newly admitted.

The nine cache hits produce no new verifier batch/Program observation in their
request windows. Edit invalidation gives the second miss with cacheEntries0;
only its newly complete answer is stored. Whole-run `sdk.selected` count is2,
not11: this run does not support "every request reselects SDK". Catalog ready
and complete-scope fallback are observed directly; the fallback is due to
compiler constructor/class-anchor mismatch, not missing index construction.
This Mac run does not establish or repair native Windows drive-case behavior.

SQL occurrence/identity/alias/binding counts remain637203/175120/3662/20516;
times2600.459/1256.766/50.756/257.196ms, index recreation500.157ms,
commit1930.105ms. These observer wall fields are not disjoint pure CPU or a
randomized allocation-to-latency comparison. Both runtime/native binaries are
unchanged from the previous final build; observed differences are not a code win.

### External memory and cleanup

1003 independent process-tree samples have1002 actual gaps:
min/median/nearest-rank P95/max **113/129/143/269ms**, despite nominal50ms.
The sampled product peak is **1067745280 bytes** (1018.28125MiB), at
`2026-09-29T00:37:43.093Z`: Node PID33736 **1022230528 bytes** plus native
PID33740 **45514752 bytes in that same sample**. Do not add separate maxima.
Worker threads are already counted inside Node once; sampler PID33737 and
the separately recorded harness RSS are excluded from product RSS.
This sampled peak is a lower bound, not PSS or a guaranteed absolute peak.

Mid/post read-only CPU snapshots at08:38:18/08:39:27 +0800 are100%, not continuous
thermal/scheduling control. Server, native sidecar and sampler are absent after completion;
the owned runner cleans its private temporary state. Clean Settings status
and unchanged runtime/test/build pins are rechecked. Other user processes
and assertions are untouched.

### Reproduction command and retained real evidence

From repository root, choose a **new unused stem** rather than overwrite the
recorded output. This equivalent command uses the same SDK/symbol/flags/deadlines:

```sh
replay_stem=/Users/liuhui/Documents/code/arkts-language-server/.bench/regression-awake-2026-09-29/settings-C-new
env NODE_DISABLE_COMPILE_CACHE=1 \
  ARKTS_REFERENCES_ANCHOR_REUSE=0 ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
  ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
  ARKTS_REFERENCES_CONTEXT_RETENTION=dispose ARKTS_MEMORY_BUDGET_MB=1024 \
  ARKTS_INDEX_CATALOG_TRACE=1 \
  ARKTS_INDEX_CATALOG_SQL_TRACE_FILE="${replay_stem}.sql.ndjson" \
  ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE="${replay_stem}.stages.ndjson" \
  ARKTS_INDEX_REFERENCE_INSERT_TRACE_FILE="${replay_stem}.progress.ndjson" \
  /usr/bin/caffeinate -i /Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  scripts/bench/replay-references.mjs \
  --workspace /Users/liuhui/Documents/code/arkts-language-server/.bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-identity-sql-reuse-api24.json \
  --sidecar /Users/liuhui/Documents/code/arkts-language-server/target/release/arkts-index-sidecar \
  --out "${replay_stem}.json" --mode C --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --sample-interval-ms 50 --timeout-ms 180000 --diagnostic-timeout-ms 180000 \
  --idle-ms 1000 --trace
```

The archived JSON contains the complete effective ARKTS environment, actual
launch parameters, request transcript, normalized results, timeline, trace and
raw external RSS samples. The shell command does not itself save the separate
pmset snapshots. It replays the workload, not a guarantee of a passing result.

| Real evidence file | SHA256 |
| --- | --- |
| [settings-C-1.json](../../.bench/regression-awake-2026-09-29/settings-C-1.json) | `1967e8160e8ee0a5295f6bb09abb6405dad6f5dea7de0cb4f56c5b40409570be` |
| [settings-C-1.sql.ndjson](../../.bench/regression-awake-2026-09-29/settings-C-1.sql.ndjson) | `78e9de989ab76a9e4d879548f309b81d0ff2740fefb310239f4337fd47d9a4c7` |
| [settings-C-1.progress.ndjson](../../.bench/regression-awake-2026-09-29/settings-C-1.progress.ndjson) | `fc794cecf6a9d248f7dc3618da339532422ec5e2a9fb8d98fcf8d65becba8a03` |
| [settings-C-1.stages.ndjson](../../.bench/regression-awake-2026-09-29/settings-C-1.stages.ndjson) | `abab4a27cfa44014659ff856092e4369647336e5c5ab7dd7d2cdab61ba01b49c` |
| [settings-C-1-midflight-thermal.log](../../.bench/regression-awake-2026-09-29/settings-C-1-midflight-thermal.log) | `1b57ddf28c7b766ff5f1938d0467408269e1ba108a84d4daf70567aab6862c6c` |
| [settings-C-1-postflight-thermal.log](../../.bench/regression-awake-2026-09-29/settings-C-1-postflight-thermal.log) | `43f073acda43be1eb5803524e032314d5393112cd389aa17e201e8ac96f67ce0` |

This new terminal whole-fast GREEN closes the immediate regression-recovery
checkpoint, not all product gates. Constructor completeness/admission,
cold/edit500ms, original>3GB
reproduction, final50% memory/PSS, DevEco and native Windows remain independent
open gates. No production default or lifecycle promotion follows from focus9/9.
