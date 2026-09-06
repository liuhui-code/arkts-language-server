# S3b WorkspaceEdit application TDD evidence

- Parent revision: `c757f2c3686397e0de2dd7e96aca8dd29a0528dc`
- Scope: strict test-side application of `WorkspaceEdit.changes`

## RED → GREEN slices

Every slice used the focused S3 suite:

```sh
node --test tests/lsp-edits.test.mjs
```

1. **Immutable `changes` application**
   - RED: `applyWorkspaceEdit` was not exported.
   - GREEN: edits for each explicit document URI reuse `applyTextEdits`; the
     returned `Map` is sorted by URI while the input documents and edit object
     remain unchanged. The transcript includes an edit after `😀`.
2. **Unknown URI rejection**
   - RED: an unknown URI with an empty edit list was silently added to the
     output map.
   - GREEN: every URI is validated against the explicit document map before
     applying any edit; an unknown URI throws `RangeError`.
3. **Unsupported `documentChanges` rejection**
   - RED: `documentChanges: []` was silently ignored while `changes` was
     accepted.
   - GREEN: providing `documentChanges` throws explicitly, preventing a future
     rename or auto-import test from partially applying a WorkspaceEdit.

## Final verification

```sh
node --test tests/lsp-edits.test.mjs
```

Result: all original S3 tests and the three S3b contracts passed (`9/9`,
`0` failed, `0` skipped).

This remains test infrastructure. It does not implement a production
WorkspaceEdit codec, versioned document edits, or file create/rename/delete
operations.
