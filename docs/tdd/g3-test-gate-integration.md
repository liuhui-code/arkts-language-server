# G3 test gate integration: TDD evidence

- Parent revision: `d37c03e2e19fe8c9b895306ccdf8929becc479c6`
- Public boundaries: G1 manifest audit and `package.json` scripts
- Focused manifest command: `node --test tests/test-layer-manifest.test.mjs`
- Focused package command: `node --test tests/test-layer-runner.test.mjs`

## Integrated contract

The G2 runner test is now an explicit `unit-contract` entry. The manifest
contains 33 discovered tests exactly once: 16 unit/contract, 5 protocol, 9
bundle E2E, 2 artifact E2E, and 1 large acceptance entry.

Every Node test package entry now selects paths through
`scripts/run-node-test-layer.mjs`; no glob remains as a primary test entry:

- `pnpm test` runs all fast layers;
- `pnpm test:unit` runs `unit-contract`;
- `pnpm test:protocol` runs `protocol`;
- `pnpm test:e2e:bundle` runs `bundle-e2e`;
- `pnpm test:e2e:artifact` runs `artifact-e2e`;
- `pnpm test:e2e:large` runs `large`.

`pnpm check:fast` explicitly performs type checking, builds a fresh production
bundle, and then invokes the fast-layer test entry. Artifact and large layers
are independently addressable but are not transitively selected by the fast
gate.

## RED -> GREEN cycles

1. **Classify the G2 runner test**
   - RED: the live filesystem audit reported
     `tests/test-layer-runner.test.mjs: discovered test has no layer`.
   - GREEN: the runner test was added once to `unit-contract`; all 33 entries
     passed the manifest audit.
2. **Route package gates through the runner**
   - RED: `test` still contained two filesystem globs and all five layer scripts
     were missing.
   - GREEN: package script metadata matched the exact runner commands and
     retained `check:fast = check + build + fast layers`.

Focused integration result: 8 tests passed, 0 failed, 0 skipped. Artifact and
large acceptance commands were intentionally not executed in this slice.

## Final fast gate

`pnpm check:fast` completed type checking, rebuilt `dist/server.cjs`, and ran
only the manifest's fast layers. Node reported 143 tests passed, 0 failed, and
0 skipped in about 81.3 seconds. The first sandboxed invocation could not write
the sibling checkout's `dist/server.cjs`; rerunning the identical command with
the required workspace write permission completed successfully. No artifact or
large acceptance command was run.
