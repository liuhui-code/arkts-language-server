# N1/N2 — Prepare rename and rename depth RED

Date: 2026-09-03

Parent revision: `926eea8`

## Public boundary

The acceptance tests start the production `dist/server.cjs --stdio` process,
open one ArkTS document, and use the LSP 3.17
`textDocument/prepareRename` and `textDocument/rename` requests. They do not
call the TypeScript language service or an internal semantic port directly.

The fixture is an origin → barrel → consumer graph:

```text
models/Profile.ets
  -> models/index.ets
    -> ConsumerAlias.ets / ConsumerUnaliased.ets
```

Only the request document is opened. Dependencies therefore exercise project
membership and unopened-file loading rather than test setup that pre-opens the
answer.

## Locked behavior

### N1 prepare rename

- An aliased consumer reference after a non-BMP emoji returns the exact source
  `UserProfile` UTF-16 range and `UserProfile` placeholder.
- A TypeScript keyword is not a rename target. The LSP response is the stable
  `RequestFailed` code `-32803` with the editor-facing message
  `Rename is not available at this position.`. It must not expose a localized
  TypeScript diagnostic.

### N2 rename

- Renaming a consumer's unaliased import reference from `Profile` to `Account`
  remains local to that consumer. The import edit is
  `Profile as Account`, preserving the exported name through TypeScript's
  prefix/suffix semantics, while local uses become `Account`.
- The result uses `WorkspaceEdit.documentChanges`, never `changes`; the opened
  document identifier carries its exact version.
- Applying the edit with the shared strict WorkspaceEdit codec produces the
  expected source and proves that the returned ranges are usable.
- Renaming the origin declaration preserves the barrel's public API by changing
  `export { Profile }` to `export { Account as Profile }`. The origin has its
  open version, the unopened barrel has explicit version `null`, and the
  downstream consumer remains byte-for-byte unchanged.
- Document changes and edits have deterministic source order.

Capability advertisement is intentionally outside these tests. N4 must keep
`renameProvider` absent until bundle, installed-artifact, and reliability
transcripts are all GREEN and the client supports versioned
`documentChanges`.

## RED evidence

```sh
node --test tests/semantic/rename-depth.test.mjs
# 0 passed, 4 failed, 0 skipped
```

All four protocol cases failed at the intended missing public boundary:

```text
code: -32601
message: Unhandled method textDocument/prepareRename

code: -32601
message: Unhandled method textDocument/rename
```

This is a stable behavioral RED, not a fixture, transport, timeout, or build
failure. No production implementation or capability advertisement is part of
this commit.

## GREEN sequence

Implement in this order, keeping each newly reached failure as the next RED:

1. prepare an aliased source reference with exact UTF-16 range/placeholder;
2. map a non-target to the fixed `RequestFailed` response;
3. return the versioned local consumer edit while preserving prefix/suffix;
4. return the complete origin/barrel edit without changing the public consumer;
5. add invalid-name, partial membership, stale, cancellation, and conditional
   capability slices under N3/N4 before advertising rename.

Steps 1–4 are now GREEN. The implementation adds editor-neutral prepare/rename
outcomes and retains the existing TypeScript query-position semantics instead
of renaming from a canonical definition. This is what preserves the language
service's mature alias behavior:

- consumer unaliased import becomes `Profile as Account` and only local uses
  change;
- origin declaration becomes `Account`, while the unopened barrel becomes
  `Account as Profile` and downstream public users stay unchanged.

Before producing any `WorkspaceEdit`, every TypeScript location is resolved
through a resident or lazy ArkTS virtual document, checked for workspace
containment and exact round-trip source mapping, deduplicated, sorted, and
checked for overlap. Open overlays carry their exact LSP document version;
unopened files use explicit `null`. A new public prepare/rename handler maps
non-targets to the fixed `RequestFailed` message without leaking TypeScript's
localized diagnostic.

Focused verification:

```text
pnpm check
pnpm build
node --test tests/semantic/rename-depth.test.mjs
# 4 passed, 0 failed, 0 skipped
```

The first GREEN run exposed a fixture-only assertion error: the strict edit
codec correctly preserved the source file's trailing newline while the
handwritten expected string omitted it. The exact edit assertions had already
passed; the expected output was corrected to preserve the original newline.

`renameProvider` remains absent. N3/N4 cancellation, stale/partial/invalid-name,
client capability, and immutable installed-artifact tests must pass before
advertising it.
