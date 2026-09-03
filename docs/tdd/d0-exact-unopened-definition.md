# D0 exact unopened definition range

Date: 2026-09-03

Parent revision: `11b52f2e8d4c09b3806813450b7e25b3fa1658dd`

## Behavior

A real `dist/server.cjs --stdio` session opens only the materialized
`OtherConsumer.ets` document and requests `textDocument/definition` at the
marker-derived `profile.reference` position. The result must be the unopened
`Profile.ets` document, and its range must cover the complete `Profile` name.

The fixture places `😀` before the query marker on the same line. The test
compares JavaScript UTF-16 length with code-point length and derives both the
query position and expected target range from corpus markers; it contains no
handwritten LSP coordinates.

## RED

After changing only the fixture and public stdio test, a fresh bundle was built:

```text
pnpm build
```

Then the tracer was run:

```text
node --test --test-concurrency=1 \
  --test-name-pattern='returns the exact unopened definition range after an emoji prefix' \
  tests/semantic/semantic-characterization.test.mjs
```

Observed: exit code 1. The server found the correct target URI and range start,
but returned a zero-length range:

```text
expected end: { line: 0, character: 24 }
actual end:   { line: 0, character: 17 }
actual start: { line: 0, character: 17 }
```

This isolated the defect to loss of TypeScript's `textSpan.length` after target
resolution, rather than workspace discovery, barrel resolution, or UTF-16 query
positioning.

## GREEN

The definition candidate contract now carries a complete semantic range.
TypeScript targets already loaded as virtual ArkTS documents use
`generatedSpanToSourceRange(start, length)`; disk-only targets use
`spanToRange(content, start, length)`. The public semantic adapter converts the
whole range instead of synthesizing `end = start`.

After another fresh `pnpm build`, the same focused command passed: 1 passed,
0 failed. The directly affected suites also passed:

```text
node --test --test-concurrency=1 \
  tests/conformance-corpus.test.mjs \
  tests/semantic/semantic-characterization.test.mjs
```

Observed: exit code 0; 13 passed, 0 failed, 0 skipped. `pnpm check` also passed.

## Integration-gate note

`pnpm check:fast` was attempted while the Wave 1 harness and artifact tracks
were changing the shared worktree. Its nested build twice collided while writing
the shared `dist/server.cjs` (`operation not permitted`). A standalone fresh
`pnpm build` succeeded immediately. Running `pnpm test` separately showed this
D0 test passing, but the aggregate run remained red only in concurrent,
out-of-scope H6/G tests for workflow failure-evidence upload/capture. The
integration owner must rerun `pnpm check:fast` after those parallel slices reach
GREEN.
