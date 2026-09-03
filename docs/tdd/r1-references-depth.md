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

The editor-neutral contract now distinguishes a complete reference set from an
incomplete global query. The TypeScript engine refuses to claim completeness
unless project membership is complete, resolves the canonical declaration,
uses `findReferences` from that declaration, maps resident and lazy unopened
ArkTS snapshots back through the virtual-document source map, and fails the
whole query if any target is outside the workspace, unavailable, or
unmappable. Results are deduplicated and sorted by full location.

The first handler implementation exposed a second useful RED: it returned the
three ordinary consumer usages but omitted the barrel export and import
specifier. TypeScript returns those aliases as separate referenced-symbol
groups. Filtering every group definition therefore removed valid references.
GREEN compares only against the canonical origin returned at the query site;
barrel/import aliases remain references, while the origin is controlled solely
by `includeDeclaration`.

Commands:

```text
pnpm check
pnpm build
node --test tests/semantic/references-depth.test.mjs
# 1 passed, 0 failed, 0 skipped

node --test tests/lsp-semantic-request-reliability.test.mjs
# 4 passed, 0 failed, 0 skipped

node --test tests/lsp-capability-contract.test.mjs
# 3 passed, 0 failed, 0 skipped

node --test tests/lsp-feature-matrix.test.mjs tests/test-layer-manifest.test.mjs
# 12 passed, 0 failed, 0 skipped
```

The semantic reliability matrix now includes references cancellation and maps
a same-document supersession to LSP `ContentModified`. The capability/evidence
matrix records the bundle and protocol evidence explicitly. Immutable artifact
coverage is still a named gap, so the release-evidence fail-closed rule must not
be enabled until that transcript is added.

Remaining work is deliberately separate: cross-document/root freshness during
an in-flight global query, 300+ file cache-pressure coverage, symlink escape
hardening, overload declaration classification, and installed artifact smoke.
