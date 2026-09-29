# Reference row-count trace

Parent revision: `b2ec8e065515e7182dfc79ba0d0ff615c9791612`.

This is a default-off observation slice of the existing SQLite catalog
activation trace. For each successfully committed catalog generation, the
opt-in NDJSON record should report four integer counts alongside the existing
durations: `insertOccurrenceRows`, `insertOccurrenceIdentityRows`,
`insertAliasRows`, and `insertBindingRows`. The counts describe rows actually
inserted into the four reference tables, not candidate files or final LSP
Locations. No source text, URI or path belongs in the trace.

## RED

The public integration test calls `WorkspaceIndex<SqliteStore>::activate_catalog`
through a child process. Its parsed ArkTS fixture has repeated occurrences of
one identity, 257 additional distinct names, at least one alias and at least
one binding. The fixture crosses a full 256-row identity batch and leaves a
remainder, so both write paths contribute to the expected count. Generation 2 adds an
occurrence without adding an identity. The test reopens each committed
generation and queries reference candidates, rejects a stale generation, and
requires only two trace records with counts matching the parsed documents.
It also verifies that the trace remains absent by default.

At the parent production behavior, the focused command exits **101** because
the committed record lacks `insertOccurrenceRows` (after correcting an initial
fixture assertion that accidentally added a new variable identity):

```sh
cargo test -p arkts-index-sqlite --test catalog_reference_row_counts -- --nocapture
```

Expected GREEN requires exact row counts without changing SQLite transaction
boundaries, schema, durability, index semantics or reference completeness.
The test does not use private tables to verify behavior; it observes the public
catalog activation and reference-candidate query contracts plus the opt-in
trace output.

## GREEN

The focused row-count and existing activation-trace integration tests both
pass (4/4). Counters use the affected-row result of successful SQLite INSERTs;
the observer writes them only after the catalog transaction commits. The
existing ordered-field assertion was extended to include the four counters.
The fixture verifies repeated occurrences do not inflate distinct identities
and covers both the full-batch and remainder writes.
