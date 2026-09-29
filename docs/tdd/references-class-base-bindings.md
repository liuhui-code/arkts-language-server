# R-10 fresh-source class-base discovery

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; existing work preserved.
This follows [heritage persistence](references-class-heritage-storage.md).

## Public contract and intentionally narrow scope

`resolve_class_base_binding(&[Document], uri, class_name_position)` consumes
one immutable, caller-supplied source set. Its result is discovery provenance,
**not** ArkTS binding validity, constructor identity, or reference completeness:

- `NoBase`: a supported named class has no explicit base spelling.
- `Resolved`: unique supported local class or named import/explicit re-export
  chain reaches a named class; URI, UTF-16 name range and sorted support URIs.
- `Unknown`: absent/partial/ambiguous/unsupported source, duplicate URI input,
  alias cycle or exhausted 32-step traversal. Never a partial chain success.

The subset supports named imports with aliases, explicit source re-exports
with aliases, relative source paths, named direct class exports and same-file
bases. It rejects default/mixed/namespace/star/local-export-list/type/lazy
forms, external packages, escaped specifiers and unmodeled top-level nonclass
bindings. This intentionally rejects even an unrelated top-level value rather
than assuming missing old index metadata proves no shadowing.

Old `ReferenceBinding` records erase type/lazy and raw source syntax. The
scanner also drops numbers, and old direct-export recognition accepts quoted
modifier text. Therefore persisted bindings alone are not safe inputs for
the new discovery step. This slice validates fresh source before using the
existing relative-URI resolver. Actual identifier tokens and heritage spans
establish direct-export provenance, not legacy export metadata.

No SQLite schema/protocol/planner or references default changes. A future
generation-bound binding snapshot needs lossless validated provenance and
overlay admission. Final compiler confirmation remains mandatory. Do not
wire this API into candidate exclusion merely because it returns `Resolved`.

## RED → GREEN through the public API

Command: `cargo test -p arkts-index-core --test class_base_bindings`.

1. Missing public API failed compilation (101); implement same-file discovery.
2. Two re-export aliases returned `Unknown` instead of the unique base; add
   bounded inward alias traversal. Correct the expected support ordering to
   the specified sorted URI set before claiming GREEN.
3. `import { Base 123 as Alias } ...` falsely resolved after numeric tokens
   were dropped; validate named-header source gaps and supported token kinds.
4. Conflicting duplicate source URI selected the first document; require one
   source snapshot per traversed URI.
5. A top-level `const Alias` shadow was ignored; reject unmodeled nonclass
   declaration scope instead of treating incomplete metadata as complete.
6. Numeric suffix/prefix and quoted `}`/`;` fabricated header boundaries;
   validate raw trivia, actual punctuation and EOF tails.
7. `export lazy { ... }` falsely resolved; reject unsupported export prefixes.
8. A string containing `export` made an unexported class look exported;
   validate direct-export provenance against real tokens and declaration span.
9. An unexported duplicate class was ignored next to an exported class;
   reject duplicate local classes/import collisions before terminal selection.

Additional GREEN characterization: missing/ambiguous relative sources,
duplicate imports, local/import collisions, nonexported terminals, package/
default/namespace imports, alias cycles/budget, comments/CRLF/percent-encoded
URI paths, non-BMP UTF-16 offsets and partial/malformed heritage.
Test syntax mistakes are not counted as behavior RED evidence.

## Cohesive extraction and verification

Before edits: existing core/SQLite public characterization **78 PASS**.
Core **35/35 PASS** before/after moving unchanged symbol ranking into its
ownership module. Core lib shrinks **1,683→1,630** lines, still migration debt.
New files: resolver 167, syntax guard 183, ranking 59, public tests 367; all ≤500.

- New discovery tests: **12/12 PASS**.
- Rust workspace: **117 PASS**, **1 existing ignored release fixture**, no fail.
- Release sidecar, `pnpm check` / `pnpm build`, format and diff checks: PASS.
- Real child-process framed stdio: **9/9 PASS**, 52,047.547 ms suite duration.
  This is not a Settings request latency or a new whole-fast gate.

Fixed Settings/API24 evidence is tracked in the
[base-binding report](../reports/2026-09-27-settings-class-base-bindings.md).
The previous 1,000-test fast gate belongs to the earlier coverage build.
No commit/push/merge is requested or performed.

Still open: generation-bound binding snapshot integration, compiler-backed
constructor coverage (`super`, transitive `new Leaf`, static `new this()`,
own-constructor boundaries), exact differential before narrowing, cold/edit
≤500 ms, original >3 GB reproduction and final memory graduation.

Follow-up: [validated storage snapshot](references-class-binding-snapshot.md)
now persists/reads provenance, heritage and lexical bindings in one generation.
It does not yet integrate current overlays or replace this resolver's immutable
source input. Those admission/consumer steps and compiler proof remain open.
