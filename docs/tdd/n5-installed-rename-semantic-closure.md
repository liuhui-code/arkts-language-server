# N5 installed rename semantic closure

Date: 2026-09-03

Task-start revision: `503b758`

Installed conflict commit: `d063582`

## Public boundary

Both slices run through the immutable portable artifact installed into a
temporary prefix. The helper starts only that installed
`arkts-language-server --stdio` command from an external working directory and
materializes the versioned conformance workspace. No repository source module
or scripted semantic server participates in the assertions.

## Slice 1: same-scope conflict rejection

`RenameConflict.ets` declares top-level classes named `Account` and `Profile`
in one module. Renaming the `Profile` declaration to `Account` must fail
atomically:

```json
{
  "code": -32803,
  "message": "Rename is not available at this position."
}
```

The response has no `result`, so it cannot leak a partial `WorkspaceEdit`.
The successful consumer-local and origin/barrel rename scenarios continue
immediately afterward, protecting against an implementation that disables all
rename requests.

This was a GREEN characterization on its first installed-artifact run. The
production conflict fix was already present; inventing a RED or changing
production would have been incorrect.

```text
node --test tests/conformance-corpus.test.mjs
# 10 passed, 0 failed, 0 skipped

node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
# 1 passed, 0 failed, 3 skipped
```

## Slice 2: apply three documents, then query semantics

The earlier installed smoke validated the shapes of two rename responses and
applied them only to an in-memory `Map`. That proved edit coordinates but not
that server state converges after an editor applies the edits.

The closure now applies the combined rename flow to all three controlled
documents through their real synchronization paths:

1. `OtherConsumer.ets` is already open at version 1. Its consumer-local rename
   edit is applied with the strict WorkspaceEdit codec and sent through
   `textDocument/didChange` at version 2.
2. `Profile.ets` is open at version 3. Its origin rename edit is applied with
   the same codec and sent through `textDocument/didChange` at version 4.
3. `model/index.ets` remains unopened with `version: null`. Its barrel edit is
   written to the temporary corpus and announced with a changed
   `workspace/didChangeWatchedFiles` event.

The transcript waits for empty, versioned diagnostics after both open-document
changes. The origin rename preserves the already transformed consumer and the
barrel's public `Profile` API while changing the private origin identity to
`InstalledAccount`.

String comparison is only a fixture guard. The authoritative post-apply proof
uses two subsequent semantic requests:

- definition from the open consumer's `InstalledProfile` use resolves to the
  exact new `InstalledAccount` declaration range;
- references from that new origin return six exact locations across the origin,
  unopened barrel, and open consumer: the two origin-layer
  `InstalledAccount` names, the barrel/public import `Profile` names, and the
  consumer-local `InstalledProfile` alias plus use.

The exact reference set contains one declaration location in `Profile.ets`, at
the expanded new-name range. It contains no stale old-origin range. Retained
`Profile` text is explicitly the public alias layer, not a stale declaration.

The final intended transcript was GREEN on its first run after the independent
conflict commit; no production change was required:

```text
node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
# 1 passed, 0 failed, 3 skipped
```

Full immutable-artifact regression:

```text
node --test tests/release/portable-install.acceptance.mjs
# 4 passed, 0 failed, 0 skipped
```

Repository gate note:

```text
pnpm check:fast
# check and build passed; fast tests: 311 passed, 3 failed
```

All three failures are the independently owned ArkUI watched-resource REDs in
`lsp-workspace-file-changes`, `arkui-language-features`, and
`workspace-file-change-coordinator`. They do not execute or fail this N5
transcript and were intentionally not changed here.

During test design, a definition request issued directly against the unopened
barrel returned no result. That is not the editor-facing flow: language feature
requests originate from an open document. The accepted transcript queries the
open consumer and uses the unopened barrel's appearance in the exact references
set to prove watched-file convergence.

## Boundaries

- No production, ArkUI, capability, matrix, manifest, or package file changes.
- No string-only claim is accepted as semantic closure.
- This slice does not broaden conflict detection beyond its separately tested
  same-scope top-level-class boundary.
