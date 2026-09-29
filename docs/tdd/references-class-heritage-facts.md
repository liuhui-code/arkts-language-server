# R-10 class-heritage facts: standalone lexical prerequisite

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Branch: `codex/references-f2-fixed-benchmark`. Existing dirty work is preserved.

## Contract and ownership

`arkts_index_core::parse_document_class_heritage(&Document)` exposes named
top-level class spelling, UTF-16 name/source ranges, and optional simple base
identifier spelling. An import alias stays an alias; this API does not resolve
it to a declaration identity. It does not find constructor references or claim
that an own constructor stops compiler inheritance search.

`lexically_complete` only describes the supported lexical subset. Even `true`
is not valid-ArkTS, binding, constructor, candidate, or reference completeness
proof. `false` may retain partial discovery facts; they cannot exclude files.
Malformed tokenization/delimiters return an error instead of partial evidence.

The API is deliberately separate from `DocumentSymbols`: production catalog,
SQLite schema/reopen, sidecar protocol, planner and compiler selection do not
consume these facts. Persisting a new `DocumentSymbols` field without matching
SQLite writes/reads would lose it on reopen. No production narrowing is added.

## RED / GREEN vertical slices

Command: `cargo test -p arkts-index-core --test class_heritage`.

1. Missing public API: unresolved import, exit 101. Add the smallest metadata
   module and export; named classes, local alias spelling and ranges pass.
2. Template interpolation: `${class Hidden extends Base {}}` was silently
   skipped and incorrectly certified complete. Add scanner-origin uncertainty.
3. Dropped numeric header/modifier tokens: `class A extends Base 123 {}` and
   `export 123 class A {}` incorrectly formed supported declarations. Require
   raw source gaps in headers and modifier prefixes to contain only trivia.
4. Independent review: newline `new class`, decorators, and CR/Unicode
   line-comment handling supplied additional RED cases. Expression prefixes
   reject declaration admission; unsupported lexical forms withhold completeness.

Characterization guards cover dynamic/qualified/generic heritage, implements,
anonymous/nested classes, strings/comments, regex/division ambiguity, escaped
identifiers, non-BMP UTF-16 positions, normal CRLF and malformed delimiters.
Final public metadata suite: **10/10 PASS**.

## Extraction characterization

Before moving the shared tokenizer and line index out of oversized `lib.rs`,
`cargo test -p arkts-index-core` passed all existing **25/25** tests. After the
extraction those tests remain GREEN. Legacy `tokenize` calls `scan(source,
false)` and preserves emitted tokens, offsets, regex state and error handling.
Only the new API opts into conservative scanning observations. No second
production semantic parser or compiler truth is introduced.

Final physical lines: `lib.rs` 1,973 (down from 2,224; remaining migration debt),
`class_heritage.rs` 213, `tokenizer.rs` 262, `line_index.rs` 29, new test 191.
The existing 1,076-line `workspace_symbols.rs` is unchanged.

## Verification

- Core: **35/35 PASS** (25 existing + 10 metadata).
- `cargo test --workspace`: **96 PASS**, **1 existing ignored release fixture**,
  zero failures. This is not the missing large-project release gate.
- `cargo build --release -p arkts-index-sidecar`: PASS.
- `pnpm check` and `pnpm build`, Node 26.3.0: PASS.
- Real child-process stdio LSP: production index + full-search coverage +
  conservative semantic-unit suites: **9/9 PASS**, zero skips/failures.
- `cargo fmt --all -- --check`, `git diff --check`: PASS.

This slice did not rerun the full 1,000-test fast suite. Its preceding passing
result belongs to the earlier coverage implementation, not a fresh gate here.
No commit, push, merge, semantic defaults, worker count or memory policy change.

## Remaining gates

Index/SQLite persistence, unique binding/alias/re-export resolution,
compiler-backed constructor completeness (including inherited `super`,
transitive `new Leaf`, `new this()` and own-constructor boundaries), and
public exact differential must pass before these facts affect admission.
Settings cold/edit ≤500 ms, original >3 GB reproducer and final memory
graduation are still open. See the [Settings read-only check](../reports/2026-09-27-settings-class-heritage-facts.md).

Follow-up: the [generation/storage slice](references-class-heritage-storage.md)
now integrates optional facts into DocumentSymbols and MemoryStore/SQLite
transactional persistence with schema 10/110 and lossless reopen. The standalone
status above describes this earlier slice. Persistence is closed; binding and
compiler constructor proof are still required before candidate exclusion.
