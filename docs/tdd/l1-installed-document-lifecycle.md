# L1 — Installed document lifecycle characterization

Date: 2026-09-03

Parent revision: `508a93a19736317dc757b346ada29d40d5cd92a9`

## Public boundary

The shared installed semantic smoke is used unchanged by both the local-install
and immutable portable-artifact acceptance entries. This test-only slice adds a
real stdio lifecycle transcript and changes neither production code nor either
acceptance entry.

Initialize must advertise exactly:

```json
{"textDocumentSync":{"openClose":true,"change":2}}
```

The numeric value `2` is LSP incremental synchronization.

## Deterministic lifecycle tracer

The tracer waits for the catalog's 100% report and end notification before
using workspace symbols. There are no sleeps. It first requires the persisted
`Greeter` class and exact marker-derived range to be visible, which makes disk
truth an explicit precondition rather than an assumption.

It then performs this sequence on the real `Greeter.ets` URI:

```text
didOpen v1 with disk bytes
  -> didChange v2 with one ranged replacement (no full-text change)
  -> workspace/symbol finds InstalledOverlayGreeter at the changed range
  -> workspace/symbol no longer exposes exact disk Greeter for that URI
  -> didClose
  -> workspace/symbol no longer exposes InstalledOverlayGreeter
  -> workspace/symbol restores exact disk Greeter URI and range
```

Every state transition is observed through LSP requests. If the server ignores
the ranged change, the new-name assertion fails. If it treats the replacement
as the complete document, symbol extraction fails. If the open overlay does not
take precedence, the stale exact disk name remains visible. If close does not
clear the overlay, the new name remains and the disk symbol stays hidden.

## Characterization and probe refinement

Before the change, the complete portable suite passed:

```sh
node --test tests/release/portable-install.acceptance.mjs
# 4 passed, 0 failed, 0 skipped; about 15.5 seconds
```

The capability assertion was added first and the focused immutable-artifact
test remained GREEN (1 passed, 3 skipped by filter).

The first lifecycle probe selected the `Profile` interface. It reached a real
RED after close because the persistent catalog does not currently return that
interface, so there was no disk workspace-symbol truth to restore. The ranged
overlay checks themselves had passed. This was a tracer-fixture error, not
evidence of a close bug.

The probe was narrowed to the catalog-backed `Greeter` class and gained an
explicit pre-open disk-symbol assertion. The same focused command then passed.
No production change was needed, and no artificial RED was introduced.

## Verification

```sh
node --check tests/support/installed-semantic-smoke.mjs
# exit 0

node --test --test-name-pattern='installs one verified artifact' \
  tests/release/portable-install.acceptance.mjs
# 1 passed, 0 failed, 3 skipped by filter; about 5.6 seconds

node --test tests/release/portable-install.acceptance.mjs
# 4 passed, 0 failed, 0 skipped; about 16.0 seconds
```

The local-delivery acceptance was intentionally not run because its installer
rebuilds repository outputs. Its existing import of the shared helper makes the
same lifecycle transcript mandatory on its next normal gate run.
