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

## Overload GREEN

The main implementation subsequently classified all declarations belonging to
the referenced symbol. Re-running the focused public-boundary test returned
`1` passed, `0` failed and `0` skipped, so the next slice was allowed to start.

## Large-project contract

- The checked-in fixture keeps only the consumer, remote usage, and ArkTS
  `struct` declaration readable. The test creates 400 deterministic filler
  `.ets` files in a temporary workspace, for 403 project files total.
- Lexicographic membership order places both unopened result files after index
  `384`, beyond the 256-document resident window plus the 128-entry lazy
  snapshot window. Only the consumer receives `didOpen`.
- The consumer query, unopened remote usage, and unopened declaration all put
  `RemoteProfile` after a non-BMP emoji. Expected ranges therefore prove exact
  UTF-16 mapping, including mapping back from the `struct`-to-`class` virtual
  rewrite.
- Both declaration policies are requested twice and must yield stable, sorted,
  deduplicated, full identifier ranges.

## Large-project RED or characterization

Commands:

```text
pnpm build
node --test tests/semantic/references-completeness.test.mjs
```

Observed: both the overload case and the new 403-file case passed (`2` passed,
`0` failed, `0` skipped). The large-project request itself completed in about
`1.1 s` on the development host. This is a GREEN characterization: no
production change was needed for the resident/lazy-window and ArkTS source-map
contract.

## Partial-membership contract

- The test uses the production hard public behavior instead of an injected
  document-store limit: one opened consumer plus 20,000 generated `.ets` files
  exceeds the 20,000-path membership ceiling.
- The query is a valid local symbol reference after a non-BMP emoji, so an
  empty or partial success would be observably incorrect.
- Both declaration-policy variants must deterministically return JSON-RPC
  `RequestFailed` (`-32803`) with `References require a complete workspace
  snapshot` and no partial result.

## Partial-membership RED or characterization

The first fixture execution stopped before the server request because the
queried occurrence was on a line without the intended emoji prefix. Moving the
emoji onto that usage line corrected the test precondition; this was a test
fixture defect, not a production RED.

Focused command:

```text
node --test --test-name-pattern="fails references closed" \
  tests/semantic/references-completeness.test.mjs
# 1 passed, 0 failed, 2 skipped by the explicit name filter
```

The corrected public-boundary case is GREEN. Both requests return the exact
`-32803` failure and no result, so the current implementation already fails
closed when production membership discovery reaches its path ceiling.

## Final verification

```text
node --test tests/semantic/references-completeness.test.mjs
# 3 passed, 0 failed, 0 skipped
```

The unfiltered run completed in about `5.45 s`: overload classification,
403-file resident/lazy pressure, and 20,001-file fail-closed membership all
pass through the production stdio bundle. The latter two slices are explicit
GREEN characterizations and required no production edits.
