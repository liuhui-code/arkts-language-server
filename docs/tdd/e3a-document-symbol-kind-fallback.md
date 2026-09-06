# E3a document-symbol kind fallback

- Delegated parent revision: `9fc8d22`
- Observed execution revision before this slice: `34d0c5536278988a92ca33c6870faf07c2cc0cbc`
- Public boundary: the real `dist/server.cjs --stdio` initialize and
  `textDocument/documentSymbol` transcript
- Scope: ArkTS `struct` kind compatibility only; range coverage and the full
  semantic-kind matrix remain later slices

## Contract

LSP 3.17 says that a client which omits
`textDocument.documentSymbol.symbolKind.valueSet` only supports the original
`File` through `Array` kinds. Therefore an ArkTS `struct` must be represented as
the closest supported legacy kind, `Class` (`5`), rather than `Struct` (`23`).

The response shape is controlled independently by
`hierarchicalDocumentSymbolSupport`:

- a legacy client explicitly declaring `false` and omitting `valueSet` receives
  flat `SymbolInformation[]`, with `Panel` reported as `Class`;
- a modern hierarchical client declaring the complete `1..26` value set
  receives nested `DocumentSymbol[]`, with `Panel` preserved as `Struct`.

## RED

After changing only the public transcript expectation, rebuild and run:

```sh
pnpm build && node --test tests/semantic/editor-capabilities.test.mjs
```

Result: 8 passed and 1 failed. The only failure was the legacy flat transcript:
expected kind `5`, actual kind `23`.

## Minimal GREEN

Initialization now derives the document-symbol struct kind from the client's
declared `valueSet`. Both the hierarchical and flat converters consume that
same kind profile; no semantic contract or engine behavior changed.

Running the same command after the implementation produced 9 passed, 0 failed,
and 0 skipped.

