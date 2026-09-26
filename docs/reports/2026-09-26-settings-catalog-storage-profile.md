# Settings catalog storage profile

Status: **read-only storage attribution; product latency/memory gates remain open**.

## Frozen workload

Use the [storage manifest](../../bench/references/manifests/settings-catalog-storage-api24.json):
clean official Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`, Node
v26.3.0, API 24 `6.1.1.125` as the accepted explicit compatibility configuration
for compile API 23. The server/Worker/library digests and nine-Location
`HomeInitData` oracle are unchanged from the row-volume runs. The new sidecar
digest is `506daa5e…4079088`. Server HEAD is `3fa53dd`, with the storage probe
uncommitted during measurement. All raw reports preserve the dirty status.

This is process/index-cold, catalog-ready-before-query replay, not immediate
first-click validation. The query is zero-based UTF-16 `28:30` in
`common/src/main/ets/sendable/HomeInitData.ets`, excluding declaration.
Normal automatic diagnostics stay enabled. Production strategy remains
`indexed-batched + closure + full SDK`, one verifier batch at a time.

## Observer contract

`ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE` is independently default-off. It
records physical file lengths before replacement, immediately before commit
and immediately after commit. Following successful commit, it reads page size,
page count, freelist count and SQLite DBSTAT B-tree aggregates. Read/output
failure cannot fail the catalog; stale/failed commits emit no storage record.
It does not change schema, INSERTs, transaction order, durability, cache size
or automatic checkpoint policy, and never calls `wal_checkpoint`.

[SQLite DBSTAT](https://www.sqlite.org/dbstat.html) is a read-only view of
B-tree storage, excluding freelist/pointer-map/lock pages. Payload and unused
bytes are separate from total allocated B-tree bytes. The
[WAL documentation](https://www.sqlite.org/wal.html) explains that checkpointed
WAL space can remain allocated and be reused: file length is not live frame
count, uncheckpointed data, cumulative I/O or an I/O amplification factor.
Metadata lengths are instantaneous, not external peak sampling.

The observer scans the database and changes read-cache state; its work delays
the opt-in ready transition. `storageProbeMs` measures observation CPU/wall
time, excluding trace output I/O. SQL `totalMs` excludes the post-commit scan;
the actual activating-to-ready interval includes it. No trace-on latency is
eligible for product graduation or a trace-off overhead claim.

## Three independent observations

All three independent process/index-cold runs returned the exact nine Locations,
zero target-file diagnostics and clean shutdown. Every byte/page field below
was identical across the runs, as were the prior 836,501 reference-row counts.
Page size is 4,096 bytes; 78,264 pages and zero freelist pages account
for 320,569,344 B (305.719 MiB) of B-tree storage.

| Storage group | Bytes |
| --- | ---: |
| Occurrence table | 105,140,224 |
| Occurrence primary-key index | 102,957,056 |
| Identity table | 28,094,464 |
| Identity indexes combined | 59,666,432 |
| Other reference tables | 5,169,152 |
| Other reference indexes | 5,439,488 |
| Remaining B-trees | 14,102,528 |

Reference storage accounts for **95.60%** of allocated B-tree bytes; reference
indexes alone account for **52.43%**. Useful payload is 287,008,920 B; unused
space is 22,196,389 B. The difference also includes B-tree structural overhead.
These figures describe disk storage, **not** V8 heap, live compiler state,
resident SQLite pages or proof of the original 5 GB problem.

Before replacement, DB/WAL lengths were 4,096 / 135,992 B. Immediately before
commit they were 4,096 / 320,770,872 B; immediately after commit,
320,569,344 / 322,575,432 B. Database growth across commit is consistent with
the earlier checkpoint stack observation, not a measurement of its wall-time
share. The post-commit WAL-to-DB length ratio of 1.006 is not I/O amplification.

The Mac reported `CPU_Speed_Limit=22%` (scheduler 100% at 17:56:02 +08).
Times then varied markedly without any intervening code change, while space
usage remained identical. CPU/OS-cache state was not controlled, so these
sequential wall times must not be interpreted as a code improvement.
After the three runs, `pmset` reported scheduler/speed limits both at 100%
at 18:04:30 +08; these point samples do not establish a per-run CPU history.

| Run | Read-only probe | SQL total | Commit | Activating → ready | References | Observed product RSS peak | Actual sample gap median / max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 27,834 ms | 48,137 ms | 8,870 ms | 77,566 ms | 43,609 ms | 506,351,616 B | 380 / 1,103 ms |
| 2 | 6,736 ms | 8,681 ms | 2,029 ms | 15,605 ms | 9,105 ms | 496,394,240 B | 114 / 146 ms |
| 3 | 5,441 ms | 7,590 ms | 1,651 ms | 13,218 ms | 8,872 ms | 518,885,376 B | 114 / 152 ms |

Product RSS counts the Node PID once plus Rust; sampler/harness memory is
separate. The requested sampling interval was 50 ms, not the achieved gaps.
None of these trace-on runs establishes a true peak or formal release gate.

A fourth independent fresh process/index, using the same sidecar but neither
SQL nor storage probe, also returned exact 9/9 Locations, zero target-file
diagnostics and clean shutdown. Its observed product RSS peak was
572,436,480 B; activating-to-ready was 6,507 ms and references 7,090 ms,
still above the 500 ms navigation target. Reference phase tracing remained
enabled. This single SQL/storage-trace-off correctness control does not prove an
observer overhead percentage or memory benefit under the changing machine
and cache state.

## Verification and reproduction

Rust validation: 33 SQLite tests, 27 sidecar protocol tests (one pre-existing
ignored), release sidecar build, formatting and workspace/all-targets Clippy
with `-D warnings` passed. The [public TDD record](../tdd/catalog-storage-trace.md)
covers two commits, rejected stale generations, bucket accounting, reopening,
exact candidate queries, default-off logging and unwritable output.
The preceding PR's Node suite passed in Linux CI before Clippy rejected the
row-count fixture's remainder spelling; the equivalent `is_multiple_of` fix
is committed separately; both `validate` and `windows-install` passed for
`3fa53dd` in [CI run 36234272269](https://github.com/liuhui-code/arkts-language-server/actions/runs/36234272269).
The previously recorded local facade timeout/memory failure is not silently
cleared by this Rust-only slice.

A fresh local `pnpm check:fast` attempt with Node v26.3.0 passed type checking
but repeatedly timed out in production LSP tests, including logging and call
hierarchy. The failing full suite was stopped (exit 143), not counted as a
complete run or GREEN. An isolated `writes structured lifecycle` replay failed
at its unchanged 3,000 ms completion-response deadline under both Node v26.3.0
and default v21.6.2. Its index-ready event preceded the timeout, but this does
not yet establish a cause or a Node-version regression. Only owned test
processes were terminated. No timeout, diagnostic or completeness gate was
relaxed. This local public-LSP cold-response failure remains open.

```text
.bench/catalog-storage-2026-09-26/storage-{1,2,3}.ndjson
.bench/catalog-storage-2026-09-26/sql-{1,2,3}.ndjson
.bench/catalog-storage-2026-09-26/replay-{1,2,3}.json
.bench/catalog-storage-2026-09-26/replay-off.json
.bench/catalog-storage-2026-09-26/hardware-observations.json
.bench/catalog-storage-2026-09-26/local-check-summary.json
```

```sh
ARKTS_INDEX_CATALOG_TRACE=1 \
ARKTS_INDEX_CATALOG_SQL_TRACE_FILE="$PWD/.bench/catalog-sql-next.ndjson" \
ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE="$PWD/.bench/catalog-storage-next.ndjson" \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --manifest bench/references/manifests/settings-catalog-storage-api24.json \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --sidecar target/release/arkts-index-sidecar \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out .bench/catalog-storage-next.json --mode A --catalog-state ready \
  --strategy indexed-batched --sdk-profile full --dependency-profile closure \
  --batch-roots 64 --idle-ms 0 --trace --timeout-ms 120000
```

Next: measure one reversible storage layout candidate preserving every row and
query contract, starting with duplicate primary-key storage. Do not drop indexes
blindly: existing tests require covering-index reference queries. Any layout
experiment needs migration/old-generation/rollback tests, exact Settings
Locations, trace-off total-ready/RSS comparisons and an unconstrained machine
before production adoption. Startup readiness, compiler cold preparation,
500 ms navigation, original >3 GB and final memory gates remain unresolved.
