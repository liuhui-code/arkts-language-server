# C4 nonblocking workspace catalog: TDD evidence

Parent revision: `cb695980b0355e2b0e4ed211528e3ab909f9ba1d`

This tracer keeps the protocol-v1 sidecar responsive while Rust discovers,
reads, parses, and atomically activates a complete workspace catalog. Cached
symbols remain searchable throughout discovery and survive cancellation or a
worker failure.

## Protocol contract

`catalog/start { reason, force }` acknowledges before filesystem work. Its
result is `{ accepted, generation, status }`; a repeated start while the same
catalog is active returns `accepted: false` and that generation. The sidecar
emits mutex-serialized, id-less JSON lines:

```json
{"protocol":1,"event":"catalog/progress","params":{"workspaceIdentity":"file:///workspace","status":{}}}
```

Nonterminal phases are `idle`, `discovering`, `activating`, and `cancelling`.
Terminal phases are `ready`, `partial`, `degraded`, and `cancelled`.
`totalFiles` is absent until discovery completes and is present while
activating. `buildingGeneration` is a number only while work is active.
Counters are monotonic. `ignored` counts each pruned directory, ignored
source-file boundary, and skipped symlink once; it does not pretend to
enumerate descendants of a pruned tree.

`catalog/cancel { generation }` returns `{ cancelled, generation, status }`.
Once cancellation is accepted during discovery, the worker cannot begin
activation and the terminal event retains the prior state, completeness, and
committed generation. Activation ownership is acquired atomically; after the
worker enters `activating`, cancel returns `cancelled: false` rather than
claiming that an in-flight SQLite transaction was revoked.

Search accepts optional `excludedUris`. It is bounded to 256 nonempty entries,
4,096 UTF-8 bytes per entry, and 64 KiB total. The shared query removes those
URIs before stable ranking and `limit`, preventing persisted top-N results from
being starved when open-document overlays shadow them.

## RED/GREEN vertical slices

### 1. Immediate start and truthful empty completion

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol empty_workspace_catalog_starts_nonblocking_and_reaches_truthful_ready_progress -- --exact
```

RED: `catalog/start` returned `method_not_found`. GREEN: the response arrives
before traversal, the initial event omits `totalFiles`, and a legitimate empty
root terminates `ready` with generation 1 and five zero counters.

### 2. Exact hierarchical ignore accounting

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol catalog_counts_root_and_nested_gitignore_pruning_without_hard_excludes -- --exact
cargo test -p arkts-index-sidecar --test ndjson_protocol catalog_honors_hierarchical_ignores_hard_excludes_and_size_policy_exactly -- --exact
```

RED: the walker hid `.gitignore` pruning and reported `ignored: 0`; its hard
directory callback was then counted twice. GREEN: an ordered incremental DFS
uses `ignore::gitignore::GitignoreBuilder` matchers inherited by directory.
Root and nested rules, hard exclusions, symlinks, regular `.ets`/`.ts` files,
and the 2 MiB policy have deterministic boundary counts.

### 3. Open-overlay exclusion before top-N

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol search_excludes_open_uris_before_ranking_and_limiting -- --exact
cargo test -p arkts-index-core --test workspace_symbols excludes_document_uris_before_ranking_and_limiting -- --exact
```

RED: excluding the URI of the first exact match still returned that match at
`limit: 1`. GREEN: `SymbolQuery` owns a deduplicated URI set and filters before
ranking and truncation, so Memory and SQLite have the same behavior. Separate
protocol tests reject empty or unbounded payloads while omitted fields preserve
legacy clients.

### 4. Deterministic responsiveness and cancellation

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol running_catalog_is_idempotent_responsive_and_cancellable_without_replacing_active_data -- --exact
```

The debug-only worker gate exposes the real race without relying on scheduler
luck. RED first allocated generation 1 after refresh had already committed
generation 1. After generation allocation was fixed, cancellation could still
lose to an already queued completion (or report `cancelled: false`). GREEN:
duplicate start and search respond under 200 ms, search serves the old snapshot,
and accepted cancellation always terminates `cancelled` at the prior generation.

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol completed_catalog_replaces_the_active_generation_atomically -- --exact
cargo test -p arkts-index-sidecar --test ndjson_protocol failed_catalog_worker_keeps_the_prior_active_generation -- --exact
```

These acceptance tests prove the complementary paths: a successful worker
performs one full-catalog SQLite transaction, while traversal failure performs
no activation. Persisted rejection coverage is also restored after restart.

### 5. Review hardening: serialized writers and nonblocking activation

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol initialize_cannot_replace_workspace_while_a_catalog_worker_is_active -- --exact
cargo test -p arkts-index-sidecar --test ndjson_protocol refresh_cannot_race_the_catalog_generation_writer -- --exact
```

RED: a second initialize replaced the runtime while the old worker remained
eligible to activate, and refresh could commit the generation reserved by a
running catalog. GREEN returns `busy` for both competing writers. This prevents
cross-workspace cache corruption and invalid-generation races without blocking
search, status, or cancel.

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol catalog_symbol_uris_share_the_canonical_initialized_workspace_identity -- --exact
```

RED: an initialized root containing `nested/..` produced symbol URIs with that
alias while `workspaceIdentity` used the canonical path. GREEN canonicalizes
at initialize and gives the same root to cache identity and catalog scan.

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol sqlite_activation_does_not_block_status_or_search_on_the_protocol_loop -- --exact
```

RED: discovery jumped directly to a terminal event because full replacement
ran synchronously on the stdin loop. GREEN moves activation to the worker on a
separate WAL connection. A deterministic activation gate observes
`phase: activating`; status and old-generation search respond under 200 ms,
then the atomic commit becomes visible as the new generation.

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol directory_entries_stream_progress_and_honor_cancellation_mid_scan -- --exact
cargo test -p arkts-index-sidecar --test ndjson_protocol malformed_gitignore_rule_does_not_discard_valid_rules_or_healthy_sources -- --exact
```

RED: whole-directory collection let the worker reach activation before a
mid-scan cancel, and one invalid ignore rule aborted generation 0. GREEN
consumes `ReadDir` entry by entry with cancellation/progress checks and keeps
valid patterns from a partially malformed `.gitignore`; the catalog commits
healthy sources while reporting the damaged rule as degraded coverage.

### 6. Pinned real-project performance and query quality

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates -- --exact
```

RED: the 455-file `nim-uikit-harmony` fixture took roughly 6 seconds, then 7
seconds under instrumentation, against the 3-second cold gate. The core was
rescanning the entire source prefix for every symbol position (quadratic in a
large file). GREEN builds one line index per document and uses logarithmic line
lookup. Files are read only by the scanner and parsed four ways within bounded
64-file/1 MiB batches; only symbol snapshots survive a batch. Final activation
batches at most 64 documents and 256 symbols per SQL statement inside the same
transaction. The ordinary debug gate is now below 3 seconds and exact/acronym
queries deterministically find `ChatBaseViewModel`, `CBVM`, `ChatP2PPage`, and
`BuildProfile`. If the pinned local fixture is absent, the test skips unless
`ARKTS_INDEX_REAL_FIXTURE` was explicitly set.

## Final verification

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace --release
```

Results: formatting clean; clippy completed with zero warnings; all 35 Rust
behavior tests passed (core 5, SQLite 9, sidecar 21), including the ordinary
10k-symbol query-plan and 455-file real-project gates; the optimized workspace
build completed successfully.
