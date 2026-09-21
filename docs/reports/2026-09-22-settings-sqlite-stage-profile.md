# Settings SQLite activation stage profile

Status: **measured attribution, not an optimization or release pass**.

The source-side `replace_all` sequence is unchanged. Its implementation was
extracted to a smaller module and given a default-off
`ARKTS_INDEX_CATALOG_SQL_TRACE_FILE` observer. It writes one numeric-only
NDJSON summary **after** a successful commit; failure to write the trace does
not fail indexing. Protocol stdout remains unchanged. The trace measures one
transaction's preflight, inserts, index rebuild and commit with monotonic
clocks, not CPU time or individual SQL statements.

The real LSP replay used the clean Settings checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, selected DevEco OpenHarmony
API 24 as a pinned compatibility configuration for a project declaring compile
API 23, and Node v26.3.0. The server bundle SHA-256 was
`4bd585a5c89ea734f515b21d78abaf41ad2da80f413c1b18ff7dac09ace66fa5`;
the sidecar SHA-256 was
`eb6de8ab0583c5c557f8e3e155f59dcecfb0c7e9b873cd6c9db766833f8c047c`.
Every run used a fresh process and private index cache, 1,846 cataloged
documents, normal diagnostics and an independent 50 ms product-tree RSS
sampler. The query was usage-site `HomeInitData` at zero-based UTF-16 `28:30`,
without declaration. All six trace-on/off runs returned the nine exact oracle
Locations and zero target-file diagnostics.

| Run | `insertReferencesMs` | `commitMs` | `createIndexMs` | SQL total | Sidecar activating → ready | Peak product RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Trace on 1 | 6,974 | 3,521 | 655 | 11,799 | 12,048 | 574,455,808 B |
| Trace on 2 | 6,118 | 3,067 | 607 | 10,412 | 10,600 | 569,466,880 B |
| Trace on 3 | 5,686 | 3,075 | 622 | 10,011 | 10,195 | 569,491,456 B |
| Trace off 1 | — | — | — | — | 10,242 | 567,926,784 B |
| Trace off 2 | — | — | — | — | 10,675 | 575,979,520 B |
| Trace off 3 | — | — | — | — | 10,624 | 575,225,856 B |

The trace-on median SQL total was **10,412 ms**. Within it, the median
reference-insertion stage was **6,118 ms** (about 59%) and commit was
**3,075 ms** (about 30%); index recreation was **622 ms** (about 6%). Together,
reference insertion and commit account for about 88% of this transaction.
`insertReferencesMs` includes occurrence, occurrence-identity, alias and
binding writes; it is **not** proof that one table or SQL statement alone
accounts for six seconds. `commitMs` includes SQLite's own finalization and
storage effects; no unsafe durability setting was changed.

A separate fourth exact 9/9 Settings replay sampled the Rust sidecar for four
seconds near the commit interval. Its transaction trace recorded
`commitMs=3,804`. Of 1,667 sampled catalog-thread ticks under
`Transaction::commit`, 1,225 descended through SQLite's default WAL hook to
`sqlite3_wal_checkpoint_v2`; that subtree included 868 `pwrite` and 269
`fsync` ticks. The remaining 442 sampled commit ticks followed VDBE/pager WAL
frame finalization. This is stack-sampling evidence that **automatic WAL
checkpointing is a material part of commit wall time on this run**, not a
precise percentage or proof that disabling it improves end-to-end latency.
Moving checkpoint work after commit would merely shift cost until measured
otherwise and needs a separate correctness/durability review.

```text
/private/tmp/settings-commit-sample-replay.json
/private/tmp/settings-commit-sample-sql.ndjson
/private/tmp/settings-commit-sidecar.sample.txt
```

Trace-on and trace-off activation medians were 10,600 and 10,624 ms in these
three sequential runs. This does not show a measurable trace penalty here,
but the sample is too small to establish a general overhead bound. The
separate rejected [96-row insert A/B](2026-09-22-settings-sqlite-batch-rejected.md)
showed that simply reducing occurrence INSERT call count did **not** improve
activation. The next experiment must partition the reference stage further
and understand commit/write amplification before changing schema, pragmas or
durability. Even a zero-cost catalog would leave the observed post-ready
compiler references at several seconds, so the 500 ms navigation target is
still unmet.

Raw artifacts:

```text
/private/tmp/settings-sql-stage-{1,2,3}.ndjson
/private/tmp/settings-sql-stage-replay-{1,2,3}.json
/private/tmp/settings-sql-stage-off-{1,2,3}.json
```

Reproduce a trace-on run with a fresh `--out` and trace file path:

```sh
ARKTS_INDEX_CATALOG_TRACE=1 \
ARKTS_INDEX_CATALOG_SQL_TRACE_FILE=/private/tmp/settings-sql-stage-next.ndjson \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --sidecar target/release/arkts-index-sidecar \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-sql-stage-next.json \
  --mode A --catalog-state ready --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 0 --trace --timeout-ms 120000
```
