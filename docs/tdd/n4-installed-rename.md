# N4 — Immutable installed rename RED

Date: 2026-09-03

Parent revision: `e51eeab`

## Public boundary

The release acceptance builds an immutable portable artifact, installs it from
that artifact, moves the build input away, and starts only the installed
`arkts-language-server --stdio` command from an external working directory.
The semantic smoke materializes the versioned conformance workspace and opens
only `OtherConsumer.ets` for this rename slice. `Profile.ets` and its barrel
remain unopened dependencies.

The client declares both prerequisites used by the N4 capability contract:

- `workspace.workspaceEdit.documentChanges: true`;
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

No production, capability-contract, or feature-matrix code is changed in this
slice. N4 remains RED until the owner adds conditional advertisement and keeps
the bundle/reliability/evidence gates coherent.
