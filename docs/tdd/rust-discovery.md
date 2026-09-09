# Rust Discovery — export metadata and semantic auto-import validation

Parent revision: `68c8b51` (Memory Runtime, PR #17 merge).
Branch: `codex/rust-discovery`.

## R1 RED — persisted export discovery beyond 4096

The first vertical contract writes 5,000 exported declarations through the existing workspace catalog,
places the target at ordinal 4,999, reopens the same SQLite database, and queries it by exact prefix.
Before implementation it fails to compile because `WorkspaceIndex` has no export query and the current
schema stores only workspace-symbol rows:

```text
cargo test -p arkts-index-sqlite \
  export_discovery_persists_a_candidate_beyond_the_old_completion_scan_bound -- --exact
```

Observed RED:

```text
error[E0599]: no method named `search_exports` found for struct `WorkspaceIndex`
```

This contract deliberately does not increase the TypeScript completion scan limit. Later slices expose
the candidate through the existing sidecar and require the official semantic backend to validate it
before producing an import edit.

## R1 GREEN — one SQLite/WAL generation

`DocumentSymbols` now carries discovery-only export metadata alongside workspace symbols. Both the
memory contract store and the existing SQLite store commit the two views through one generation. The
on-disk database remains `symbols-v2.sqlite3`; schema version 3 adds the `exports` table and its folded
prefix index in place. A v2→v3 migration preserves the committed symbol generation and creates no
second database.

Focused evidence:

```text
cargo test -p arkts-index-core: 7/7 passed
cargo test -p arkts-index-sqlite: 11/11 passed
version_two_database_migrates_in_place_without_losing_committed_symbols: PASS
export_discovery_persists_a_candidate_beyond_the_old_completion_scan_bound: PASS
```

## R2 RED/GREEN — strict sidecar discovery protocol

The next contract refreshed 5,000 exports through a real sidecar process and requested
`exports/search`. RED was the expected protocol response `ok: false` because the method did not yet
exist. GREEN adds the method to the existing protocol-v1 session, strict TypeScript decoding, canonical
workspace URI rebasing, bounded results, served generation, and truthful completeness.

```text
cargo test -p arkts-index-sidecar: 21 passed, 1 release-only ignored
maps export discovery candidates from the sidecar without treating them as semantic truth: PASS
```

## R3 RED/GREEN — official semantic validation

The worker protocol first rejected the new `discovery` payload with `Invalid semantic worker request`.
After adding a strict immutable 256-candidate decoder, the production semantic proxy queries the Rust
sidecar only for non-member completion prefixes and sends bounded candidate identities to the one
semantic worker.

The official Language Service remains authoritative: a candidate is admitted only when its exported
name and module source match an official completion entry and
`getCompletionEntryDetails()` validates that entry. Completion resolve then uses the original official
entry data to produce the import edit. The existing `MAX_MODULE_EXPORT_COMPLETION_SCAN = 4096` remains
unchanged.

The true LSP test generates 4,999 filler exports followed by `ExactNeedleExport`, waits until the Rust
catalog exposes ordinal 4,999, requests completion, and resolves an import edit naming `ManyExports`:

```text
recalls and semantically validates an auto-import beyond 4096 module exports: PASS
pnpm check:fast: 867/867 passed, 0 fail/cancel/skip/todo
cargo clippy -p arkts-index-core -p arkts-index-sqlite -p arkts-index-sidecar --all-targets -- -D warnings: PASS
cargo build --release -p arkts-index-sidecar: PASS
pnpm check:release: PASS
artifact-e2e: 6/6 passed
large: 1/1 passed (cold 597.73 ms; warm first 3.90 ms; repeated P95 2.39 ms)
```

## Reproduction

```bash
cargo test -p arkts-index-core
cargo test -p arkts-index-sqlite
cargo test -p arkts-index-sidecar
node --test --test-name-pattern='beyond 4096 module exports' \
  tests/semantic/semantic-characterization.test.mjs
pnpm check:fast
```
