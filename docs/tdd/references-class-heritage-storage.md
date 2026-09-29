# R-10 class-heritage generation and reopen contract

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Branch: `codex/references-f2-fixed-benchmark`; existing dirty work preserved.
This continues the [standalone lexical prerequisite](references-class-heritage-facts.md),
not constructor candidate narrowing or a new semantic owner.

## Public contract

`DocumentSymbols.class_heritage: Option<DocumentClassHeritage>` is populated
after successful legacy symbol discovery. Independent heritage failure gives
`None`, not a newly rejected source. `WorkspaceIndex::class_heritage(uri)`
returns optional facts and `served_generation` through the shared store API.

- `None`: unknown/unavailable, including old migrated documents and absent URIs.
- `Some` with `lexically_complete=false`: partial lexical facts, never exclusion proof.
- `Some` with complete flag and no classes: known-empty supported lexical subset,
  **not** proof of valid ArkTS or no constructor references.

MemoryStore and SQLite preserve class order, exact spelling (including alias
spelling), optional base and UTF-16 name/declaration/base ranges. Facts commit
inside the existing incremental/full-catalog generation transaction. Reads
bind metadata and facts to one SQLite read snapshot. Replacement, rejection,
deletion and failed commit cannot expose a stale or mixed-generation fact set.
Structural validation checks document identity and nonempty contained ranges;
it is not a name binder, parser-validity check or compiler identity proof.

Production schema **9→10**, experimental occurrence layout **109→110**, in
the same database lifecycle. Old markers remain NULL until refresh; no
backfill inferred from symbols. Foreign profiles remain incompatible.
Protocol/planner/default SDK/strategy/worker count/memory policy are unchanged.

## RED → GREEN

Command: `cargo test -p arkts-index-sqlite --test class_heritage_contract`.

1. Public roundtrip failed to compile (exit 101): `WorkspaceIndex::class_heritage`
   missing. Add optional document facts, store API and transactional write/read;
   MemoryStore/SQLite/reopen agree.
2. Invalid name range outside its declaration was accepted and activated
   generation 2 (exit 101). Add shared structural validation before commit and
   after SQLite reconstruction; both stores retain valid generation 1.

Command: `cargo test -p arkts-index-sqlite --test class_heritage_migration`.

3. Two queued opens of a genuine old-format cache hit
   `duplicate column name: heritage_lexically_complete` (exit 101). Recheck
   version/application identity and marker **inside** the Immediate migration
   transaction. Both queued opens now succeed across four independent fixtures.

Additional public characterization: partial vs unknown vs known-empty;
replacement/rejection/removal; full catalog with 120 ordered classes; injected
pre-commit failure and reopen/retry; independently unavailable heritage leaves
legacy symbol search intact; old-format migration retains symbols/exports;
both previous/current foreign layout versions rejected without mutation.

## Extraction while GREEN

Existing core/SQLite baseline: **69 PASS**. Existing SQLite store-contract
suite: **24/24 PASS** before and after cohesive extraction. MemoryStore moves
to its own ownership module; schema dispatch/migrations move to a migration
module; tests share the same temporary-directory fixture.

Physical lines before this slice → after:

| Existing debt | Lines |
| --- | ---: |
| `index-core/src/lib.rs` | 1,973 → 1,683 |
| `index-sqlite/src/lib.rs` | 2,140 → 1,856 |
| `index-sqlite/tests/store_contract.rs` | 1,671 → 1,647 |

These remain over-limit migration debt. New source/test modules are all ≤500:
MemoryStore 331, heritage API/validation 249, storage 157, migrations 373,
contract tests 275, migration tests 103, shared fixture 31.

## Verification and unclosed gates

- `cargo test --workspace`: **105 PASS**, **1 existing ignored release fixture**,
  zero failures. Not the missing >3 GB or large-project release gate.
- Experimental profile: metadata 7 + migration 2 + foreign-layout 1 = **10 PASS**.
- Relevant release sidecar build, `pnpm check`, `pnpm build`: PASS.
- Actual child-process framed stdio suites: **9/9 PASS**, 51,655.721 ms.
- Formatting and diff whitespace checks: PASS.

Same-build real Settings/API24 replay and child-process stdio results are
recorded in the [storage report](../reports/2026-09-27-settings-class-heritage-storage.md).
No new whole `pnpm check:fast` claim: the previous 1,000-test result belongs
to the earlier compiler-search coverage implementation. No merge requested.

This closes persistence/generation/reopen only. Unique base binding,
alias/re-export resolution, compiler-backed constructor completeness
(`super`, transitive `new Leaf`, static `new this()`, own-constructor barriers),
public exact differential, cold/edit ≤500 ms and final memory gates remain open.
No commit/push/merge, result truncation or constructor exclusion is added.
