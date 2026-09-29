# Settings catalog insertion: bounded progress diagnosis

## Outcome and limits

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. Existing edits were preserved; no commit,
push or merge. This observation-only slice follows the
[coarse-stage report](2026-09-28-settings-catalog-live-stage-trace.md) and
[public RED/GREEN contract](../tdd/references-catalog-insert-progress.md).

**Implemented, default-off; real replay FAIL.** The unchanged 180s catalog
readiness gate expired before didOpen or a references request. This is not an
empty references result, timeout inside findReferences, OOM or a reproduced
5GB compiler peak. Normal diagnostics remained enabled but were not reached.
No SQL/layout/order/256-row batch/schema/durability, semantic scope/default,
Worker/memory budget, diagnostic capability or deadline changed.

New `ARKTS_INDEX_REFERENCE_INSERT_TRACE_FILE` emits best-effort numeric
checkpoints only for full catalog activation. It is absent from incremental
refresh. Default-off/unwritable introduces no new loop timing/census/IO.
No source contents, URI or SQL parameters are logged; stdout/stderr are untouched.
Observation IO may affect timing; this is not a matched trace-off performance A/B.

## Verification

All logs are under `.bench/anchor-reuse-2026-09-28/`.

| Command / artifact | Actual result |
| --- | --- |
| Focused opt-in test, `reference-progress-red.log` | exit101, missing progress file after successful public store child |
| Same test, `reference-progress-green.log` | exit0, 1 PASS |
| `cargo test -p arkts-index-sqlite --test reference_insert_progress -- --test-threads=1` | exit0, 4 PASS including child helper |
| `cargo test --workspace -- --test-threads=1` | exit0, 181 PASS, 0 FAIL, 1 existing ignored |
| `cargo build --release -p arkts-index-sidecar` | exit0, 2m25s, default features |

Public activation/query/reopen results match MemoryStore, including incremental
refresh without new progress. The 130-document fixture emits exactly 20 records
per generation and verifies executed identity rows separately from buffered
rows. A fixture-only trigger rejects a later binding insert after positive
progress; reopening still serves generation1. There is no insertion-complete
marker on failure. This tests rollback, not final COMMIT failure.

New progress flushes explicitly, but its public test reads after child exit;
independent live visibility was **not** experimentally established in this slice.
No fresh whole-fast was run; the retained whole-fast/constructor failures remain
open. Focused Rust GREEN does not close those gates or request merge.

## Fixed environment and replay

Settings checkout `/private/tmp/arkts-settings-row-counts.BPJdST/project`, clean
SHA `ecc550dfaed880e04e38a2477eb7235cd50475b9`. SDK
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API24,
6.1.1.125, declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
The project declares compile23/target-compatible20: this is the approved API24
compatibility track, not proof of API23 equivalence.

Query seed: `common/src/main/ets/core/controller/MenuController.ets`,
`MenuController`, zero-based UTF-16 `(90,17)`, includeDeclaration=false.
267-location oracle SHA
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
The oracle was not compared because no query response was obtained.

Final handoff revalidation could not reopen that temporary checkout: the path
no longer exists. The clean SHA above is the recorded run-time state, not a fresh
postflight cleanliness assertion. No checkout was deleted by this slice. Future
replay must restore the pinned real checkout/dependencies at a valid path and
use fresh outputs; the archived invocation remains the record of this run.

Node26.3.0, Darwin25.6.0 x64, 16GiB, 12 logical CPUs. Server command:
`dist/server.cjs --stdio`. Existing framed-LSP runner, fresh private index/log
cache, modeC, indexed-batched/fullSDK/closure/64roots, retention=dispose,
1024MiB budget, anchor reuse=0/local-export-anchor=1/conservative-units=1.
Catalog/request/diagnostic deadlines remain180000ms, nominal RSS interval50ms,
idle1000ms; old catalog/SQL/stage flags plus the new progress file enabled.
All effective arguments and environment are in the invocation artifact.

Executed command (guarded outputs; choose a new output stem for another run):

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  .bench/anchor-reuse-2026-09-28/menu-catalog-insert-progress-observer.mjs
```

Native-only observation manifest:
[settings-menucontroller-catalog-insert-progress-api24.json](../../bench/references/manifests/settings-menucontroller-catalog-insert-progress-api24.json).
Current native SHA
`1cd57b7a063354215d14599ee52ffa5b6a7ef7d3b2aeb14267b49124b653af2e`.
Previous native archived as `arkts-index-sidecar-before-insert-progress`, SHA
`9cb58aecc2759a92c43333f926deadbbf7fa015bd621d808ce59b62835d75530`.
Older manifests/artifacts were not overwritten.

Unchanged JS SHA pins:

| Asset | SHA256 |
| --- | --- |
| dist/server.cjs | ebac64e22a90a8ab0d1171f9b50c9a11272fc705569058dce64abc16515aac36 |
| dist/semantic-worker.cjs | 6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504 |
| dist/reference-verifier-worker.cjs | 8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee |

## Actual timeline and completed prefix

Initialize completed at epoch1790600232416; catalog-not-observed at
1790600412740: **180324ms**. Server callbacks reached activating with all1846
parsed inputs, buildingGeneration1/committedGeneration0. Parsed-file count is
not committed readiness or compiler SourceFile count.

Coarse `replace.start`→`references.start` elapsed **38667.125ms**. This includes
pre-reference transaction/catalog work, not a pure SQLite operation. Here
“references.start” names index insertion, **not textDocument/references**.
No references.end/index/commit/ready was observed.

New progress has89 records: start plus four subphases for22 selected documents
(1,64,...,1344). Final record at epoch1790600411297 is
`document.bindings.complete`, ordinal/completed1344 of1846, elapsed97099.118ms.
No identity-tail/insertion-complete record. Completed durations at that point:

| Completed subphase | Cumulative wall ms | Share of completed work |
| --- | ---: | ---: |
| Occurrences | 64302.095 | 66.32% |
| Identity dedup/value preparation/batch SQL | 21397.399 | 22.07% |
| Aliases | 978.777 | 1.01% |
| Bindings | 10275.479 | 10.60% |
| Total | 96953.749 | 100% |

Successful statement-return counters: occurrences473708, identities124928,
aliases2679, bindings14270; **191 identity rows remain buffered** and are not
included in executed identities. Inputs are637203 occurrences/3662 aliases/
20516 bindings. Completed-document prefix72.81%; occurrence prefix74.34%.

These are interleaved completed loops inside an **uncommitted transaction**,
not persisted counts, pure SQLite CPU or the unfinished operation's duration.
`documentsCompleted` means the bindings loop completed that input prefix, not
all identity rows flushed. The remaining502 documents and unsampled suffix are
unknown; do not linearly project a full run or name the current pending SQL.

The completed prefix supports occurrences as the largest cost, with identity
secondary, not aliases. It does not isolate identity sorting vs SQL. Continued
prefix advancement is not evidence of a commit deadlock; it also does not prove
what happened after the last checkpoint. Host/common IO pressure remains a
confounder, not an established exclusive root cause.

## Memory, host and process ownership

443 external samples: actual gap min226/median357/P95761/max2574ms despite
nominal50ms. Observed peaks are lower-bound samples, not guaranteed true peaks.
Node15,273,984 bytes; Rust69,201,920; simultaneous product-tree78,249,984.
Separate Node/Rust maxima were not added. Worker-thread RSS is not double-counted.
Sampler42,983,424 and harness13,058,048 bytes are separately excluded.
Raw memory curve is retained in JSON `memory.samples`.

Host CPU_Speed_Limit73→53; swap9569.25→9590.00MiB; wired pages
3665131→3675795 at4096 bytes/page on16GiB RAM. These observations prevent clean
latency/RSS attribution. Low compressed/pre-query RSS is not a references
memory improvement or PSS measurement. No app termination, forcedGC, heap
snapshot, cache drop, DB-stat or native stack profiling in this run.

Node29870/Rust29878/sampler29871 were all absent in postflight. Server exited0
after shutdown; wrapper/replay exited1. No manual signals. `responses=[]`,
diagnostic=null, normalizedReferences=[] describe aborted replay, not semantics.
Bounded transcript retained128 of627 messages (499 dropped); its retained
method list alone is not a full wire history. Timeline establishes initialization
and readiness failure before document opening/request transmission.

## Artifacts and next gate

Prefix `.bench/anchor-reuse-2026-09-28/menu-catalog-insert-progress-C-1`:

| Suffix / other artifact | SHA256 |
| --- | --- |
| .json | 43751aea3d862c48e2f01929bbc8bcea13b384837f15ff9c2c450c507ef666bb |
| .invocation.json | c8966c3e08691e3f7846e0835e4954b486498cdbc180679ca35280c0adb782a7 |
| .log | a38f73ff3556cb0255deb6452d4aac58c4ef9292400b2a956e6331adcdc23d53 |
| .progress.ndjson | 363b8c77308d9fde461e1cd6b5ab624a4dfaecb06f9a4ffd1ad9b41e2482fbdb |
| .stages.ndjson | 47d4f3ee9ad0af65df8d0e49e1351e0f197532de2283a48c1da8cace51b13379 |
| .host.ndjson | 89dc9e887b665ad76e1560b0bf70f4170a47a9fdec2f346ce55b78547ef3f8b0 |
| wrapper .mjs | 938c105c825f16efb1767d400721ae406d93f221ebc3d0c0f97aeef2c8b1e2d9 |
| new manifest | c6371907d5efb0170231797bdf14281bbede9d198de69df83c049f101aa01dd0 |

No after-commit `.sql.ndjson` exists: its successful-commit path was not reached.
TDD/workspace/release logs named above retain raw output. R-20 catalog recovery
and original regression/whole-fast recovery remain Must. This evidence can guide
a separately tested insertion-cost change; it does not authorize weakened
durability, scope, deadlines or partial-generation trust. R-07/R-10 production
constructor admission remains blocked. Original>3GB/final50%, cold/edit500ms,
DevEco PSS and native Windows gates remain unverified.
