# C2 persistent index and headless sidecar: TDD evidence

Parent revision: `548e649369ce421b2c4bfb3ec75cbd617a3ec263`

## Delivered boundary

- `arkts-index-core` owns parsing, search normalization/ranking, generations,
  and the fallible atomic `SymbolStore` contract.
- `arkts-index-sqlite` owns the new schema and synchronous SQLite connection.
  It uses `rusqlite 0.40.1` with bundled SQLite, WAL, foreign keys,
  `synchronous=NORMAL`, and a five-second busy timeout.
- `arkts-index-sidecar` is a single-writer NDJSON stdio process. Its public
  methods are `health`, `initialize`, `refresh`, `search`, `status`, and
  `shutdown`. Every request and response carries protocol version 1; stdout is
  reserved for protocol JSON and operational failures use stderr.

The cache lives below the host-provided cache directory at
`workspaces/<sha256>/symbols-v1.sqlite3`. The digest includes a namespace and
the canonical workspace file URI. The full URI is also stored in SQLite and
verified when opening the database, so a hash/path mix-up cannot expose another
workspace's symbols.

One refresh is one `BEGIN IMMEDIATE` transaction: removals, replacements,
symbols, and `committed_generation` either commit together or roll back
together. Malformed documents are converted to removals before that batch;
healthy documents still commit and the result is `degraded`/`partial`.

Corrupt-cache quarantine is intentionally deferred to the next slice. SQLite
corruption, incompatible schema/application IDs, workspace mismatch, busy,
I/O, invalid data, and invalid generation already have distinct error kinds.
An error cannot leave the running sidecar reporting `ready`.

## RED/GREEN vertical slices

### 1. Shared Memory/SQLite contract and process restart

```text
cargo test -p arkts-index-sqlite --test store_contract -- memory_and_sqlite_implement_the_same_store_contract_and_sqlite_reopens
```

RED, exit 101: `IndexState`, the generation-aware result API, and
`SqliteStore` did not exist. GREEN: both stores produced identical acronym
search ordering and metadata; after dropping and reopening SQLite, method URI,
kind, container, UTF-16 range, and generation 1 remained available.

The four existing C1 public tests were adapted to the fallible generation API
and remained GREEN.

### 2. Atomic generation rollback

```text
cargo test -p arkts-index-sqlite --test store_contract -- failed_generation_rolls_back_the_entire_sqlite_batch
```

RED, exit 101: no public debug-only pre-commit failpoint existed. GREEN: a
failure after all generation-2 writes and metadata update but before commit
rolled back on transaction drop; reopening returned complete generation 1 and
no generation-2 symbols.

### 3. Malformed-file isolation

```text
cargo test -p arkts-index-sqlite --test store_contract -- malformed_document_is_isolated_while_the_degraded_generation_commits
```

RED: the parser accepted a file with balanced braces but an unclosed method
parenthesis, reporting two indexed documents instead of one. GREEN: delimiter
validation rejected that document, removed its previous valid snapshot, and
persisted the healthy document as degraded generation 2.

### 4. Canonical cache key and identity verification

```text
cargo test -p arkts-index-sqlite --test store_contract -- canonical_workspace_cache_keys_are_stable_and_identity_is_verified
```

RED, exit 101: `workspace_cache_location` did not exist. GREEN: canonical path
aliases share one SHA-256 cache location, distinct roots do not, and opening
one database with another root's identity returns `WorkspaceMismatch`.

### 5. Real sidecar protocol and stale restart

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol -- sidecar_persists_symbols_and_restores_them_as_stale_after_restart
```

RED: the empty sidecar exited before replying. GREEN: a real child process
completed initialize, refresh, search, and shutdown; a second process restored
generation 1 and served it as `warming`/`stale`. The harness parses every
stdout line as JSON and asserts EOF immediately after the shutdown response.

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol -- protocol_mismatch_is_rejected_without_changing_the_persisted_generation
```

RED: protocol 99 was accepted (`ok: true`). GREEN: incompatible initialize and
refresh requests are rejected before dispatch; a protocol-1 process still
restored the original generation and symbol.

```text
cargo test -p arkts-index-sidecar --test ndjson_protocol -- failed_store_operation_changes_status_from_ready_to_degraded
```

RED: a failed refresh left status `ready`. GREEN: store failures now retain the
last committed generation but change status to `degraded` with `stale`
completeness.

## Final verification

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo tree --workspace
cargo build --workspace --release
pnpm check:fast
```

Results:

- Rust behavior tests: 11 passed, 0 failed (core 4, SQLite 4, sidecar 3).
- Clippy: zero warnings; release workspace build passed.
- Dependency tree contains only the three project crates plus direct
  `rusqlite`/bundled SQLite, `sha2`, `serde`, and `serde_json` dependency
  families. It contains no Tauri, ArkLine schema, ORM, Tokio, or FTS.
- Existing TypeScript/LSP/Zed gate: 13 passed, 0 failed.
- The first frontend gate attempt stopped before tests because this worktree
  lacked `node_modules`. After an offline frozen-lockfile install, one run had
  a pre-existing two-second CLI initialize timeout (12/13); the focused test
  immediately passed 3/3, and the unchanged full gate then passed 13/13.
