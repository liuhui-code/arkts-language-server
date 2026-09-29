# R-10 validated class-binding storage snapshot

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; previous edits preserved.
Follows [fresh-source discovery](references-class-base-bindings.md).

## Public boundary

`WorkspaceIndex::class_binding_snapshot(&[String])` returns requested URI rows
in input order with one `served_generation`. Each row contains optional
heritage, optional source-validation provenance and lexical named bindings.
At most 128 unique nonempty URIs; an empty query is permitted. This bounds
document count, not source size or a compiler memory budget.

Fresh parsing validates the narrow named-import/explicit-re-export subset
against source tokens and raw header gaps. Direct class export ranges come
from actual identifier tokens and heritage spans, not old export metadata.
Unsupported source keeps a false marker and empty exported ranges. Missing
or migrated provenance is `None`; both states suppress snapshot bindings.
Neither is evidence of no references. Existing symbol/reference searches
keep their old metadata contract.

Snapshot bindings are spelling/kind only: query-time source resolution,
resolved URI and external identity are reset, matching SQLite persistence.
Provenance ranges must be unique, unambiguous and in heritage order. Store
validation is structural, not a new ArkTS TypeChecker or identity authority.

SQLite reuses `reference_bindings` and class rows in the same workspace DB.
Nullable document provenance and direct-export flags upgrade 10→11 / 110→111;
old bindings are not backfilled into validated facts. Heritage and bindings
are written with the existing incremental/full catalog generation transaction.
A Deferred read establishes the generation snapshot before any document reads.

**No sidecar protocol, planner, candidate exclusion, SDK, defaults, Worker or
memory-policy change.** Open-overlay admission and consuming the snapshot in
the binding resolver remain separate prerequisites. Compiler-backed inherited/
factory/own-constructor coverage and exact differential are still mandatory.

## RED → GREEN evidence

- `cargo test -p arkts-index-sqlite --test class_binding_snapshot`: missing
  public method, compilation exit 101; add MemoryStore/SQLite snapshot API.
- `cargo test -p arkts-index-sqlite --test class_binding_migration` (both
  profiles): actual persisted version 10/110 instead of 11/111, exit 101;
  migrate under a write lock and recheck queued opens without downgrading.
- Snapshot `noncanonical` test: reversed export ranges activated generation 2;
  reject noncanonical/duplicate exported ranges before commit.
- Snapshot `snapshots_expose` test: MemoryStore exposed transient `Unique`
  resolution not present after SQLite reopen; normalize only the new snapshot.

Public characterization covers reopen, missing/unsupported/legacy source,
UTF-16 export spans, bounded input, invalid metadata, rollback/rejection/removal,
and a concurrent WAL commit between generation capture and document reads.
No private server substitute is used for public LSP behavior.

## GREEN extraction and scalability

Existing public tests protected relative binding URI helpers, SQLite catalog
insertion and migration-test extraction. Oversized parent files shrink; new
modules/tests remain ≤500 physical lines. Remaining debt is reported separately.

The existing 5,000-export public fixture caught repeated per-class whole-source
tokenization (store suite 87.07 s). Export token positions and range membership
are now built once per document; the same public outputs must remain GREEN.
This fixes an introduced catalog cost, not references latency architecture.

Final GREEN: Rust workspace128 PASS/1 existing ignored release fixture;
experimental snapshot/heritage/migration/layout19/19; release/check/build;
actual child-process stdio9/9. Store22/22 in2.91s, 5,000-export focused test
in0.48s. Core/SQLite/store-test parents shrink to1,603/1,743/1,524 but remain
debt; new snapshot module113, snapshot tests399, migration78/test199 lines.

[Same-build fixed Settings/API24 smoke](../reports/2026-09-27-settings-class-binding-snapshot.md):
267 exact, normal diagnostics, 53.336s; sampled Node840,290,304 bytes and
tree883,437,568 bytes. Node peak is21.5% above the prior single smoke; no
memory no-regression or latency graduation is claimed. Cold≤500ms remainsFAIL.
No new whole-fast gate, commit/push/merge.
