# N4 — Immutable installed rename RED/GREEN

Date: 2026-09-03

Parent revision: `e51eeab`

## Public boundary

The release acceptance builds an immutable portable artifact, installs it from
that artifact, moves the build input away, and starts only the installed
`arkts-language-server --stdio` command from an external working directory.
The semantic smoke materializes the versioned conformance workspace. Its first
rename scenario opens only `OtherConsumer.ets`, leaving `Profile.ets` and its
barrel unopened. The second scenario explicitly opens the origin while the
barrel remains unopened.

The client declares all prerequisites used by the N4 capability contract:

- `workspace.workspaceEdit.documentChanges: true`;
- `workspace.workspaceEdit.failureHandling: "transactional"`;
- `textDocument.rename.prepareSupport: true`.

## Locked behavior

- `initialize` advertises exactly `renameProvider: { prepareProvider: true }`.
- `textDocument/prepareRename` on the consumer reference returns the exact
  marker-derived UTF-16 range and `Profile` placeholder.
- Renaming the unaliased consumer reference to `InstalledProfile` remains local
  to the consumer: the import becomes
  `Profile as InstalledProfile` and the use becomes `InstalledProfile`.
- The edit uses only `WorkspaceEdit.documentChanges`; the opened consumer has
  exact version `1`, and edits are in stable source order.
- Applying the result through the shared strict WorkspaceEdit codec produces
  the expected source. This checks that installed-artifact ranges are usable,
  not merely structurally plausible.
- A second rename opens the origin at version `3` and leaves the barrel
  unopened. The origin becomes `InstalledAccount`, the barrel becomes
  `InstalledAccount as Profile` with explicit version `null`, and the public
  consumer remains byte-for-byte unchanged.

The conformance graph reuses the established Profile origin/barrel/consumer
source files. Rename-specific markers are stacked at the same source offsets,
so the fixture gains feature-owned evidence without adding files or changing
ArkTS semantics.

## RED evidence

The implementation already handles prepare/rename requests, but the immutable
artifact must not claim them before the capability and evidence gates are
closed. The focused corpus validation remained GREEN:

```sh
node --test tests/conformance-corpus.test.mjs
# 10 passed, 0 failed, 0 skipped
```

The public artifact command produced the intended RED:

```sh
node --test tests/release/portable-install.acceptance.mjs
# 3 passed, 1 failed, 0 skipped
```

The first test successfully built and installed the immutable artifact, started
its adjacent sidecar, completed workspace discovery, and reached the exact
initialize assertion in `assertInstalledSemanticSmoke`:

```text
actual renameProvider: undefined
expected: { prepareProvider: true }
```

The other three portable installation tests stayed GREEN. This rules out a
fixture, installer, checkout-independence, atomic-activation, or timeout failure
as the cause of RED.

No production, capability-contract, or feature-matrix code was changed to
produce this RED.

## GREEN closure

Production commit `20cecb3` added conditional advertisement. It exposes
`{ prepareProvider: true }` only when the client supports prepare rename,
versioned document changes, and either `transactional` or
`textOnlyTransactional` failure handling.

The first post-implementation artifact run correctly remained RED because the
installed smoke declared `documentChanges` but omitted `failureHandling`. The
fixture client was corrected to declare `transactional`; weakening the server
gate would have made multi-document rename unsafe. The next run reached and
passed both rename scenarios, including the unopened barrel edit:

```sh
node --test tests/release/portable-install.acceptance.mjs
# 4 passed, 0 failed, 0 skipped
```

This GREEN is from the installed immutable command, not the source checkout.
The feature matrix and top-level capability contract remain owned by the
atomic gate-closing slice.
