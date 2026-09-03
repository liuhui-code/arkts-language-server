# B1/B2 unopened completion list fidelity

Date: 2026-09-03

Parent revision: `d06477e82102213eb2c0bc9ac1fa32a10a19ef3a`

## Behavior

A real `dist/server.cjs --stdio` session materializes the conformance corpus and
opens only `Home.ets`. At the marker-derived `completion.unicode` position, the
completion list must contain exactly one `Greeter` from the unopened workspace
file, with LSP kind `Class`, a `textEdit` that replaces exactly the marker range
with `Greeter`, and opaque `data` for a later resolve request.

The same transcript asserts that `completionProvider.resolveProvider` remains
absent. This slice preserves list fidelity only; it does not implement or
advertise completion resolve.

## RED

After adding only the stdio test, a fresh bundle was built:

```text
pnpm build
```

The focused transcript was then run:

```text
node --test --test-concurrency=1 \
  --test-name-pattern='preserves an exact unopened class completion from the production list' \
  tests/semantic/semantic-characterization.test.mjs
```

Observed: exit code 1. The server returned no candidates, so the assertion
reported `Expected one Greeter in []`. `Home.ets` does not import `Greeter.ets`,
which proved that the completion preparation path did not include unopened
workspace source files.

After minimally enabling the existing bounded workspace file path and preserving
public completion fields, the test advanced to a second RED: `Greeter` appeared
exactly once with kind `Class`, but its LSP `textEdit` was `undefined`. TypeScript
does not provide `replacementSpan` for this auto-import list entry.

## GREEN

The minimal implementation:

- includes the existing workspace source view only for completion preparation;
- preserves `replacementRange` and opaque `data` through the public semantic
  contract and legacy adapter;
- supplies the typed source prefix as the replacement range only when TypeScript
  omits `replacementSpan`;
- maps that range to an LSP `textEdit` with `insertText ?? label` as `newText`;
- leaves completion resolve registration and advertisement unchanged.

After another fresh `pnpm build`, the same focused command passed: 1 passed,
0 failed. Directly affected suites also passed:

```text
node --test --test-concurrency=1 \
  tests/conformance-corpus.test.mjs \
  tests/lsp-capability-contract.test.mjs \
  tests/semantic/semantic-characterization.test.mjs
```

Observed: exit code 0; 16 passed, 0 failed, 0 skipped. `pnpm check` also passed.

`pnpm check:fast` was attempted in the shared parallel worktree. Its type-check
stage passed, but the nested build collided while writing the shared
`dist/server.cjs` (`operation not permitted`). Standalone fresh builds before
both focused runs succeeded. The integration owner must rerun the aggregate
gate after the parallel artifact/harness processes finish.

## Explicit B4 follow-up

This slice does **not** complete B4. `SemanticDocumentStore.prepare(position,
true)` currently calls `listWorkspaceSourcePaths(rootPath)` on every completion
request. Existing safety bounds cap the loaded source set at 256 documents and
8 MiB, but directory discovery itself is synchronous and is not cached.

The immediately following ProjectSet slice must first add a stable regression
test proving that a second completion in the same unchanged workspace performs
no second directory enumeration. It must then cache the bounded project file
set with explicit invalidation for workspace/file changes. Resolve and
auto-import should not be declared release-ready before that slice is GREEN.
