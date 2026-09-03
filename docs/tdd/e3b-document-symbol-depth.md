# E3b document-symbol depth and kind fidelity

Date: 2026-09-03

Parent revision: `d6163e701d7b607dffdf9660083d6a7ef8a9b95c`

## Scope of this slice

This first E3b tracer exercises the production Content-Length stdio server with
hierarchical document-symbol support and all LSP `SymbolKind` values enabled.
The ArkTS fixture is designed to cover every current
`SemanticDocumentSymbolKind`:

- `module`, `interface`, `enum`, and `enumMember`;
- `class`, `property`, `constructor`, and `method` in a three-level tree;
- top-level `type`, `variable`, `function`, and ArkTS `struct`;
- source ordering across siblings and repeated requests;
- exact selection ranges after emoji prefixes using UTF-16 coordinates.

The flat `SymbolInformation` fallback and `containerName` assertions were kept
as a second slice and added only after the hierarchy tracer reached GREEN.

## Production RED

Command:

```text
pnpm build && node --test tests/semantic/document-symbol-depth.test.mjs
```

The first sandboxed build could not overwrite `dist/server.cjs`. Re-running the
same command with explicit bundle-write permission reached the production
server and produced a single focused failure:

```text
Expected source-ordered names included: sharedIdentifier
Actual source-ordered names omitted:    sharedIdentifier
1 failed, 0 skipped
```

The repeated-response equality assertion before this failure passed. The
response contained the other eleven requested declarations, including the
module/class/member nesting candidates. Assertions after the missing-variable
check remain intentionally unclaimed until this RED is fixed.

The fixture declares `sharedIdentifier` as `export const`. Code inspection
narrows the loss to the semantic kind adapter: TypeScript navigation trees use
`constElement`, while `documentSymbolKind` currently recognizes variable,
local-variable, and using-element variants but not const/let variants. The
unrecognized node is flattened away rather than returned as semantic
`variable`.

## Minimal GREEN

`documentSymbolKind` now maps TypeScript `constElement` and `letElement` to the
existing editor-neutral semantic `variable` kind. No protocol-specific logic
was moved into the semantic engine.

Command:

```text
pnpm build && node --test tests/semantic/document-symbol-depth.test.mjs
```

Result after the minimal implementation: the hierarchy tracer passed with all
twelve declarations, exact LSP kinds, the expected three-level tree, repeated
request stability, and UTF-16 selection ranges after emoji prefixes.

## Test-layer classification

Adding the executable test first produced the required manifest RED:

```text
tests/semantic/document-symbol-depth.test.mjs: discovered test has no layer
```

It is now classified once in the fast `bundle-e2e` layer. Focused manifest
verification:

```text
node --test tests/test-layer-manifest.test.mjs
# 2/2 passed, 0 skipped
```

## Flat fallback characterization

Once the hierarchy slice was GREEN, a second real-stdio test initialized a
legacy client with hierarchy disabled and `SymbolKind.Struct` absent from its
value set. The existing protocol adapter already satisfied this contract, so
this slice is a characterization test rather than another production change.
It locks down:

- depth-first source order for all twelve flat symbols;
- immediate-parent `containerName` values;
- ArkTS `struct` degradation to LSP `Class` only for incapable clients;
- exact full declaration ranges in UTF-16 coordinates; and
- byte-for-byte deterministic responses across repeated requests.

Focused verification:

```text
node --test tests/semantic/document-symbol-depth.test.mjs
# 2 passed, 0 failed, 0 skipped
```
