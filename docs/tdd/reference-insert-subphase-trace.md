# Reference-insert subphase trace

Parent revision: `b2ec8e065515e7182dfc79ba0d0ff615c9791612`.

This observation-only slice extends the existing opt-in SQLite catalog trace.
The public `WorkspaceIndex<SqliteStore>::activate_catalog` contract, atomic
generation replacement, query results and default-off behavior remain
unchanged. The four new numeric fields immediately follow
`insertReferencesMs` in each committed-generation NDJSON record:
`insertOccurrencesMs`, `insertOccurrenceIdentitiesMs`, `insertAliasesMs` and
`insertBindingsMs`. They time the respective work inside reference insertion;
the enclosing `insertReferencesMs` also includes statement setup and other
untimed overhead, so the four fields need not sum to it exactly.

## RED → GREEN

The existing public integration test starts a fresh child process so the trace
environment variable is process-local. It commits and reopens generations 1
and 2, verifies reference candidates and the committed generation, and checks
that a rejected stale generation emits no record. The same test checks that
tracing is absent by default, each opt-in record contains only ordered,
finite, nonnegative numeric fields without paths, and an invalid trace path
does not fail catalog activation.

At the parent revision, after extending the expected fields, this command
exited 101: the child emitted the prior 15 fields rather than the required 19.

```sh
cargo test -p arkts-index-sqlite --test catalog_activation_trace -- --nocapture
```

After the observer implementation, the same command passed 2/2 tests.
An audit then found that the original two-document fixture did not execute
alias insertion. A fixture assertion first made the public child-process test
RED (`trace fixture must exercise alias insertion`). The consumer now imports
`Target as AliasTarget`; the test proves parsed aliases exist, all four
reported subphase durations are positive, and their sum is no greater than
`insertReferencesMs` plus 0.01 ms for three-decimal rounding. The focused
command returned GREEN 2/2 again. The real candidate query still returns
both document identities after each committed generation.

The test and observer do not alter SQLite durability, schema, index scope or
reference result completeness. The four numbers are phase attribution, not a
performance improvement or a claim that first-click navigation meets 500 ms.
