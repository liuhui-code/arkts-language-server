# E1-artifact — Installed unopened hover

Date: 2026-09-03

Parent revision: `d6163e701d7b607dffdf9660083d6a7ef8a9b95c`

## Public boundary

The immutable portable installation now runs hover through the same real
`Content-Length` stdio session used for completion, definition, document
lifecycle, diagnostics, and quick fixes. The process runs from an external cwd
with an isolated HOME and without source dependencies or build tools.

At the hover step, only `OtherConsumer.ets` has been opened. The request targets
the imported `Profile` reference; `Profile.ets` remains unopened and must be
loaded through project membership. Initialize must advertise
`hoverProvider: true`.

## Tracer contract

The conformance marker is preceded by an emoji. Before sending the request, the
helper proves that the prefix contains one non-BMP character and that the
marker range is expressed in UTF-16 code units. The installed response must
have:

- markdown contents;
- exact signature `(alias) interface Profile\nimport Profile` inside the ArkTS
  fence;
- target documentation containing
  `Represents a user profile shared across ArkTS modules.`;
- the `@since 1.0.0` tag;
- the exact marker-derived reference range, not the unopened declaration range.

## RED → GREEN

The installed assertion was added before changing the corpus. The focused
immutable test produced a stable RED:

````text
Expected /Represents a user profile shared across ArkTS modules\./
received:
```arkts
(alias) interface Profile
import Profile
```
````

The signature and range checks had already passed, isolating the gap to missing
source documentation rather than cross-file resolution or UTF-16 mapping.

The minimal GREEN change adds one JSDoc block and `@since` tag above the
marker-owned `Profile` declaration. No coordinate is hand-written: the existing
materializer recalculates the shifted definition range. No production change
was required.

The feature-matrix expectation was then changed first and RED showed hover was
still absent from artifact-covered features. The hover entry now cites the
exact first portable `node:test` name with claim
`hover.artifact.immutable-markdown-typescript-arkui-sdk-builder-range` and has `artifactGap: null`. The
matrix returned to GREEN without changing any other feature entry.

## Verification

```sh
node --test --test-name-pattern='installs one verified artifact' \
  tests/release/portable-install.acceptance.mjs
# 1 passed, 0 failed, 3 skipped by filter after the corpus change

node --test tests/conformance-corpus.test.mjs \
  tests/semantic/semantic-characterization.test.mjs
# 20 passed, 0 failed

node --test tests/lsp-feature-matrix.test.mjs
# 10 passed, 0 failed

node --test tests/release/portable-install.acceptance.mjs
# 4 passed, 0 failed, 0 skipped; about 14.9 seconds in the final run

pnpm check
# exit 0
```
