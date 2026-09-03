# R2/R3 references completeness

- Parent revision: `c2d0a30d283c3872eda7138fbb6dad3e609b12e0`
- Public boundary: production `dist/server.cjs --stdio`, LSP `initialize` and
  `textDocument/references`
- Fixture: `fixtures/semantic/references-completeness/`
- Test: `tests/semantic/references-completeness.test.mjs`

## Planned vertical slices

1. Overload declaration policy: `includeDeclaration: false` excludes every
   declaration of the queried overload symbol; `true` adds all of those
   canonical declarations, while import and call references remain stable.
2. A 300+ file workspace resolves unopened ArkTS `struct` references beyond
   the 256-document resident window and across the 128-entry lazy window,
   preserving virtual-document rewrites and exact UTF-16 ranges.
3. If a stable production-stdio setup can induce partial workspace membership,
   references must fail closed with JSON-RPC `RequestFailed` (`-32803`).

Each slice starts only after the previous slice is GREEN. If the current
implementation characterizes as GREEN, the next slice becomes the RED target.

## Overload contract

- Only `Consumer.ets` is opened; the overload source stays unopened.
- The query follows a non-BMP emoji and therefore exercises a UTF-16 column.
- The import and both calls are references regardless of declaration policy.
- All three overload declarations are absent when `includeDeclaration` is
  false and present when it is true.
- Repeated requests are byte-for-byte stable, sorted, deduplicated, and contain
  full non-empty identifier ranges.

## RED

Commands:

```text
pnpm build
node --test tests/semantic/references-completeness.test.mjs
```

Observed on parent revision: `0` tests passed and `1` failed. With
`includeDeclaration: false`, the server returned the three expected consumer
references but also leaked the overload signature at line 2 and the
implementation declaration at line 3 of `Formatter.ets`. Only the first
overload signature was excluded. The exact unexpected ranges were
`1:16-1:28` and `2:16-2:28` (zero-based LSP coordinates).

This is the intended stable RED. It demonstrates that classifying only the
single definition span returned at the query site is insufficient: all
declarations belonging to the same overload symbol must participate in the
declaration policy. No production change is included in this commit. Per the
vertical-slice rule, the 300+ file and partial-membership slices remain pending
until this overload contract is GREEN.
