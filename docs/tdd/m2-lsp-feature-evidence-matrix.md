# M2 LSP feature evidence matrix TDD evidence

- Parent revision: `f85af75b624257877275cd9281cef1ff787758a0`
- Scope: machine-readable alignment between the public capability contract and
  existing protocol, bundle, and installed-artifact evidence
- Public API: `validateLspFeatureMatrix({ root, matrix, capabilityContract, layerManifest })`

## RED: the contract had no feature-level evidence audit

Command:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

The new public-boundary test could not load the missing matrix/validator:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'tests/support/lsp-feature-matrix.mjs'
```

The existing capability contract could prove the shape advertised by
`initialize`, and the layer manifest could classify tests, but neither artifact
connected those facts feature by feature.

## GREEN: validate the current feature/evidence contract

The minimal matrix now records eight enabled features and four planned
features. The validator checks that:

- every required and absent capability path is represented exactly once;
- enabled features do not claim absent capabilities and have bundle evidence;
- enabled request features also have protocol evidence;
- planned features remain mapped to capabilities the contract requires to be
  absent;
- every evidence path exists and belongs to its declared test layer; and
- artifact coverage is explicit: either an artifact-e2e path or a non-empty
  `artifactGap` is required.

Artifact coverage is intentionally informational in M2. Only
`workspace-symbol` currently names installed-artifact evidence; the other
eleven entries expose their gap without failing the matrix solely because that
layer is incomplete.

Command:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

Result: `1/1` passed, `0` failed, `0` skipped.

## RED/GREEN: reject stale or meaningless evidence

A second public-boundary test tampers with a cloned matrix. Missing bundle
evidence, a protocol path classified as bundle-e2e, and an enabled feature
mapped to an absent capability were already rejected. A whitespace-only
artifact gap was incorrectly accepted:

```text
Missing expected exception: empty artifact gap
```

The validator now treats a gap as meaningful only when its trimmed text is
non-empty. The same test proves all four drift cases are rejected.

Final focused command:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

Result: `2/2` passed, `0` failed, `0` skipped.

## Gate integration

The coordinating integration run first executed the new feature-matrix test
beside the live layer-manifest audit. The matrix passed, while the manifest
failed with:

```text
tests/lsp-feature-matrix.test.mjs: discovered test has no layer
```

The entry is now classified once in `unit-contract`; the live audit contains
34 executable entries, including 17 unit/contract entries.
