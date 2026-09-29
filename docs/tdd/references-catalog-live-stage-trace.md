# R-07/R-10 live catalog activation observation

Parent `9f91122ac504365c57473a430094da09baac9309`; dirty branch
`codex/references-f2-fixed-benchmark`. Preserve inherited changes. Follows
[the native diagnosis](../reports/2026-09-28-settings-catalog-activation-native-profile.md)
and [ADR 0005](../adr/0005-index-proof-trust-boundary.md).

## Small public contract

`ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE` is a default-off, best-effort file
observer. It does not alter SQLite layout, transaction ordering, durability,
catalog scope, generation, compiler admission, semantic policy or deadlines.
Neither stdout nor stderr carries its records. Open/write/flush failure cannot
turn successful indexing into a failure or change the original store error.

After preflight, `replace.start` records the captured batch's document count
and **input** occurrence/alias/binding lengths. These are attempted input, not
affected/committed rows. No extra parsing, sorting, distinct-identity census,
SQL COUNT, DB-stat scan, source text, URI or SQL parameter is recorded. All
census/file IO is conditional on the flag and successful observer open.

Eight fixed stage boundaries cover replacement, reference inserts, name-index
creation and transaction commit. End/complete boundaries follow successful
operations only. Each flush exposes the boundary before the next synchronous
operation. `elapsedNs` is monotonic relative to this post-preflight observer;
`epochMs` is a wall-clock correlation point, not a CPU duration. An unfinished
trace establishes the last observed boundary, not deadlock or a full-run time
breakdown. Trace-on IO can itself affect timing and cannot replace trace-off
release evidence. The existing after-commit SQL trace remains unchanged.

## Actual RED → GREEN

Raw logs: `.bench/anchor-reuse-2026-09-28/`, guarded by unused output paths.

```sh
cargo test -p arkts-index-sqlite --test catalog_stage_trace \
  live_catalog_stage_trace_is_opt_in_and_preserves_committed_reference_results \
  -- --exact
```

`catalog-stage-trace-red.log`: exit101, 0/1 PASS. The opted-in live trace is
absent (`NotFound`) while the public catalog/query child succeeds. No private
SQL internals are used as the result oracle. The smallest implementation is
one observer module and eight boundaries in `replace_all`.

`catalog-stage-trace-green.log`: exit0, 1/1 PASS. Two successful catalog
generations produce exactly 16 ordered boundaries with correct numeric input
counts; reopening through the public store preserves complete candidate proof.

`catalog-stage-trace-characterization.log`: exit0, 5/5 PASS, including two
child helpers. Three parent tests protect successful observation/default-off,
unwritable observer paths and transaction rollback. A stale generation emits
no replacement; a duplicate-document transaction emits only `replace.start`,
never a successful commit. Reopened queries still see the previous generation.
These added error checks are characterization, not additional invented REDs.

`catalog-stage-live-characterization.log`: exit0, 1/1 PASS. A separate,
test-owned SQLite writer holds the public activation transaction pending.
The child remains alive while `replace.start` is already readable, before
releasing that lock. Both subsequent generations complete and reopened public
queries agree. This protects explicit live flushing, not just file output at
process exit. Every record also has a fixed, unique nine-field allowlist and
JSON string/integer grammar; no new JSON dependency is introduced. The
duplicate-document failure is pre-reference insertion, **not a commit-failure
injection** or proof that all late error paths were exercised.

## Remaining boundaries

Final Rust workspace: `catalog-stage-final-rust-workspace.log`, exit0,
177 PASS/0 FAIL/1 existing ignored, including all six observer tests. The ignored
455-file release fixture is not counted as a completed gate. Default-feature
release rebuild: `catalog-stage-release.log`, exit0, 28.66 s. Observer/source/test
modules are 76/243/345 physical lines; no oversized file is edited or grown.

Use the existing real Settings framed-LSP runner with the newly pinned observed native binary. Keep
the old manifest/binary and 267-tuple oracle. The original 180 s readiness gate,
normal diagnostics and post-edit mode-C result checks remain unchanged.
Any readiness failure means no references result was measured. Input counts
may be compared with historical rows only after measuring this current parser.

The old native binary is retained as the ignored
`arkts-index-sidecar-before-live-stage` artifact, SHA
`def311dfe2269ecb0b147d9451ae60b09ee1a55f8228b428f57b26923dba05e2`.
The new default-feature sidecar SHA is
`9cb58aecc2759a92c43333f926deadbbf7fa015bd621d808ce59b62835d75530`;
JS assets and the original manifest/oracle are not rebuilt or overwritten.
The separate
[observed manifest](../../bench/references/manifests/settings-menucontroller-catalog-live-stage-api24.json)
explicitly pins that different binary. Original regression/whole-fast failures
remain open; this instrumentation build is not a latency A/B.

No optimization, constructor exclusion, default promotion, 500 ms, original
>3 GB/50% memory, PSS/DevEco or Windows graduation follows from this observer.
The last whole-fast failure is not converted into PASS by focused Rust tests.
No commit, push or merge.

Terminal [real Settings replay](../reports/2026-09-28-settings-catalog-live-stage-trace.md)
is FAIL/exit1 at the original180 s ready gate. Captured1846 documents,
637203 occurrences/3662 aliases/20516 bindings match historical cardinality.
Only replacement/reference-insertion start records are retained; no insertion
end/index/commit/ready, didOpen, reference result or diagnostic is reached.
Trace-on input evidence does not close original regression or memory gates.
