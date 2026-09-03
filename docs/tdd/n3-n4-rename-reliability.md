# N3/N4 rename reliability and conditional capability

Date: 2026-09-03

Parent revision at task start: `0bd947c812ce73b62d5bd4c6bdeb37c8241610df`

## Scope

This test-first slice fixes the public protocol contract for the already
registered `textDocument/prepareRename` and `textDocument/rename` handlers. It
does not change production code, the capability contract/matrix, or installed
artifact coverage. All requests cross a real child-process stdio boundary with
`Content-Length` framing.

The scripted semantic fixture exposes four explicit outcomes and two
synchronization barriers. Client cancellation waits on the real AbortSignal.
The cancellation-resistant stale path is released deterministically by
`sync()` on `didChange` or `close()` on `didClose`; the tests do not synchronize
with a fixed sleep.

## N3 reliability characterization

Public boundary:

- `$/cancelRequest` while prepare/rename is running returns
  `RequestCancelled` (`-32800`) with no result or WorkspaceEdit;
- a completed-but-abort-resistant rename after `didChange` or `didClose`
  returns `ContentModified` (`-32801`) with no WorkspaceEdit;
- semantic `invalid-name` returns `InvalidParams` (`-32602`) and the fixed
  non-localized message `Rename requires a valid identifier.`;
- semantic `incomplete` and `unavailable`, for both prepare and rename, return
  `RequestFailed` (`-32803`) and the same fixed non-localized message.

Focused command:

```text
node --test tests/lsp-semantic-request-reliability.test.mjs
```

Observed result when introduced:

```text
8 passed, 0 failed, 0 skipped
```

These N3 cases were GREEN characterization tests. The pre-existing hidden
handlers already used the shared request-freshness runner and fixed error
mapping correctly; no production change is justified for this portion.

## N4 capability RED

Assumption: rename is safe to advertise only when the client declares all of:

1. `workspace.workspaceEdit.documentChanges === true`;
2. `textDocument.rename.prepareSupport === true`;
3. `workspace.workspaceEdit.failureHandling` is `transactional` or
   `textOnlyTransactional`.

For either accepted failure mode, the exact server capability is:

```json
{ "prepareProvider": true }
```

Removing any prerequisite, or using the weaker `abort` failure mode, must keep
`renameProvider` absent.

RED command:

```text
node --test tests/lsp-capability-contract.test.mjs
```

Stable RED:

```text
4 passed, 2 failed, 0 skipped
advertises prepare rename for transactional workspace edits:
  expected { prepareProvider: true }, received undefined
advertises prepare rename for textOnlyTransactional workspace edits:
  expected { prepareProvider: true }, received undefined
```

All four negative prerequisite cases were GREEN, proving the RED is narrowly
the missing positive advertisement rather than accidental unconditional
advertisement.

## Minimal capability GREEN

The semantic capability adapter now configures `renameProvider` from exactly
the three client prerequisites above and deletes it otherwise. No unconditional
advertisement was introduced.

Focused verification after a fresh production build:

```text
pnpm check
pnpm build
node --test tests/lsp-capability-contract.test.mjs
# 6 passed, 0 failed, 0 skipped

node --test tests/lsp-semantic-request-reliability.test.mjs
# 8 passed, 0 failed, 0 skipped
```

The shared capability contract/feature matrix will switch rename from planned
to enabled only after the independently owned immutable-artifact transcript is
GREEN; the E0b validator now forbids doing so earlier.

## Remaining risks

- These protocol tests prove stale/cancel/fail-closed behavior but do not prove
  the cross-file edit semantics, which remain covered by the production rename
  E2E fixture.
- Installed artifact coverage and the global advertised-feature evidence gate
  are deliberately outside this slice's file ownership.
- The scripted fixture returns one versioned edit only; grouping, sorting,
  overlap rejection, and edit application require their existing production
  E2E/helper tests.
