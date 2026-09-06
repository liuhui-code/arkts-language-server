# P1 `textDocument/typeDefinition`: TDD evidence

## Scope and parent

- Parent revision: `6a6e2aefa012d4168a45a0df3cadf8765d085ab9`
- Public boundary: a real bundled child process using Content-Length framed stdio.
- Contract: a value reference in an opened ArkTS document resolves to the exact
  type-name range in an unopened dependency; results use UTF-16 LSP positions.

## Tracer-bullet RED

The capability was not advertised and the request had no handler:

```text
pnpm build && node --test \
  --test-name-pattern='returns the exact unopened type definition for an ArkTS variable' \
  tests/lsp-transcript.test.mjs

error: {"code":-32601,"message":"Unhandled method textDocument/typeDefinition"}
```

## Incremental GREEN evidence

The smallest implementation delegates to TypeScript 5.9
`getTypeDefinitionAtPosition`, then reuses the definition target mapper for
lazy unopened snapshots, ArkTS virtual-document source ranges, and stable
deduplication.

```text
pnpm build && node --test \
  --test-name-pattern='returns the exact unopened type definition for an ArkTS variable' \
  tests/lsp-transcript.test.mjs

1 passed, 0 failed
```

Adding `typeDefinition` to the existing real-process semantic reliability
table was characterization rather than a fabricated RED: the shared request
runner already supplied the required behavior.

```text
node --test \
  --test-name-pattern='maps cancellation for every advertised semantic request|drops stale results for every advertised semantic request|rejects every advertised semantic request after shutdown' \
  tests/lsp-semantic-request-reliability.test.mjs

3 passed, 0 failed
```

Before advertising the capability, the immutable portable artifact exercised
the same value-to-unopened-type transition successfully:

```text
node --test \
  --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' \
  tests/release/portable-install.acceptance.mjs

1 passed, 0 failed
```

## Advertisement RED to GREEN

After raising the capability and feature-evidence contracts, the focused run
failed for exactly the intended reasons: `typeDefinitionProvider` was missing,
the required capability had no feature owner, and the new immutable claim was
not bound. The provider advertisement, enabled feature record, and exact
artifact claim were then added together.

```text
node --test tests/lsp-capability-contract.test.mjs tests/lsp-feature-matrix.test.mjs

RED: 19 passed, 3 failed
GREEN: 22 passed, 0 failed
```

Final focused verification also passed the corpus contract (13/13), immutable
artifact case (1/1), both ordinary/type definition transcripts (2/2), and
`pnpm check`. The integration owner will run the repository-wide
`pnpm check:fast` after the parallel release/performance slices settle.

## Remaining risks

- TypeScript language-service navigation remains synchronous on the main LSP
  process; large-workspace latency and cancellation-at-provider-boundaries are
  a later performance slice.
- The current result is `Location[]`; richer `DefinitionLink` origin/selection
  ranges are deliberately outside this basic-completeness slice.
