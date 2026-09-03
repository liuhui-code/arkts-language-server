# I2b installed completion resolve and auto-import

- Parent revision: `600eb84c18318114be477f52b53e27b91064efeb`
- Public boundary: the command installed by `scripts/install-local.sh`, launched
  with `--stdio` from a working directory outside both the checkout and test
  workspace
- Scope: installed completion list, resolve, auto-import application,
  versioned diagnostics, and definition recheck

## Test-first observation

The existing installed semantic smoke was extended while the feature matrix
still recorded an explicit completion-resolve artifact gap. The new transcript
was immediately GREEN against the real installed command, so this is
characterization evidence; no production or installer change was required.

The first sandboxed invocation could not rewrite `dist/server.cjs` and failed
before reaching the test behavior. Re-running the same focused command with
permission to create the installer's local build outputs produced the valid
behavioral result below.

The evidence-matrix slice then followed a separate RED to GREEN cycle:

1. RED: the matrix test expected `completion-resolve` in artifact-covered
   features while the matrix still reported its artifact gap. It failed with
   actual coverage containing only completion, definition, workspace symbol,
   and diagnostics.
2. GREEN: `tests/release/local-delivery.acceptance.mjs` was added as the
   completion-resolve artifact evidence and the explicit gap was changed to
   `null`.

## Installed transcript contract

The session uses an external cwd, a missing HOME and DevEco path, the
corpus-owned deterministic SDK, and an isolated index cache. It answers the
server's `window/workDoneProgress/create` request but does not wait for catalog
completion before issuing semantic requests.

After the existing unopened-definition smoke, the acceptance:

1. opens only marker-materialized `Home.ets` at version 1;
2. requests completion at the marker-derived UTF-16 position after `😀` and
   finds exactly one `Greeter` class with the exact `Gree` replacement range;
3. verifies the client-visible data contains only an opaque UUID-valued
   `arktsCompletionId`;
4. resolves that item and verifies its class detail, deterministic JSDoc,
   preserved text edit, and one exact import edit;
5. applies both edits through the bounds- and overlap-checking TextEdit helper;
6. sends the result as `didChange` version 2 and receives empty version-2
   diagnostics;
7. requests definition at the inserted `Greeter` and receives the exact,
   complete range in unopened `Greeter.ets`.

## Evidence

Installed characterization GREEN:

```sh
node --test tests/release/local-delivery.acceptance.mjs
```

Result: 1 passed, 0 failed, 0 skipped; about 8.6 seconds including the existing
local installer build and idempotence checks.

Feature-matrix RED, before evidence wiring:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

Result: 1 passed, 1 failed; `completion-resolve` was missing from
`artifactCoveredFeatureIds`.

Feature-matrix GREEN, after evidence wiring:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

Result: 2 passed, 0 failed, 0 skipped.

## Limitation

This remains a local-installer characterization. `install-local.sh` builds from
the current checkout before installing, so this test does **not** prove an
immutable build-once artifact was downloaded, verified, and tested without a
rebuild. It must not be cited as evidence for that later release invariant.
