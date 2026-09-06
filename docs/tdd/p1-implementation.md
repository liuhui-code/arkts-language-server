# P1 `textDocument/implementation`: TDD evidence

## Scope and parent

- Parent revision: `94eb5ae7e4cc04536247c329024ed37d90f4eb6a`
- Public boundary: a real bundled child process over Content-Length framed stdio.
- Contract: an opened ArkTS interface or abstract-class declaration resolves to
  only its concrete implementation name range in an unopened workspace file.

## Tracer-bullet RED

```text
pnpm build && node --test \
  --test-name-pattern='returns the exact unopened implementation of an ArkTS interface' \
  tests/lsp-transcript.test.mjs

error: {"code":-32601,"message":"Unhandled method textDocument/implementation"}
```

The minimal implementation added the editor-neutral semantic port, used
TypeScript 5.9 `getImplementationAtPosition`, reused the existing lazy-snapshot
and ArkTS source-map location mapper, and ran through the workspace-scoped
freshness lane. The interface tracer then passed.

## Abstract declaration RED to GREEN

Adding the abstract-class assertion exposed a meaningful provider difference:
TypeScript returned both the abstract declaration itself and the concrete
subclass. The public transcript expected only concrete implementation targets.

```text
actual: NavigationContracts.ets#Validator,
        NavigationImplementations.ets#RequiredValidator
expected: NavigationImplementations.ets#RequiredValidator
```

The fix reuses the existing canonical definition span identity to filter the
queried declaration. The combined interface/abstract transcript then passed
with exact unopened ranges.

## Reliability and immutable artifact evidence

Adding `implementation` to the shared real-process reliability table was
characterization rather than a fabricated RED; the common request runner
already supplied cancellation, document freshness, and shutdown behavior.

```text
node --test \
  --test-name-pattern='maps cancellation for every advertised semantic request|drops stale results for every advertised semantic request|rejects every advertised semantic request after shutdown' \
  tests/lsp-semantic-request-reliability.test.mjs

3 passed, 0 failed
```

Before capability advertisement, the portable artifact passed exact interface
and abstract-class queries against unopened implementation files:

```text
node --test \
  --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' \
  tests/release/portable-install.acceptance.mjs

1 passed, 0 failed
```

## Advertisement RED to GREEN

Raising the capability/evidence expectations before advertising produced only
the intended failures: missing `implementationProvider`, missing feature owner,
and an unbound artifact claim. Advertising the provider and adding the exact
protocol/bundle/artifact feature record resolved all three.

```text
node --test tests/lsp-capability-contract.test.mjs tests/lsp-feature-matrix.test.mjs

RED: 19 passed, 3 failed
GREEN: 22 passed, 0 failed
```

Final focused verification passed `pnpm check`, public implementation transcript
(1/1), reliability transcripts (3/3), corpus contracts (13/13), and immutable
artifact acceptance (1/1). The integration owner runs the full gate after
parallel release/performance work settles.

## Remaining risks

- Implementation search requests a complete bounded workspace membership, but
  the current `Location[]` contract cannot distinguish a legitimately empty
  result from a partial membership result.
- TypeScript navigation still runs synchronously in the main LSP process; real
  provider cancellation and large-workspace latency remain performance work.
- Rich `DefinitionLink` origin/selection ranges are outside this slice.
