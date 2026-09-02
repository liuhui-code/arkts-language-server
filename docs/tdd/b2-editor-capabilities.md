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

## Verification

```sh
pnpm check && pnpm build && node --test tests/semantic/editor-capabilities.test.mjs
pnpm check:fast
```

`documentSymbol`, references, prepare-rename, and rename are not advertised by
this slice.
