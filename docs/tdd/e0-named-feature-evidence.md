# E0 — Named feature evidence

Date: 2026-09-03

Parent revision: `fbe3d6f35f415da89641938f0d711acbfc78455e`

## Contract

Feature evidence schema version 2 replaces path-only entries with an exact,
reviewable record:

```js
{
  entry: "tests/lsp-reliability.test.mjs",
  test: "a newer completion request supersedes the previous request in its lane",
  claim: "completion.protocol.latest-wins",
}
```

The validator fails closed unless every record:

- has exactly the `entry`, `test`, and `claim` fields with non-empty strings;
- uses a normalized repository-relative path classified in the declared test
  layer;
- names exactly one top-level, literal test imported from `node:test` in that
  entry; and
- has a globally unique, feature-and-layer-scoped stable claim slug.

Dynamic titles, wrappers, skipped/property calls, missing titles, and duplicate
literal titles cannot satisfy the evidence contract. A single real scenario may
support more than one feature, but each feature must state its own unique claim.

## RED → GREEN

The first command was run against the parent behavior while Q4 was being
integrated concurrently:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

It was RED (`1 passed, 2 failed`). The path-only regression expected a named
evidence error, but the validator reported only the concurrent capability
drift. The absence of the expected issue showed that the old validator still
accepted the path string. After the minimal record-shape implementation and
Q4 matrix alignment, the focused path-only case was GREEN (`1 passed`, two
name-filtered cases not run).

Each remaining boundary was then added as its own public validator slice. The
initial focused runs for a renamed title, a duplicate title in one source file,
an unstable claim, a duplicate claim, an extra record field, and a path escape
all failed with `Missing expected exception`. The corresponding minimal
implementations made each focused case GREEN. The dynamic-title case was added
as a characterization of the literal-only AST lookup and was GREEN on its
first run.

## Evidence migration

Every pre-existing file reference now points to an exact current `node:test`
title and carries a feature/layer claim. References and rename remain planned
with no invented evidence. Hover, signature help, and document symbols keep
their explicit artifact gaps because no installed transcript calls those
methods yet.

Document sync, completion, definition, workspace symbols, diagnostics,
completion resolve, and code actions point to the immutable portable-install
scenario `installs one verified artifact without source dependencies or a
rebuild`. That scenario directly invokes the shared installed semantic smoke,
which exercises those protocol flows against the installed artifact. Q4 code
actions additionally cite the exact conditional capability tests, resolve
cancellation test, and versioned quick-fix list/resolve/apply transcript.

The validator proves identity, uniqueness, location, and layer. Whether a test
body semantically proves its stated claim remains an explicit code-review
boundary; the stable claim makes that review possible without pretending to
infer test meaning from source text.

## Verification

```sh
node --test tests/lsp-feature-matrix.test.mjs tests/test-layer-manifest.test.mjs
# 12 passed, 0 failed, 0 skipped

pnpm check
# exit 0
```

This slice intentionally does not reject every advertised feature that still
has an artifact gap. That policy becomes safe only after the remaining hover,
signature-help, and document-symbol installed transcripts exist.
