# E2/E3 — Installed artifact signature and document-symbol evidence

Date: 2026-09-03

Starting parent revision: `0bd947c`

The document-symbol production slice (`423817a`) landed independently while
this artifact-only slice was running. This slice does not change production
code.

## Public acceptance contract

The immutable portable artifact must prove, through its installed launcher and
Content-Length framed stdio, that it can:

- return signature help for a generic overloaded function whose declaration is
  in an unopened imported file, selecting signature 1 and parameter 1 at a
  UTF-16 position after an emoji; and
- return a stable hierarchical ArkTS document-symbol result for
  `struct ArkuiPage`, including its field and method with exact semantic kinds
  and selection ranges.

The shared conformance corpus supplies the source and marker positions. The
installed smoke opens only each query document; the imported signature
provider remains unopened.

## RED → GREEN: signature help

The installed smoke assertion was added before the corpus scenario. The
focused immutable-artifact test failed as intended:

```sh
node --test \
  --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' \
  tests/release/portable-install.acceptance.mjs

# FAIL: the installed-artifact corpus must expose signature.format-call
```

Minimal GREEN added `SignatureConsumer.ets`, its unopened `Formatter.ets`
overloads, and one point marker in `corpus.json`. The same command then passed
1/1 selected tests. The transcript also verifies the advertised trigger and
retrigger characters.

The feature-matrix expectation was changed first and failed because
`signature-help` was absent from `artifactCoveredFeatureIds`. Adding the single
immutable acceptance claim
`signature-help.artifact.immutable-unopened-overload` made the matrix GREEN and
set `artifactGap` to `null`.

## RED → GREEN: document symbols

The installed smoke assertion was added before the three document-symbol
markers. The focused artifact test failed as intended:

```text
FAIL: the installed-artifact corpus must expose the ArkUI document-symbol hierarchy
```

Minimal GREEN reused `ArkuiPage.ets` and added only root, field, and method
selection markers. The installed client declares hierarchical symbol and full
kind support, requests the same document twice, and verifies stable ordering,
`Struct(23)`, `Property(7)`, `Method(6)`, and exact UTF-16 selection ranges.

The matrix expectation then failed because `document-symbol` was absent from
`artifactCoveredFeatureIds`. Adding
`document-symbol.artifact.immutable-arkui-hierarchy` made the matrix GREEN and
set its `artifactGap` to `null`.

## Verification

```sh
node --test tests/conformance-corpus.test.mjs \
  tests/lsp-feature-matrix.test.mjs \
  tests/release/portable-install.acceptance.mjs

# 24 passed, 0 failed, 0 skipped
```

The artifact test runs with its build checkout moved and build tools forbidden,
so these transcripts exercise the copied installed bytes rather than source
files or an implicit rebuild.
