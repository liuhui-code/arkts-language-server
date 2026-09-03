# G3c no fast test skips: TDD evidence

- Parent revision: `d06477e82102213eb2c0bc9ac1fa32a10a19ef3a`
- Public boundary: `validateTestLayerManifest({ root, manifest })`
- Assumption: `scripts/check-release.sh` builds the release Rust workspace before
  it invokes the `artifact-e2e` layer.

## Slice 1: make an explicit fast-layer skip invalidate the manifest

RED command:

```sh
node --test tests/test-layer-manifest.test.mjs
```

The temporary manifest contained an executable fast entry with `t.skip(...)`.
The validator accepted it, so the new assertion failed with `Missing expected
exception`.

Minimal GREEN change: the manifest audit now examines only explicit Node test
skip-call syntax at the start of a source line. It reports the entry, line,
fast-layer id, and exact call form. It recognizes test-context `t.skip(...)`
and the standard `test.skip(...)`, `it.skip(...)`, `describe.skip(...)`, and
`suite.skip(...)` forms without matching arbitrary occurrences of the word
`skip`.

After adding the first audit rule, the repository manifest exposed the intended
stable RED:

```text
tests/index-adapter.test.mjs:592: fast layer unit-contract contains t.skip(...)
```

A second focused RED proved that `test.skip(...)` could not bypass the policy;
the initial implementation reported only the `t.skip(...)` line. The minimal
extension reports both explicit forms.

## Slice 2: move the real-binary case to artifact acceptance

The persistence/restart case was removed from `tests/index-adapter.test.mjs`
and moved unchanged in behavior to
`tests/release/index-sidecar.acceptance.mjs`. The acceptance test uses
`ARKTS_INDEX_REAL_SIDECAR` when explicitly supplied; otherwise it requires the
platform-specific binary under `target/release`. An empty override, missing
path, non-file path, or non-executable binary is an assertion failure, never a
skip.

The unique layer manifest now assigns the new entry to `artifact-e2e`:

```text
entry count: 35
unit-contract: 17
protocol: 5
bundle-e2e: 9
artifact-e2e: 3
large: 1
```

## GREEN evidence

```sh
node --test tests/test-layer-manifest.test.mjs
```

Result: 2 passed, 0 failed, 0 skipped.

```sh
node --test tests/index-adapter.test.mjs
```

Result: 18 passed, 0 failed, 0 skipped.

```sh
node --check tests/release/index-sidecar.acceptance.mjs
```

Result: syntax valid. The artifact acceptance itself was deliberately not run.

```sh
pnpm check:fast
```

The sandboxed attempt could not rewrite the generated `dist/server.cjs`. The
same required command was rerun with permission to write that generated output
and completed successfully: typecheck, fresh bundle, and every fast layer were
GREEN. The new artifact acceptance was not selected.

No package script, release driver, workflow, production implementation, or
artifact build behavior changed in this slice.
