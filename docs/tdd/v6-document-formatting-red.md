# V6 document formatting RED

Date: 2026-09-03

Parent revision: `0f90d8d`

## Public boundary

`tests/semantic/document-formatting.test.mjs` bundles the real production
server, opens an ArkUI document over framed stdio LSP, and requires:

1. `documentFormattingProvider: true` only when the handler exists;
2. deterministic two-space formatting, argument spacing, and trailing-space
   cleanup without rewriting ArkTS `struct` or builder syntax;
3. applying returned edits and sending `didChange` v2 keeps diagnostics empty;
4. `width` still defines to the deterministic SDK declaration with its exact
   range;
5. formatting the already-formatted v2 document is idempotent and returns no
   edits.

The test uses the source document, never the generated TypeScript text, as the
observable formatting contract.

## Expected RED

The current server neither advertises nor handles `textDocument/formatting`.
The first assertion therefore fails before any production implementation is
added. The test must be registered in the explicit bundle layer only when the
integration owner collects all parallel RED files.

Observed command:

```text
node --test tests/semantic/document-formatting.test.mjs
# 0 passed, 1 failed
# documentFormattingProvider: expected true, actual undefined
```
