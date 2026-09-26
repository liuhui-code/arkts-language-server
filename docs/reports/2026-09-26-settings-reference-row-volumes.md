# Settings reference-row volumes

Status: **repeatable row-volume attribution; latency graduation remains open**.

Three independent process/index-cold replays on the clean Settings revision
`ecc550dfaed880e04e38a2477eb7235cd50475b9` each returned all nine exact
`HomeInitData` Locations and zero target-file diagnostics. The usage position
was zero-based UTF-16 `28:30`, declaration excluded. Normal automatic
diagnostics remained enabled. Catalog readiness preceded the explicit
`textDocument/references` request; this does not validate immediate first-click
readiness.

The [frozen manifest](../../bench/references/manifests/settings-reference-row-counts-api24.json)
pins Node v26.3.0, server/Worker/standard-library/sidecar hashes, the exact
oracle, and DevEco OpenHarmony API 24 (`6.1.1.125`, SDK declaration digest
`8098b8ab…d4c6e4`). The project declares compile API 23; API 24 remains the
accepted, explicitly labeled compatibility configuration. The restored
checkout is `/private/tmp/arkts-settings-row-counts.BPJdST/project`. Server
HEAD was `c1eb082` with the row-count implementation uncommitted; its release
sidecar hash was `56382f4f…10837` and the server CJS hash was `4bd585a5…66fa5`.
The manifest contains their full digests.

## Actual writes

All three runs inserted the same row counts for 1,846 cataloged documents:

| Reference table | Successfully inserted rows | Median measured stage |
| --- | ---: | ---: |
| Occurrences | 637,203 | 15,426 ms |
| Distinct occurrence identities | 175,120 | 7,586 ms |
| Aliases | 3,662 | 315 ms |
| Bindings | 20,516 | 1,547 ms |

Total reference-related rows: **836,501**. Identity deduplication is per
document, including qualification/qualifier; 175,120 is not a count of globally
unique symbols. Occurrence timing also includes identity-tuple preparation;
identity timing includes sorting, deduplication and 256-row INSERT batches.
The counts come from successful INSERT affected-row results and are emitted
only after the complete catalog transaction commits.

| Run | Reference insertion | Commit | SQL total | Activating → ready | References end-to-end | Observed product RSS peak |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 22,854 ms | 8,781 ms | 38,085 ms | 39,347 ms | 42,640 ms | 481,669,120 B |
| 2 | 24,912 ms | 7,415 ms | 38,458 ms | 39,806 ms | 31,785 ms | 493,391,872 B |
| 3 | 24,983 ms | 7,181 ms | 38,402 ms | 39,413 ms | 57,642 ms | 431,841,280 B |

These times are **machine-constrained diagnostic data**. The Intel i7-9750H
MacBookPro16,1 with 16 GiB RAM reported `CPU_Speed_Limit=22%` and
`CPU_Scheduler_Limit=87%` at 17:08:25 +08:00 on AC power. They cannot establish
a regression versus the September 22 runs or observer overhead. The external
sampler requested 50 ms intervals, but measured median gaps were 333/296/370
ms and maximum gaps 702/548/1,016 ms. RSS values are observed process-tree
peaks, with Node counted once and the Rust sidecar included; the raw report
separately records harness/sampler memory. This sampling does not establish a
hard peak or a release memory gate.

A fourth independent fresh-process/index-cold replay, with
`ARKTS_INDEX_CATALOG_SQL_TRACE_FILE` absent, also returned the exact nine
Locations, zero target-file diagnostics and a clean shutdown. Its observed
product RSS peak was 460,468,224 bytes. This is a trace-off correctness control,
not a statistically valid overhead comparison under the CPU constraint.

The volume evidence strengthens the write-path investigation: occurrence and
identity storage dominate both row count and measured reference-insert time.
It does not authorize dropping occurrences, changing semantic scope or moving
checkpoint cost out of the measured ready transition. The earlier
[96-row INSERT experiment](2026-09-22-settings-sqlite-batch-rejected.md)
already failed its performance comparison. Next measure table/page and WAL
write amplification, and evaluate a single controlled change on a machine
without this CPU limit. Compiler cold preparation and the 500 ms navigation
gate remain separate unresolved work.

## Verification and artifacts

Rust validation passed: 31 SQLite tests, 27 sidecar protocol tests (one
pre-existing release-only test ignored), release build and formatting. The
[public row-count test](../tdd/reference-row-count-trace.md) covers a full
256-identity batch plus its remainder, duplicate occurrences, aliases,
bindings, two committed generations, reopening and rejected stale generation.
SQL, schema, transaction order and WAL settings are unchanged.

The previous full `pnpm check:fast` run had 955/958 passing tests; three failed
at external sampling. With sampling permission, the immediate-catalog and
missing-diagnostics cases passed. The independent facade RSS test still
exceeded its 30-second test timeout. A direct replay completed with exact
results in 10,281 ms source + 22,339 ms facade time, but its separate facade
memory gate failed (peak ratio 1.375). That experiment is not promoted, and
the full local fast-check gate is not reported GREEN.

Raw artifacts are retained under the repository's ignored directory:

```text
.bench/reference-row-counts-2026-09-26/manifest.json
.bench/reference-row-counts-2026-09-26/hardware.json
.bench/reference-row-counts-2026-09-26/sql-{1,2,3}.ndjson
.bench/reference-row-counts-2026-09-26/replay-{1,2,3}.json
.bench/reference-row-counts-2026-09-26/replay-off.json
.bench/reference-row-counts-2026-09-26/facade-validation.json
```

Replay with fresh output and trace paths:

```sh
ARKTS_INDEX_CATALOG_TRACE=1 \
ARKTS_INDEX_CATALOG_SQL_TRACE_FILE="$PWD/.bench/reference-row-counts-next.ndjson" \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --manifest bench/references/manifests/settings-reference-row-counts-api24.json \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --sidecar target/release/arkts-index-sidecar \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out .bench/reference-row-counts-next.json \
  --mode A --catalog-state ready --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 0 --trace --timeout-ms 120000
```
