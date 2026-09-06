# N0 versioned TextDocumentEdit evidence

- Requested baseline: `c8774d7`
- Active parent at the first RED: `18b8a6c`
- Public test boundary: `applyWorkspaceEdit(documents, workspaceEdit, options)`
- Focused command: `node --test tests/lsp-edits.test.mjs`

The active parent had advanced because other tracks share the worktree. This
slice changed only the owned test helper, its focused tests, and this evidence
file.

## Contract

The existing `WorkspaceEdit.changes` behavior remains supported. A caller that
applies `documentChanges` must also provide an explicit snapshot-version map:

```js
applyWorkspaceEdit(documents, workspaceEdit, {
  documentVersions: new Map([
    [openUri, 7],
    [unopenedUri, null],
  ]),
})
```

An integer identifies the exact open-document snapshot. `null` identifies a
controlled disk snapshot supplied in `documents`. A missing entry is not
treated as a disk snapshot.

This slice accepts only `TextDocumentEdit` entries. It rejects resource
operations, unknown URIs, missing snapshot metadata, stale or non-integer open
versions, overlapping or out-of-bounds edits, and a WorkspaceEdit that mixes
`changes` with `documentChanges`. Application is pure: document maps, version
maps, and the WorkspaceEdit are not mutated, and successful output is sorted by
URI.

## RED to GREEN

The tracer added a real UTF-16 edit after an emoji for an open version-7
snapshot. RED was:

```text
node --test tests/lsp-edits.test.mjs
9 passed, 1 failed
WorkspaceEdit documentChanges are not supported
```

Minimal support made that tracer GREEN. Subsequent focused RED slices observed:

- a controlled disk snapshot with `null` was rejected as a mismatch even
  though both versions were null;
- an unknown URI with an empty edit list returned without throwing;
- missing snapshot metadata returned without throwing;
- a version-6 edit applied to a version-7 snapshot;
- matching non-integer versions were accepted;
- a `create` resource operation crashed by destructuring instead of being
  rejected explicitly;
- mixed `changes` and `documentChanges` produced the old unsupported message
  rather than the explicit mutually-exclusive contract.

Each received only the minimal corresponding guard. The existing strict
`applyTextEdits` implementation already rejected overlap and out-of-bounds
ranges, so the two `TextDocumentEdit` integration checks were characterization
GREEN and required no duplicate validation code. The immutability and
deterministic-order integration check was likewise GREEN after routing both
WorkspaceEdit representations through the same sorting function.

## Final GREEN

```text
node --test tests/lsp-edits.test.mjs
19 passed, 0 failed, 0 skipped
```

No production WorkspaceEdit codec, file operation, semantic handler, or LSP
capability was added in this slice.
