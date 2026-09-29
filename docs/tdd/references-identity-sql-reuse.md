# R-20 operation-local identity SQL reuse

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. Preserve inherited changes. Follows
[ADR 0005](../adr/0005-index-proof-trust-boundary.md) and the
[completed-prefix diagnosis](../reports/2026-09-28-settings-catalog-insert-progress.md).

## Contract and scope

Before any implementation, restore the fixed real Settings checkout and replay
the unchanged binary under the existing180s gates. This completes11 exact
267-location responses and version2 automatic diagnostics; original constructor
30s regression also passes. These are unchanged-artifact recoveries, not a code
speedup or the full fast gate.

The insertion path constructs the same complete256-row identity SQL string on
each flush before looking up `prepare_cached`. Retain that string lazily inside
**one insert operation**, reconstruct only a different-size tail. Do not change
SQL shape/parameters/order,256-row batches, affected-row counts, cross-document
buffering, constraints, schema, durability, timing/checkpoint meanings, or any
semantic/default/Worker/cache-budget/deadline policy. No global SQL/AST cache or
resident statement pool is added. Empty/small batches do not build a full SQL
string. Drop this bounded string when insertion returns, including failure.

This attacks avoidable Rust preparation allocations within identity work, not
the dominant occurrence IO, compiler preparation or the original5GB case.

## Public cost RED → GREEN

The new `reference_identity_allocations` integration test uses a child process
with all current SQLite observer variables removed. Parse/census, MemoryStore
expectations, opening and queries stay outside the measured region. A const
thread-local System allocator counter records only Rust alloc/zeroed/realloc
requests on the current thread during public `WorkspaceIndex::activate_catalog`.
It does not replace allocation ownership or count C/SQLite allocations, bytes,
RSS, other threads or elapsed time. Panic-safe scope resets recording.

The fixed35-document fixture has4598 occurrences,1362 distinct per-document
identities (five complete256 batches plus82 tail),34 aliases and34 bindings,
repeated usages and qualified same-spelling member occurrences. Activation's
public report, exact candidate/proof results and reopened results match
MemoryStore **before** asserting a coarse resource bound. The bound is
`3 * identities +512 =4598` Rust allocation requests for this fixture; it is a
regression budget, not a general per-identity formula for arbitrary projects.

```sh
cargo test -p arkts-index-sqlite --test reference_identity_allocations -- --nocapture
```

Artifacts under `.bench/anchor-reuse-2026-09-28/`:

- `identity-sql-allocation-red-1.log`: exit101, actual5341 allocations exceeds4598;
  public activation/parity/reopen assertions have already passed. Production
  code is unchanged at RED.
- `identity-sql-allocation-green-1.log`: exit0,1 PASS, actual4289 with the same
  unchanged resource budget and semantic assertions after operation-local reuse.

Reduction:1052 requests,19.70% in this fixture. No wall-time, SQLite allocation,
process RSS or real-project speedup follows from this count. Existing public
row-count/batch/progress tests protect multiple generations, cross-document
identity buffering, zero/small/tail cases and rollback after successful prefix
inserts; workspace verification remains separately recorded in the report.

## Characterization and build verification

Strict `cargo clippy --workspace --all-targets -- -D warnings` exposed existing
dirty-source style violations after the insertion change. Keep warnings enabled:
collapse one equivalent import/export-header condition, remove redundant
connection borrows and temporary one-element clones, and spell the existing
every-64-document observer condition with `is_multiple_of(64)`. No source
admission, observer cadence, schema or query behavior changes. Existing public
binding, migration, progress, MemoryStore/SQLite/reopen tests characterize these
refactors before and after; no assertion or deadline is relaxed.

Final strict Clippy is exit 0. Final `cargo test --workspace -- --test-threads=1`
is **182 PASS, 0 FAIL, 1 existing ignored**, exit 0. The default-feature native
release build is exit 0 (6.34 s), SHA256
`f8b9e0c7d0632fe87a6edd4858bc2e23b0a2a20d3f21db965e51a1ee87122070`.
Toolchain: rustc/cargo 1.95.0. All changed handwritten Rust files remain below
500 physical lines. Final logs are `identity-sql-clippy-verified.log`,
`identity-sql-rust-verified.log` and `identity-sql-release-verified.log` under
`.bench/anchor-reuse-2026-09-28/`; failed Clippy attempts remain separate evidence.

## Remaining gates

See [the recovery and implementation report](../reports/2026-09-28-settings-catalog-recovery-identity-sql.md)
for the real-run assets, host snapshots and subsequent verification. The pinned
new-native Settings mode-C replay is PASS, 11 × 267 exact valid Locations with
normal version-2 diagnostics and exit 0; cold/edit are 65.491/79.556 s, hits
31–41 ms. Sampled product RSS is 1,225,367,552 bytes, 14.3% above the preceding
single baseline; this nonrandomized run does not prove memory/latency savings
or pass a no-regression performance gate. The fresh full `check:fast` is
**FAIL, 1,090/1,093 PASS, 3 response-2 timeouts, exit 1**, with zero
cancelled/skipped/todo; the original constructor characterization passes
without changing its 30 s RPC deadlines. Unchanged-deadline focused rechecks
are **2 PASS/1 FAIL**; an old-native requested control also times out in recovery.
They are separate evidence and cannot replace this whole-gate failure or prove
the absence of performance regression.
R-20 first-click readiness, constructor admission/narrowing,
cold/edit500ms, original>3GB/final50%, PSS/DevEco and native Windows are not
graduated by the allocation test. No commit, push or merge is requested here.
