# R0c-3 workspace-global query freshness

Parent revision: `8199a65a494596d5f94b72f176ed53b142b97f7b`

## Contract

- `textDocument/references`, `textDocument/prepareRename`, and
  `textDocument/rename` read a workspace-wide snapshot.
- Any opened-document lifecycle event or watched ArkTS/TypeScript source event
  in that request's workspace invalidates its result.
- A cancellation-resistant backend result is mapped to
  `ContentModified (-32801)` and cannot leak locations or a workspace edit.
- Mutations in another workspace do not invalidate the request.
- Document-scoped completion remains independent of other documents.

## TDD checklist

- [x] RED: same-workspace `didOpen` invalidates in-flight references.
- [x] GREEN: introduce explicit workspace-global request scope.
- [x] Same-workspace `didChange`, `didClose`, and watched source changes.
- [x] `prepareRename` and `rename` use the same global policy.
- [x] Other-workspace changes do not invalidate global queries.
- [x] Completion remains document-scoped.
- [x] Focused tests and `pnpm check` pass.

## Evidence

The first public-protocol RED was observed with:

```text
node --test tests/lsp-workspace-global-freshness.test.mjs
```

The cancellation-resistant scripted backend returned a stale `Location[]`
after a second document was opened in the same workspace. Subsequent vertical
slices reproduced the same leak for `didChange`, `didClose`, watched source
changes, `prepareRename`, and `rename` before their minimal GREEN changes.

The harness uses protocol-visible `window/logMessage` barrier notifications;
it contains no sleep or timing assertion. Final verification:

```text
node --test tests/lsp-workspace-global-freshness.test.mjs
# 8 passed, 0 failed

node --test --test-concurrency=1 \
  tests/lsp-reliability.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs
# 19 passed, 0 failed

node --test --test-concurrency=1 \
  tests/lsp-semantic-request-reliability.test.mjs \
  tests/lsp-workspace-symbol.test.mjs \
  tests/lsp-workspace-file-changes.test.mjs
# 15 passed, 0 failed

pnpm check
# passed
```
