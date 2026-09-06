# Q2-I — Installed code-action smoke

Date: 2026-09-03

Parent revision: `a90873ef85a5ed49889d47f6297d037e46daea2a`

## Public boundary

The shared installed semantic scenario now exercises the spelling quick fix
through a real `Content-Length` stdio session. Both the source-install
acceptance and immutable portable-artifact acceptance import this same helper;
neither entry point is duplicated or weakened.

The client declares code-action literal, opaque data, edit resolution, and
versioned `WorkspaceEdit.documentChanges` support. The scenario intentionally
continues to assert that `codeActionProvider` is absent from initialize. Public
advertisement remains gated by the separate capability-evidence track.

## Characterization and TDD provenance

Before changing the helper, the immutable-artifact acceptance was characterized
with the existing completion, diagnostics, and unopened-definition transcript:

```sh
node --test --test-name-pattern='installs one verified artifact' \
  tests/release/portable-install.acceptance.mjs
```

Result: 1 passed, 0 failed, 3 skipped by the name filter, in about 5.3 seconds.

The production Q1/Q2 slice had already landed at `599b23a` and the available
`dist/server.cjs` already contained those bytes before this installed-only
slice began. Consequently the new installed assertions were immediately GREEN
against the real artifact; no historical bundle was rebuilt and no artificial
RED was fabricated. The underlying production RED evidence remains recorded in
`docs/tdd/q1-q2-spelling-quick-fix.md`: list first failed with unhandled
`textDocument/codeAction`, then resolve failed with unhandled
`codeAction/resolve`.

## Installed transcript contract

After the existing completion-resolve and unopened-definition checks, the
shared helper:

1. closes the completion document and opens only the marker-materialized
   `quickfix.greeting` document at version 1;
2. waits without sleeping for the exact UTF-16 marker range, numeric TS2552
   code, error severity, and `arkts` source;
3. lists exactly one `quickfix` action whose `data` has only a UUID-v4
   `arktsCodeActionId`, with neither eager `edit` nor `command`;
4. resolves that opaque item to exactly one version-1
   `TextDocumentEdit` in `WorkspaceEdit.documentChanges`;
5. applies the edit with the strict test-side workspace-edit helper and a
   controlled version map;
6. sends the corrected source as version 2 and waits for an empty version-2
   diagnostic publication.

The transcript inherits the acceptance gates for an external cwd, isolated
HOME, absent build tools, immutable artifact verification, bounded requests,
and LSP `shutdown` then `exit` teardown.

## Final evidence

```sh
node --check tests/support/installed-semantic-smoke.mjs
# exit 0

node --test --test-name-pattern='installs one verified artifact' \
  tests/release/portable-install.acceptance.mjs
# 1 passed, 0 failed, 3 skipped by filter; about 5.7 seconds
```

The local-delivery acceptance was not run in this slice because its installer
rebuilds repository outputs. Its existing import of the shared helper makes the
same code-action transcript mandatory the next time that gate runs.
