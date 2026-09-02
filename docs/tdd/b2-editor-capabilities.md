# B2 current-file semantic capability TDD evidence

- Parent revision: `548e649369ce421b2c4bfb3ec75cbd617a3ec263`
- Scope: signature help and hover through a real Content-Length framed LSP
  child process

## B2.1 signature help

The first positive transcript failed before implementation:

```text
pnpm build && node --test tests/semantic/editor-capabilities.test.mjs
JSON-RPC -32601: Unhandled method textDocument/signatureHelp
```

The minimal vertical slice reused the existing TypeScript semantic engine's
signature-help implementation through the editor-neutral semantic port. The
positive call and non-call `null` cases then passed (`2/2`). A separate
capability assertion was added next and failed because
`signatureHelpProvider` was absent; advertising `(` and `,` trigger characters
made all three signature-help transcripts GREEN.

## B2.2 hover

The documented-field transcript initially failed through the same public
boundary:

```text
pnpm build && node --test tests/semantic/editor-capabilities.test.mjs
JSON-RPC -32601: Unhandled method textDocument/hover
```

The implementation maps TypeScript quick-info back through the ArkTS virtual
document, preserving the exact source range and returning Markdown signature
and JSDoc. The positive and whitespace `null` transcripts then passed (`5/5`
including B2.1). A final capability assertion first observed an absent
`hoverProvider`; advertising it only after both behaviors passed made the
focused suite GREEN (`6/6`).

## B2.3 document symbols

The first hierarchical transcript opened the on-disk fixture, incrementally
inserted a method with `didChange`, then requested its outline. Before the
handler existed it failed with:

```text
JSON-RPC -32601: Unhandled method textDocument/documentSymbol
```

The minimal implementation maps TypeScript navigation-tree spans back through
the ArkTS virtual document, restores the `struct` kind, orders declarations by
source position, and reads the synchronized overlay. That transcript passed
with exact struct, property, inserted method, and top-level function ranges.

A non-hierarchical client transcript was added next. It failed because the
server returned `DocumentSymbol[]` unconditionally. Negotiating
`hierarchicalDocumentSymbolSupport` and flattening children to
`SymbolInformation[]` with container names made both response shapes GREEN.
Only then did the capability test observe its planned RED (`undefined` instead
of `true`) and `documentSymbolProvider` was advertised.

## Final verification

```sh
pnpm check && pnpm build && node --test tests/semantic/editor-capabilities.test.mjs
pnpm check:fast
```

References, prepare-rename, and rename are not advertised by this slice.
