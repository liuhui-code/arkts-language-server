# Settings catalog live-stage observation

Status: **observer implemented/GREEN; real Settings mode-C FAIL/exit1** at the
unchanged180 s catalog-ready gate, before didOpen or references. This is not
a successful empty reference query, SDK mismatch, OOM or restored whole-fast.

This is a diagnosis slice, not a compiler working-set optimization or default
promotion. [The prior native sample](2026-09-28-settings-catalog-activation-native-profile.md)
located reference-index insertion/cache-spill during one activation window,
but the success-only SQL observer gave no input census for the failed run.
The new default-off observer closes that evidence gap without changing SQL.

## Fixed input and artifacts

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; all inherited edits preserved. No commit,
push or merge. No SDK, semantic loading, scope, cache budget, Worker lifetime,
durability, SQLite schema/index layout, diagnostics or deadline changes.

Settings is clean at `ecc550dfaed880e04e38a2477eb7235cd50475b9`, in
`/private/tmp/arkts-settings-row-counts.BPJdST/project`. SDK:
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API24,
6.1.1.125, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is the approved API24 compatibility track, not API23 equivalence.
The MenuController constructor remains zero-based UTF-16 **90:17**, declaration
off, with the unchanged 267-tuple compiler oracle, SHA
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.

Node v26.3.0, indexed-batched/closure/full SDK, roots64, anchor reuse0,
local-export seed1/conservative units1, retention `dispose`, 1,024 MiB budget,
compile cache disabled. Existing mode-C replay uses independent nominal50 ms
Node/process-tree RSS, fresh private index/cache, normal diagnostics and the
original180,000 ms ready/request/diagnostic deadlines; idle1,000 ms.
The trace-on invocation is not a matched trace-off performance A/B.

| Runtime artifact | SHA256 |
| --- | --- |
| `dist/server.cjs`, unchanged | `ebac64e22a90a8ab0d1171f9b50c9a11272fc705569058dce64abc16515aac36` |
| `dist/semantic-worker.cjs`, unchanged | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| `dist/reference-verifier-worker.cjs`, unchanged | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| Previous native, archived before build | `def311dfe2269ecb0b147d9451ae60b09ee1a55f8228b428f57b26923dba05e2` |
| New default-feature native | `9cb58aecc2759a92c43333f926deadbbf7fa015bd621d808ce59b62835d75530` |
| [New observed manifest](../../bench/references/manifests/settings-menucontroller-catalog-live-stage-api24.json) | `7198c4d9d0f6e3a11e3a5ddd0f42ad103d89fbac0b0dd0ea6218de265d7f0299` |

The previous manifest remains untouched, SHA
`169d12a76df09f2c1b3a995024a53783a331179d1c688f1089d031676313d48b`.
The original native copy is the ignored artifact
`.bench/anchor-reuse-2026-09-28/arkts-index-sidecar-before-live-stage`.
Adjacent standard-library hash remains
`ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d`.

## Observer and verification

`ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE=<fresh path>` adds eight flushed, numeric
NDJSON boundaries. Env off/unwritable returns before input census/file writes.
No output goes to protocol streams. Input lengths are attempted batch rows,
not committed/affected rows. No dedup census, reparse, SQL COUNT, DB-stat or
native stack sampler runs in this replay. Existing phase and after-commit SQL
observers are also enabled. A failed/in-progress operation cannot emit a
successful end/commit boundary. Observer errors never change the store result.

[TDD record](../tdd/references-catalog-live-stage-trace.md): the actual RED is
missing opt-in output through public activation/query/reopen. Minimal GREEN
and error characterizations cover successful replacement, default-off,
unwritable file, stale generation, duplicate-document rollback and early output
while the public transaction is pending on a separate test-owned writer.
Fixed field/type validation excludes extra/duplicate keys and URI/source data.
The duplicate-document error is before reference insertion, not a late-commit
failure injection. Changed handwritten modules are 76/243/345 lines.

Final Rust workspace: **177 PASS/0 FAIL/1 existing ignored**, exit0. Default
release build passes in28.66 s. The ignored455-file fixture and last failed
whole-fast are not certified by this focused native validation.

## Current input census

The live trace reaches `replace.start` and `references.start` with:

| Captured input | Current observer | Historical committed trace |
| --- | ---: | ---: |
| Catalog documents | 1846 | 1846 |
| Occurrences | 637203 | 637203 |
| Aliases | 3662 | 3662 |
| Bindings | 20516 | 20516 |

Historical source:
[row-volume report](2026-09-26-settings-reference-row-volumes.md), an older
native artifact. These four matching counts rule out an increase in these
captured row volumes for this fixed project. They do not prove identical row
contents/identity cardinality, WAL bytes, allocated pages, CPU work or timing.
Distinct identity rows are intentionally not counted ahead of insertion.
The 1846 catalog inputs are **not** the semantic ProjectGraph membership or
compiler Program coverage. `references.start` here means **index insertion**,
not a sent `textDocument/references` request.

## Terminal result and phase boundaries

| Observation | Actual result |
| --- | ---: |
| Node / Rust PID | 21836 / 21841 |
| discovering → activating callback interval | 4,084.172210 ms |
| Native input generation / last reported committed generation | 1 / 0 |
| `replace.start` epoch | 1790595571756 ms |
| `references.start` epoch | 1790595580547 ms |
| First → second native marker, monotonic difference | 8,791.912493 ms |
| initialize response → replay failure | 180,731 ms |
| `references.start` → replay failure, wall-clock correlation | 149,417 ms |
| Retained native records | 2; no reference/index/commit end |
| After-commit SQL record / ready terminal | Neither observed |
| Reference responses / diagnostics | 0 / null; not reached |
| Server shutdown / exit | null / exit0, no signal |

The incomplete native trace identifies **reference-index insertion as the last
entered stage**. There is no recorded entry to index recreation or commit;
neither is established as this run's bottleneck. Missing ends alone cannot
prove an exact SQL duration, deadlock, specific occurrence/identity statement,
or exclude a later observer IO error. The success-only SQL trace has no file.
No successful catalog generation is accepted, and no partial references are
returned. The stage observer's `replace.complete` would still not be the
sidecar/LSP-ready event.

The runner throws at its ready gate before diagnostic subscription, didOpen,
or the mode-C loop. Thus the expected267 tuples, repeated cache hits, unsaved
comment invalidation and normal diagnostic output are **not evaluated**.
The raw request transcript retains128/676 entries, dropping548; its only
retained sent methods are shutdown/exit. Use the failure/control flow and
timeline, not that bounded transcript alone, to establish the pre-open stop.
The printed `REQUEST=textDocument/references` label is intended workload, not
evidence of a transmitted query.

## Memory and host limits

Observed sampled peaks: Node15,241,216 B; Rust57,630,720 B; product tree
**67,923,968 B**. The independent sampler's63,262,720 B, harness timeline
max10,399,744 B and host-wrapper snapshot max7,544,832 B are excluded.
Separate PID maxima are not summed. Worker threads remain counted once.
269 samples requested50 ms but actual gaps are median448 / P95 2455 /
max4718 ms; short peaks may be missed. These are pre-reference RSS readings,
not a reference memory improvement, full peak or product PSS gate.

Before/after read-only snapshots show CPU speed limits46→64%, swap used
9,048→9,169.25 MiB and wired pages3,645,660→3,653,944 (4,096 B pages)
on16 GiB. Host pressure and observer IO remain confounders, not a sole-cause
proof. There is no native sampler/DB-stat overhead or test/build running
concurrently with this replay. No applications are closed or forced GC run.
The current input lengths match history, so do not blame an increased captured
occurrence/alias/binding volume; unchanged cardinality also does not certify
equal row contents, storage work or a fair timing comparison.

Independent storage audit found a separate layout inconsistency: fresh schema/
migration makes the name index cover `qualifier`, while catalog recreation
currently omits that fourth column. It may affect later query coverage, but
this index is dropped **before** insertion, so it does not explain this pending
insertion stage. No index correction is bundled into this observer. It needs
its own stable public query-plan regression rather than private handcrafted
schema tests. Raw occurrences and both differently ordered identity indexes
have existing consumers/contracts and cannot be deleted as free redundancy.

## Retained invocation

The 74-line ignored wrapper delegates the existing replay/LspSession/sampler.
It records explicit flags and two read-only host snapshots, guards all output
paths, and neither opens SQLite nor changes the test's TMPDIR. Invocation:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  .bench/anchor-reuse-2026-09-28/menu-catalog-live-stage-observer.mjs
```

For a new run, use a new unused stem in the wrapper. Do not overwrite original
evidence. Its JSON stores the full underlying copyable replay arguments.
The terminal report remains FAIL. Original30 s constructor and whole-fast recovery still
precede production admission/narrowing; no partial generation is trusted.
Continue at reference-index activation/storage and a matched lower-pressure
recovery run; do not increase deadlines, bypass readiness, remove rows or
change durability to obtain a passing label. No500 ms, original>3 GB/final50%,
DevEco/PSS or Windows graduation follows from this diagnosis.

Postflight confirms all runtime/manifest/oracle pins and clean Settings checkout
are preserved; formatting/diff checks pass. All three owned PIDs are absent
after shutdown. Raw hashes and local evidence links are validated. No unrelated
source or user process is changed, and no fresh whole-fast is claimed.

## Retained evidence

All artifacts below are under `.bench/anchor-reuse-2026-09-28/`; relative links
resolve to the local raw logs/curve. New outputs must use unused paths.

| Artifact | SHA256 |
| --- | --- |
| [Actual RED](../../.bench/anchor-reuse-2026-09-28/catalog-stage-trace-red.log) | `a5195175545c9f926ba49b571f6ab8064f394e542cf7be5f06db92799ea63cf4` |
| [Minimal GREEN](../../.bench/anchor-reuse-2026-09-28/catalog-stage-trace-green.log) | `3a84d80c962bcfc57fa5d1bc1c1ac9225c394e5362b3bde79404beef44d93c19` |
| [Initial characterization](../../.bench/anchor-reuse-2026-09-28/catalog-stage-trace-characterization.log) | `ea106a92702c1553b1368e26acf162c674fc78f92be99d56cd9e71af89ae26fd` |
| [Live-writer characterization](../../.bench/anchor-reuse-2026-09-28/catalog-stage-live-characterization.log) | `2ed51782b1ec8f95d92362d91d7a134cfc8480ba8b8f20475e3341afaea14085` |
| [Final Rust workspace](../../.bench/anchor-reuse-2026-09-28/catalog-stage-final-rust-workspace.log) | `55dd79a12a79070ff40b840bf6ff83848e33ab6254e192b81e6e02b43d63383b` |
| [Default release](../../.bench/anchor-reuse-2026-09-28/catalog-stage-release.log) | `4554bbaaa733b5c091bae4ce7502a25562b1404b3ebd01a8a89e04dbc8ae697b` |
| [Replay/raw RSS/timeline](../../.bench/anchor-reuse-2026-09-28/menu-catalog-live-stage-C-1.json) | `7f26cefffbfab1c95648797b001bbe3ca465514bbc39a38f08fb9d21b993baed` |
| [Invocation](../../.bench/anchor-reuse-2026-09-28/menu-catalog-live-stage-C-1.invocation.json) | `5dddbbf7fbf6a64d254d951914c222ed69d1f25015a13ff646477712d85c8f25` |
| [Replay output](../../.bench/anchor-reuse-2026-09-28/menu-catalog-live-stage-C-1.log) | `8daf073a7b290e73e1ff43a626de8e92288282029a75adb1e71f304d80a2fd95` |
| [Native live stages](../../.bench/anchor-reuse-2026-09-28/menu-catalog-live-stage-C-1.stages.ndjson) | `56de3881a2c6bc1cf0e0215c91c2895256dbb70843a535f41b50b2b7ad24570d` |
| [Host snapshots](../../.bench/anchor-reuse-2026-09-28/menu-catalog-live-stage-C-1.host.ndjson) | `8887c5eb2163c7d74e02ceaceab703d109606991324a557aabcdf1912fae0240` |
| [74-line wrapper](../../.bench/anchor-reuse-2026-09-28/menu-catalog-live-stage-observer.mjs) | `981fc2396181a33bea7e5e3530ddf5fbeb7e82fee999c4003f2ebf179b8e15bd` |
