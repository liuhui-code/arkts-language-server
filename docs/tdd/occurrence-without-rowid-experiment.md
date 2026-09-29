# Occurrence storage experiment

Parent: `e0131f932c0592974c6f97a2c787e7974f86862c`.

Approved scope: one reversible storage-layout experiment; no reference data,
covering identity index, semantic scope or diagnostics may be removed.

## Characterization and RED

Existing public catalog storage/reopen/generation test passed before extraction:

```sh
cargo test -p arkts-index-sqlite --test catalog_storage_trace -- --nocapture
```

Add an initially empty compile-time feature and a public observer assertion:

```sh
cargo test -p arkts-index-sqlite --features experimental-occurrence-without-rowid \
  --test catalog_storage_trace -- --nocapture
```

RED exit 101: `occurrenceIndexBytes` was 57,344, expected zero. The same
transcript checks candidate identity, two successful generations, rejected
stale generation, reopening, default-off logging and unwritable observers.

## Minimal GREEN and boundaries

Extract fresh-schema creation to `src/schema.rs`, preserving default SQL.
Only the explicit feature adds `WITHOUT ROWID` to `reference_occurrences`.
It leaves the identity covering index and symbol FTS rowid triggers intact.
Experimental schema 109 accepts only a fresh database or its own schema;
production remains schema 9 and rejects 109. No experimental migration from
production data is provided. Independent boundary fixtures verify public
`SqliteStore::open` rejects the other layout without changing user_version.

Default SQLite suite passed 34 tests, including all five historical migrations.
Experimental SQLite suite passed 29 tests with `--skip version_`: the five
production migration tests intentionally do not apply to a fresh-only profile.
Experimental sidecar protocol suite passed 27, one pre-existing ignored.
Default and experimental workspace/all-targets Clippy, formatting, and the
experimental release sidecar build passed. This does not graduate the layout
or clear existing public-LSP latency/memory failures.
The new full `pnpm check:fast` attempt passed type checking/build and the earlier
logging/call-hierarchy cases, but observed a 33,641 ms failure in the public
batched-reference cancellation/recovery test. A 22% CPU speed-limit point sample
was recorded; causation is not established. The already-failed run was stopped
via its validated process tree, exit 143, with no complete test count or GREEN
claim. Original timeout budgets remain unchanged.
The exact-name isolated rerun also failed (exit 1, one test), timing out on
recovery LSP response 2 after its unchanged 30-second budget. Client cancellation
assertions passed; resumed session 2 progressed through 8 of 21 batches. This
is not evidence of a failed cancellation acknowledgement or an exact completed
recovery result. See the report for phase numbers and reproduction command.

`lib.rs` shrank from 2,260 to 2,140 lines; remaining over-limit migration debt
is explicit. Extracted schema and changed/new tests remain below 500 lines.
The user's dirty `AGENTS.md` is untouched.
