# A1 document lifecycle TDD evidence

- Parent revision: `a4da5556b7f233abee00b152356ab477dba76f31`
- Scope: LSP incremental document synchronization and overlay lifecycle

## RED

Command:

```sh
pnpm build && node --test tests/lsp-document-lifecycle.test.mjs
```

The real stdio transcript expected `textDocumentSync` to advertise open/close
incremental synchronization. The server instead returned the Full sync enum:

```text
expected: { openClose: true, change: 2 }
actual:   1
```

## GREEN

After advertising incremental synchronization through the LSP initialize
response, the same focused command passed. Two additional public transcript
tests characterize the already-supported lifecycle behavior:

- a ranged `didChange` updates the open overlay before `this.` completion;
- after `didClose`, completion for that URI cannot read the former overlay.

Final verification:

```sh
pnpm check:fast
```
