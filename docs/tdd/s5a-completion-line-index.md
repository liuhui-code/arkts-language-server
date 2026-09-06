# S5a completion range line index: TDD evidence

Scope: remove repeated full-source line scans from virtual-document completion
range mapping by reusing one immutable line-start index.

## TDD exception for this evidence file

- Reason: this file records a completed utility/performance slice and changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Initial parent revision: `44ae88c`

## RED

The cooperative driver test requested a reusable line-start index API. Before
the change, the exported function was absent:

```sh
node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs \
  --test-name-pattern "maps large-file offsets through a reusable line-start index"
# FAIL: createLineStartIndex is not a function
```

## GREEN

`createLineStartIndex` builds one bounded array of newline offsets and
`offsetToLineColumn` performs an upper-bound binary search. The virtual ArkTS
document builds this index once and reuses it for every generated span mapped
during completion and navigation.

```sh
pnpm check
# PASS
node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs \
  --test-name-pattern "maps large-file offsets through a reusable line-start index"
# PASS
```

The full T9 p95/RSS/cancellation benchmark and native continuation remain open
under S5/S6.
