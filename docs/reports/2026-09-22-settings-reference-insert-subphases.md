# Settings SQLite reference-insert subphases

Status: **diagnostic attribution only**. No SQL statement, schema, transaction
boundary, WAL setting or production references policy changed.

The same clean OpenHarmony Settings checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9` and DevEco API-24
compatibility SDK were used; the project declares compile API 23, so these
are not SDK-matched correctness results. Node was v26.3.0. The server bundle
SHA-256 remained
`4bd585a5c89ea734f515b21d78abaf41ad2da80f413c1b18ff7dac09ace66fa5`;
the rebuilt sidecar SHA-256 was
`527ccddb2db4a8b8853a09364141bf5a9258be60f1f9437d3bd2815255b17eb5`.
Each run used a fresh process/cache, normal diagnostics, an independent 50 ms
product-tree RSS sampler and the exact nine-Location `HomeInitData` oracle at
zero-based UTF-16 `28:30` with declaration excluded. All six trace-on/off
replays completed with 9/9 exact Locations and zero target-file diagnostics.

| Run | Occurrences | Identity work | Aliases | Bindings | All reference inserts | Commit | Activating → ready | Peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Trace on 1 | 3,777 ms | 1,751 ms | 96 ms | 449 ms | 6,074 ms | 3,593 ms | 11,235 ms | 567,021,568 B |
| Trace on 2 | 3,567 ms | 1,669 ms | 88 ms | 419 ms | 5,744 ms | 3,131 ms | 10,332 ms | 577,339,392 B |
| Trace on 3 | 3,693 ms | 1,858 ms | 96 ms | 414 ms | 6,061 ms | 3,054 ms | 10,538 ms | 577,077,248 B |
| Trace off 1 | — | — | — | — | — | — | 10,868 ms | 580,419,584 B |
| Trace off 2 | — | — | — | — | — | — | 10,349 ms | 569,794,560 B |
| Trace off 3 | — | — | — | — | — | — | 10,282 ms | 574,836,736 B |

The trace-on median reference-insert total was **6,061 ms**. Occurrence work
was **3,693 ms** (about 61% of that stage), identity sort/dedup and batched
insert **1,751 ms** (about 29%), binding **419 ms** (about 7%) and alias
**96 ms** (about 2%). The occurrence timer also covers preparation of the
per-occurrence identity tuple; the identity timer covers per-document sorting,
deduplication and 256-row flushes. These are block-level wall clocks, not a
profile of one SQLite call or CPU time. The separate commit median remained
about **3,131 ms**. Together, reference insertion and commit account for
about 89% of the median 10,356 ms SQL replacement total.

Trace-on/trace-off activation medians were 10,538/10,349 ms (about 1.8%
apart) over only three sequential processes each. That difference is too
small a sample to attribute to the observer; the flag remains default-off.
The previous [96-row occurrence INSERT A/B](2026-09-22-settings-sqlite-batch-rejected.md)
was slower despite exact results, so the measured 3.7-second occurrence stage
does **not** justify repeating that same change. The separate
[commit stack sample](2026-09-22-settings-sqlite-stage-profile.md) implicates
automatic WAL checkpointing in one run, but no checkpoint/durability policy
has changed. Before another optimization, record row volumes and distinguish
checkpoint time relocation from a genuine end-to-end reduction.

Raw data:

```text
/private/tmp/settings-reference-subphase-{1,2,3}.ndjson
/private/tmp/settings-reference-subphase-replay-{1,2,3}.json
/private/tmp/settings-reference-subphase-off-{1,2,3}.json
```

To repeat with unique output paths:

```sh
ARKTS_INDEX_CATALOG_TRACE=1 \
ARKTS_INDEX_CATALOG_SQL_TRACE_FILE=/private/tmp/settings-reference-subphase-next.ndjson \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --sidecar target/release/arkts-index-sidecar \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-reference-subphase-next.json \
  --mode A --catalog-state ready --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 0 --trace --timeout-ms 120000
```
