# Q1/Q2 spelling quick-fix tracer

Date: 2026-09-03

Initial tested parent: `09fd6b299e2f17cfd4461c9a50a9b3164b47a55d`

## Scope

This tracer carries the committed `quickfix.greeting` TS2552 diagnostic through
one unresolved quick-fix list item and a separately resolved, versioned edit:

```text
publishDiagnostics v1
  -> textDocument/codeAction
  -> UUID-only server registry record
  -> codeAction/resolve
  -> one versioned TextDocumentEdit
  -> didChange v2
  -> publishDiagnostics v2 []
```

The slice deliberately does not advertise `codeActionProvider`. Capability
advertisement remains gated on the later capability/evidence track. It also
does not support commands, new files, cross-file edits, fix-all, refactors, or
arbitrary TypeScript code-fix families.

## TypeScript API evidence

Context7 was queried for `/microsoft/typescript/v5.9.2`, but did not expose the
exact code-fix declaration. The installed TypeScript 5.9.2 declaration was
therefore used as the version-locked authority:

```text
getCodeFixesAtPosition(
  fileName,
  start,
  end,
  errorCodes,
  FormatCodeSettings,
  UserPreferences,
): readonly CodeFixAction[]
```

The implementation passes the raw generated diagnostic span and numeric error
code, `ts.getDefaultFormatCodeSettings(documentEol)`, and
`{ allowTextChangesInNewFiles: false }`. Source ranges are used only after the
TypeScript result is returned; reverse-mapping an LSP range to guess the raw
diagnostic span is intentionally avoided.

## Q1 list RED to GREEN

The real `dist/server.cjs --stdio` test opens the materialized ArkTS document,
waits for the exact UTF-16 TS2552 publication, and requests only `quickfix` at
that range.

Focused command:

```text
node --test tests/semantic/diagnostic-code-characterization.test.mjs
```

Initial RED was stable:

```text
3 existing tests passed; the new list test failed
code: -32601
message: Unhandled method textDocument/codeAction
```

Minimal GREEN added the TypeScript spelling action query, the semantic port
mapping, a shared pure diagnostic-to-LSP mapper, and the LSP list route. The
list response contains exactly the server-published diagnostic, title
`Change spelling to 'greeting'`, kind `quickfix`, and one UUID v4 data field.
It contains neither an edit nor a command. The Q1 focused run passed `4/4`
with no skips.

## Q2 resolve RED to GREEN

Only after Q1 was GREEN, a second real-process tracer sent the returned action
to `codeAction/resolve`. Its stable RED preserved the working list path and
failed only at the missing resolve route:

```text
4 passed, 1 failed
code: -32601
message: Unhandled method codeAction/resolve
```

Resolve now accepts only the registry UUID. Client-supplied title, diagnostic,
edit, command, and other action fields are not authoritative. The registry
record binds the action to URI and version. Resolve re-runs TypeScript against
the current snapshot and accepts the result only when its SHA-256 fingerprint
still matches the server record.

The first post-implementation run exposed a local variable-name error as a
bounded `-32603` (`expectedVersion is not defined`). Correcting the assignment
to the already-validated document version produced the final GREEN without
changing the contract.

The final result is one `WorkspaceEdit.documentChanges` entry whose
`TextDocumentEdit` is bound to version 1 and replaces the exact UTF-16 marker
range with `greeting`. The existing safe workspace-edit helper applies it; the
test sends the resulting content as version 2 and receives an empty version-2
diagnostic publication.

Final focused result: `5/5` passed, `0` failed, `0` skipped.

## Safety and memory boundaries

- Only the current open document may be changed.
- TypeScript actions with commands, new files, cross-file changes, empty
  changes, out-of-bounds spans, overlapping spans, or non-round-trippable
  virtual-document offsets fail closed.
- A generated edit is rejected when its replaced generated text differs from
  the mapped source text, protecting ArkTS rewrite regions.
- Fingerprints cover fix name, description, file, spans, and replacement text;
  raw TypeScript actions and edits are not retained in the registry.
- The reused registry is UUID-only, immutable, FIFO- and byte-bounded, and
  turns entries into payload-free tombstones on change or close.
- Resolve checks both the current open-document version and every returned
  edit URI/version before constructing the LSP edit.

## Verification

```text
node --test tests/semantic/diagnostic-code-characterization.test.mjs
pnpm check
```

The real stdio suite passed `5/5` with no failures or skips. `pnpm check` is
GREEN with no TypeScript errors. The parent integration track produced a fresh
bundle after the final source change (`pnpm build` GREEN), and the reported
`5/5` focused result is from that final bundle.
