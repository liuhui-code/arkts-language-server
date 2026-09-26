# Catalog storage trace

Parent revision: `fbf05bebb57dfe87b53189eaeee5bddf7bdde848`.

## Contract and RED

An independent, default-off `ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE` probe
observes physical database/WAL lengths before catalog replacement, immediately
before commit and after commit. After successful commit only, it reads logical
page/freelist counts and B-tree byte usage using SQLite's read-only `dbstat`.
Only fixed numeric fields are emitted; paths and source contents are excluded.
It must not alter SQL, schema, durability, checkpoint policy, query results or
atomic generation activation. Logging/read failures fail open.

The public child-process test activates two generations through
`WorkspaceIndex<SqliteStore>`, checks complete identity queries before and after
reopening, and rejects stale generations. The observer contract partitions
all B-tree bytes into occurrence tables/indexes, identity tables/indexes,
other reference tables/indexes and remaining B-trees. It checks page-accounting
inequalities rather than querying private database tables itself.

```sh
cargo test -p arkts-index-sqlite --test catalog_storage_trace -- --nocapture
```

RED at the parent: exit **101**, `opt-in storage trace must exist` because the
trace file is absent. A later fixture correction permits a zero-byte WAL before
commit: small transactions can remain buffered until commit. Zero physical
length is not evidence of a missing transaction or an observer failure.

## GREEN

The storage and existing row-count tests passed 4/4. The probe uses existing
bundled SQLite DBSTAT support; no additional compiler flag or dependency was
added. It never issues `wal_checkpoint`. Physical WAL length is not live frame
count, uncheckpointed bytes, cumulative bytes written or peak I/O amplification.
`storageProbeMs` measures metadata/SQL observation, excluding trace output I/O;
the normal ready transition includes probe overhead. Storage observations are
not suitable for unqualified latency comparisons against trace-off runs.

## Separate CI characterization correction

The parent PR's Linux Node tests passed, then Rust Clippy failed at
`catalog_reference_row_counts.rs` on `manual_is_multiple_of`. Replace
`count % 256 != 0` with `!count.is_multiple_of(256)` without changing the existing
full-batch-plus-remainder assertion. The same row-count test stays GREEN.
