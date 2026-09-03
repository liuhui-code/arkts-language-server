# R1 references depth

- Parent revision: `423817a734ace41e2e3e246d14f17f3396e673b9`
- Public boundary: production `dist/server.cjs --stdio`, LSP `initialize` and
  `textDocument/references`
- Fixture: `fixtures/semantic/references-depth/`
- Test: `tests/semantic/references-depth.test.mjs`

## Contract

- Only `Consumer.ets` is opened; the barrel and canonical ArkTS `struct` source
  remain unopened.
- A reference request issued after an emoji uses an exact UTF-16 position.
- `includeDeclaration: false` returns the barrel export, consumer import, and
  all semantic usages, while excluding both the canonical declaration and a
  same-name local shadow.
- `includeDeclaration: true` adds exactly the canonical source declaration.
- Every result has its full, non-empty identifier range, is deduplicated, and
  is ordered deterministically by URI then range.

## RED

Commands:

```text
pnpm build
node --test tests/semantic/references-depth.test.mjs
```

Observed: `1` test failed and `0` passed. The aggregate public-boundary
assertion received no `referencesProvider` capability, and both
`textDocument/references` requests returned JSON-RPC `-32601` with
`Unhandled method textDocument/references`. This is the intended RED: the
production bundle has neither advertised capability nor a request handler.

## GREEN

Pending production implementation. This slice intentionally stops at RED.
