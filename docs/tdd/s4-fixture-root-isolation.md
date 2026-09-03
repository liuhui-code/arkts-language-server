# S4 fixture-root isolation characterization evidence

- Parent revision: `8452e0e9afdb6e133958d27f1a03263467b680ac`
- Scope: URI construction and workspace-root isolation in two existing real-process suites

## Why there is no RED

This is a test-only refactor with no behavior change. Existing public transcript
tests characterize the behavior being preserved, so the workflow is
characterization GREEN → refactor → GREEN. No failing result was fabricated.

## Characterization GREEN

Before editing:

```sh
node --test tests/lsp-transcript.test.mjs tests/lsp-document-lifecycle.test.mjs
```

Result: `7/7` passed, `0` failed, `0` skipped (about `3.33s`).

## Refactor

- Replaced the remaining hand-built `file://${...}` URIs with
  `pathToFileURL(...).href`.
- Replaced interpolated filesystem paths with `path.join(...)` before URI
  conversion.
- Changed every initialize request in these suites from the repository root to
  `fixtures/basic`, the smallest shared fixture root needed by these cases.
- Kept all LSP requests, response assertions, document text, and lifecycle
  expectations unchanged.

No temporary root was necessary, so this slice adds no cleanup lifecycle.

## Refactor GREEN

After editing, the same command passed:

```sh
node --test tests/lsp-transcript.test.mjs tests/lsp-document-lifecycle.test.mjs
```

Result: `7/7` passed, `0` failed, `0` skipped (about `3.05s`). The timing is
recorded only as an observation, not a performance claim.

Static inspection confirms neither suite contains a hand-built `file://` URI
or initializes against `pathToFileURL(projectRoot)`.
