# S3c session document change bridge

Date: 2026-09-03  
Parent revision: `8452e0e9afdb6e133958d27f1a03263467b680ac`  
Branch: `plan/lsp-completeness-e2e`

## Contract

The test-side `LspSession` can open a document, send a full or caller-supplied
incremental `didChange`, and issue a request with a unique request ID. Document
versions tracked by URI must increase monotonically.

The public transcript test uses `applyTextEdits` to insert a field and method
into an opened ArkTS document, sends the resulting text as version 2 to the real
`dist/server.cjs --stdio` process, and verifies that the next `this.` completion
contains both new members. Workspace roots and document URIs are constructed
with `pathToFileURL`. Existing session coverage continues to prove bounded
shutdown followed by exit.

## Slice 1: applied edit reaches the real server

RED command:

```sh
node --test tests/lsp-session.test.mjs
```

Observed RED: exit code 1; the existing lifecycle test passed, and the new real
server scenario failed with `TypeError: session.openDocument is not a function`.

Minimal GREEN added `openDocument`, `changeDocument`, and `request` as thin LSP
protocol methods. The same command then passed 2 tests with no failures or
skips, including completion for `editedTitle` and `persistEdit`.

## Slice 2: monotonic document versions

RED command:

```sh
node --test tests/lsp-session.test.mjs
```

Observed RED: exit code 1; 2 tests passed and the new version test failed with
`Missing expected exception` after opening and changing with version 7.

Minimal GREEN records the last version per URI and rejects a `didChange` whose
version is not greater. The focused command then passed 3 tests with no failures
or skips.

## Files in this slice

- `tests/support/lsp-session.mjs`
- `tests/lsp-session.test.mjs`
- `docs/tdd/s3c-session-document-change.md`
