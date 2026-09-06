# E0d — Installed umbrella verified-claims contract

Date: 2026-09-03

Parent revision: `967f026406bbf3c5613396c3390b21dfb114fa1a`

## Problem and public contract

The feature matrix names one broad portable-install test as artifact evidence
for twelve editor features. An exact file path and static `node:test` title
proves that the test exists, but previously did not prove that the imported
semantic helper executed each feature's assertions. A removed assertion block
could leave the matrix green under the same umbrella title.

The installed helper now returns structured evidence:

```text
{
  verifiedClaims: string[],
  workspaceSymbolKindUriNameRange: { actual, expected }
}
```

Each claim is appended only after its corresponding installed LSP transcript
assertions finish. The portable acceptance derives the expected claims from
the current feature matrix using the exact artifact entry and exact test title.
The two claim sets must be equal. Missing, extra, or duplicate helper claims
fail; duplicate matrix claims fail as well.

## Static/unit RED 1: no exact-set verifier

The first tracer bullet used a synthetic feature matrix and required a pure
contract that accepts an order-independent exact match while rejecting an
absent `verifiedClaims` array, a missing claim, an extra claim, and a duplicate.

```text
node --test --test-name-pattern='requires installed verifiedClaims' tests/lsp-feature-matrix.test.mjs
# 0 passed, 1 failed, 12 skipped
TypeError: featureMatrixSupport.assertExactVerifiedArtifactClaims is not a function
```

The minimal implementation filters artifact evidence by exact `(entry, test)`,
checks both arrays and duplicates, computes set differences, and returns sorted
copies for a deterministic audit result.

## Static/unit RED 2: stale rename claim

The next tracer bullet declared the twelve claims actually exercised by the
installed helper. The matrix still carried the earlier rename label:

```text
node --test --test-name-pattern='binds the installed semantic umbrella' tests/lsp-feature-matrix.test.mjs
# 0 passed, 1 failed, 13 skipped
missing: rename.artifact.immutable-versioned-alias-edits
extra: rename.artifact.immutable-versioned-alias-conflict-applied-semantic-recheck
```

The rename feature keeps one artifact claim for the one exact test, satisfying
the E0c no-relabeling rule. Its upgraded claim honestly covers the complete
installed transcript: versioned alias edits, fixed same-scope conflict
rejection, real multi-document application, versioned diagnostics, and the
definition/references identity recheck.

Focused contract GREEN:

```text
node --test --test-name-pattern='verifiedClaims|installed semantic umbrella' tests/lsp-feature-matrix.test.mjs
# 2 passed, 0 failed, 12 skipped
```

Full static/unit regression:

```text
node --test tests/lsp-feature-matrix.test.mjs
# 14 passed, 0 failed, 0 skipped

node --check tests/support/installed-semantic-smoke.mjs
node --check tests/release/portable-install.acceptance.mjs
# both passed
```

## Exact helper claims

| Feature | Claim recorded after |
| --- | --- |
| document sync | incremental overlay search, close, and restored disk symbol |
| completion | exact installed `Greeter` completion item and replacement edit |
| definition | unopened imported `Profile` resolves to its exact declaration |
| hover | documented imported alias hover and exact range |
| signature help | selected unopened overload and active parameter |
| document symbol | stable ArkUI struct/property/method hierarchy |
| workspace symbol | exact struct/property/method kinds, URI, and name ranges |
| diagnostics | versioned diagnostic publication and clearing |
| completion resolve | resolved auto-import applied, diagnosed, and defined |
| references | unopened barrel/reference set with declaration policy |
| rename | alias edits, conflict rejection, applied diagnostics and semantic identity |
| code actions | list, opaque resolve, versioned edit application, and diagnostic clear |

The helper does not return an ArkUI resource claim. Its ArkUI scenario checks
document/workspace symbols only; it does not issue `$r(...)` completion or
definition requests against a resource table.

## Verification boundary

No production, capability, package, manifest, watcher, or ArkUI resource file
is changed. Portable artifact execution is intentionally deferred until the
concurrent watcher task finishes rebuilding the shared ignored
`dist/server.cjs`; the static/unit contract does not read or write that bundle.
