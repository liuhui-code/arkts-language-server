# R-01/R-20 bounded reference-index insertion observation

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; preserve inherited changes. Follows
[the live-stage diagnosis](../reports/2026-09-28-settings-catalog-live-stage-trace.md)
and [ADR 0005](../adr/0005-index-proof-trust-boundary.md).

## One small observable contract

`ARKTS_INDEX_REFERENCE_INSERT_TRACE_FILE` is a new, default-off, best-effort
file observer for **full catalog activation only**. Incremental refresh keeps
its existing path without opening this observer. It does not enable the older
after-commit SQL trace, change statements/order/256-row identity batches,
layout, transactions, durability, membership, compiler policy or deadlines.
stdout/stderr remain free of these records. Open/write/flush errors cannot
change the original store result. Off/unwritable means no new timing/census/IO
inside the insertion loops; no source contents, URI or SQL parameters are logged.

The four per-document subphases are interleaved, not four global stages.
Record cumulative **completed** wall durations for occurrences, identity
dedup/value preparation/batch execution, aliases and bindings. Each duration
includes that subphase's existing work, not pure SQLite CPU time. No extra
sort/distinct census/COUNT/DB-stat is run. A failed/pending subphase's unfinished
duration is not included. Observation IO itself may affect wall time.

Only document 1, each multiple of64, and the final document emit four completed
subphase checkpoints; start, identity-tail start/end and insertion-complete are
separate. This is bounded by documents/64, not SQL row count. All checkpoints
are explicitly flushed, but the public test reads after child exit: **it does
not independently prove live visibility**. A trace's last completed sample
does not identify the currently pending SQL or prove deadlock.

`executed*Rows` count only successful statement return values inside an
**uncommitted** transaction. Identity batching crosses document boundaries:
`bufferedIdentityRows` is never prematurely counted as executed. The final
remainder is only counted after its successful SQL call. `documentsCompleted`
means the bindings loop has finished for that input prefix; it does not mean
all identity rows were flushed or the generation is committed. Even
`insert.complete` is not catalog commit/readiness. Every record has
`uncommitted=true`; coarse commit markers keep their independent meaning.

## Actual RED → GREEN

Logs are guarded output files under `.bench/anchor-reuse-2026-09-28/`.

```sh
cargo test -p arkts-index-sqlite --test reference_insert_progress \
  progress_is_opt_in_bounded_and_counts_executed_not_buffered_identity_rows \
  -- --exact
```

`reference-progress-red.log`: exit101, 0/1 PASS. Public catalog activation and
candidate-query/reopen child succeed, but the opt-in progress file is absent
(`NotFound`). This is a real tooling RED before production observation hooks.

`reference-progress-green.log`: exit0, 1/1 PASS. The minimal observer and hooks
pass. A130-document fixture crosses several256-row identity batches with a
nonempty tail, has repeated occurrences/aliases/bindings, and emits exactly20
records per generation, not a record per row/document. Counters agree with the
fixture's distinct identities, reset for generation2, and preserve exact public
candidate results against `MemoryStore` after reopen.

`reference-progress-characterization.log`: exit0, 4/4 PASS, including one child
helper. Added characterization protects a fixed18-field JSON/privacy allowlist,
monotonic/nonnegative completed times, default-off/unwritable observer, and
incremental refresh without progress records. The incremental result is also
compared through public reopen/query against `MemoryStore`.

A test-owned SQLite trigger deliberately rejects a later binding insert after
positive progress. Activation returns its original failure, there is no
`insert.complete`, and reopening returns generation1's complete candidate
result. Earlier executed rows are therefore **not proof of persisted rows**.
This exercises rollback after reference insertion progress, not final COMMIT
failure. The trigger is fixture-only, never part of production schema.

## Unchanged gates

Keep the original Settings checkout, API24 compatibility track,267-location
oracle, JS assets and180s catalog/request/diagnostic deadlines. Archive the
previous native binary and pin a separate observation-only rebuild manifest;
do not overwrite or reinterpret older reports. Use the existing real-child
framed-LSP/RSS replay, with normal diagnostics and mode-C post-edit query.

Original regression/whole-fast, real catalog readiness, constructor completeness,
500ms cold/edit experience, original>3GB/final50% memory, PSS/DevEco and native
Windows gates remain independent. Focused Rust GREEN is not their completion.
No semantic optimization/default promotion, commit, push or merge in this slice.

## Workspace and real replay outcome

`reference-progress-rust-workspace.log`: exit0,181 PASS/0 FAIL/1 existing ignored.
`reference-progress-release.log`: default sidecar release build exit0,2m25s.
Native-only manifest pins the observation rebuild; unchanged JS/SDK/query/oracle
and older native archive remain separate. The fresh real Settings run fails
the original180s catalog gate before didOpen/references. Its1344/1846 completed
prefix spends64.302s occurrences,21.397s identity,10.275s bindings,0.979s aliases;
all counters remain uncommitted, not full-run costs or compiler query evidence.
See [the fixed-input report](../reports/2026-09-28-settings-catalog-insert-progress.md).
No fresh whole-fast or constructor/default graduation follows.
