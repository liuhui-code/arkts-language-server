# C2 index review hardening: TDD evidence

Parent revision: `210e81fe43bd3f49c00010b855eb599023835086`

This follow-up closes five review findings at the public `WorkspaceIndex`,
`SqliteStore`, and sidecar NDJSON boundaries. The deterministic concurrency
tests use debug-only barriers at the two otherwise unobservable race windows;
they do not use sleeps or probabilistic scheduling.

## 1. Unresolved malformed URIs remain partial

```text
cargo test -p arkts-index-sqlite --test store_contract -- unresolved_malformed_uri_stays_degraded_until_fixed_or_removed_across_restart --exact
```

RED: after reopening the database, an unrelated healthy generation returned
`Ready` instead of `Degraded`. GREEN: schema v2 persists unresolved URI keys;
healthy replacements and explicit removals clear only their own key. Healthy
and no-op generations cannot erase another URI's rejection.

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol -- sidecar_restores_unresolved_rejections_and_only_clears_them_by_uri --exact
```

RED: restart reported `rejectedCount: 0`. GREEN: initialize restores the
persisted count, the next unrelated refresh remains `degraded`/`partial`, and
removing the rejected URI returns the index to `ready`.

## 2. Generation monotonicity is serialized with the write

```text
cargo test -p arkts-index-sqlite --test store_contract -- older_generation_cannot_commit_after_a_newer_connection_commits --exact
```

RED: connection A read generation 0, paused, connection B committed generation
2, then A committed generation 1. GREEN: the fast preflight remains, but the
authoritative generation check is repeated after `BEGIN IMMEDIATE`; A now
returns `InvalidGeneration` and generation 2 remains intact.

## 3. Search rows and generation share one WAL snapshot

```text
cargo test -p arkts-index-sqlite --test store_contract -- search_items_and_served_generation_share_one_snapshot_during_concurrent_commit --exact
```

RED: a reader returned generation-1 rows with `servedGeneration: 2` after a
writer committed between the two reads. GREEN: `Transaction::new_unchecked`
starts one deferred read transaction on `&Connection`; candidate rows and
metadata now come from the same snapshot while WAL still permits the writer to
commit.

## 4. Sidecar JSON has an exact optional-field contract

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol -- search_omits_absent_container_name_and_matches_the_exact_protocol_shape --exact
```

RED: a top-level class serialized `"containerName": null`. GREEN: the key is
omitted when the core value is `None` and retained for contained methods. The
test compares the complete protocol response rather than selected fields.

## 5. Indexed workspace search at scale

```text
cargo test -p arkts-index-sqlite --test store_contract -- long_substring_search_uses_indexed_trigrams_at_workspace_scale --exact
```

RED first exposed the leading-wildcard plan. A hand-written trigram posting
prototype then exceeded 60 seconds while indexing the 10k-symbol gate, so it
was rejected. GREEN uses bundled SQLite FTS5's trigram tokenizer, synchronized
atomically from the symbols table by triggers. The public gate indexes 10,001
symbols across 100 documents in about three seconds and asserts that
`EXPLAIN QUERY PLAN` uses the FTS virtual-table index with no symbol-table scan,
temporary B-tree, or materialization. Rust still applies the stable exact,
prefix, acronym, and substring ranking.

```text
cargo test -p arkts-index-sqlite --test store_contract -- one_and_two_character_queries_use_bounded_prefix_and_acronym_indexes --exact
```

RED: `Ai` returned broad substring matches (`DomainAi` and `MainPage`). GREEN:
empty queries return no candidates; one- and two-character queries use only
indexed name-prefix and acronym-prefix ranges. Substring matching begins at
three characters. Memory and SQLite stores share this policy.

Schema/cache namespace advanced from v1 to v2, so generated v1 caches are not
opened under the new contract and can be rebuilt safely.

## Final verification

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Results: formatting clean, clippy zero warnings, and 18 Rust behavior tests
passed (core 4, SQLite 9, sidecar 5). The 10,001-symbol query-plan gate is part
of the ordinary workspace test run.
