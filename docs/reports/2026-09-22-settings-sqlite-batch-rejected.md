# Settings SQLite reference-insert batching A/B

Status: **rejected experiment**. The candidate implementation was removed after
the paired run; no batch-write optimization is active in production.

The fixed clean Settings checkout was
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-e2e.vrQQm9/project`. It declares compile API 23.
The selected API 24 DevEco SDK is a pinned compatibility configuration, not
an SDK-matched result. Node was v26.3.0. The server bundle SHA-256 was
`4bd585a5c89ea734f515b21d78abaf41ad2da80f413c1b18ff7dac09ace66fa5`.
Both variants used the same bundle, SDK, symbol, fresh index cache per process,
normal diagnostics, 50 ms external process-tree RSS sampler and exact oracle.

The baseline sidecar SHA-256 was
`8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`;
the candidate sidecar was
`176931ee4ceeab5c768e13ad98ac7b9a60ed9913505c721b8285f9ae7da5adc0`.
The sole behavioral change in the candidate was replacing one-at-a-time
`reference_occurrences` inserts with ordered multi-row inserts of at most 96
rows (768 binds); aliases, bindings, identity insertion, one IMMEDIATE
transaction, generation commit and schema stayed unchanged. A new public
characterization test with 120 parsed consumer documents passed on both
versions, as did `cargo test -p arkts-index-sqlite` (27/27), formatting and the
release sidecar build.

All six LSP runs queried `HomeInitData` at zero-based UTF-16 `28:30` in
`common/src/main/ets/sendable/HomeInitData.ets` with
`includeDeclaration=false`. Each returned the same nine exact Locations,
zero target-file diagnostics and completed normally. The table measures
`activating → ready` from opt-in native sidecar events; bytes are externally
sampled peak product-tree RSS, not summed Worker RSS.

| Variant | Run | Activation | Total catalog trace | Peak RSS |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 1 | 12,006 ms | 12,795 ms | 550,875,136 B |
| Baseline | 2 | 11,066 ms | 11,865 ms | 580,448,256 B |
| Baseline | 3 | 10,562 ms | 11,365 ms | 581,910,528 B |
| Batched | 1 | 12,551 ms | 13,415 ms | 570,556,416 B |
| Batched | 2 | 11,600 ms | 12,393 ms | 580,538,368 B |
| Batched | 3 | 11,588 ms | 12,366 ms | 578,945,024 B |

The activation median **increased** from 11,066 to 11,600 ms (about 4.8%).
Median peak RSS differed by less than 0.3%, below any defensible win claim.
The post-ready references medians (7,793 vs 7,397 ms) are separate compiler
work and do not rescue the slower catalog. Six sequential runs are diagnostic,
not randomized release-level latency or memory evidence. They disprove the
proposed quick win on this fixed machine/workload, not every possible insert
strategy or platform.

Raw reports:

```text
/private/tmp/settings-sqlite-baseline-rerun-{1,2,3}.json
/private/tmp/settings-sqlite-batched-{1,2,3}.json
```

One earlier sandboxed attempt produced no RSS sample and is excluded:
`/private/tmp/settings-sqlite-baseline-1.json` records the sampler failure,
not a references failure. The successful six runs used the same macOS process
sampling permissions.

To replay one variant, supply its sidecar binary explicitly and use a new
`--out` path. For the retained baseline binary:

```sh
ARKTS_INDEX_CATALOG_TRACE=1 \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --sidecar /private/tmp/arkts-index-sidecar-baseline-8d4e95b5 \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-sqlite-baseline-next.json \
  --mode A --catalog-state ready --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 0 --trace --timeout-ms 120000
```

Next: measure time inside the SQLite replacement transaction (deletion,
each table's insertion, index rebuild and commit) with default-off telemetry.
The stack sample alone was not enough to select a winning change.
