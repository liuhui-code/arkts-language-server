# R4 — Changed-overlay references

Date: 2026-09-03

Parent revision: `061a46a`

## Public boundary

The test starts the production `dist/server.cjs --stdio` process, opens
`Consumer.ets` at version 1, and first requests references to populate the real
TypeScript Program from disk. It then sends a full-content `didChange` at
version 2 and queries `textDocument/references` through LSP with both values of
`includeDeclaration`.

The version-2 overlay removes two disk references and adds two references at
different ranges. One new reference follows a non-BMP emoji, so its exact range
also locks UTF-16 coordinate handling. The `.overlay` extension keeps the
expected v2 text outside project membership.

## Locked behavior

- Both declaration policies use only authoritative version-2 overlay text.
- `includeDeclaration: false` returns the unopened barrel, the overlay import,
  and all overlay usages, but no canonical declaration.
- `includeDeclaration: true` adds exactly the unopened canonical declaration.
- Neither deleted version-1 disk range survives the change.
- Every returned consumer range selects exactly `Profile` in the overlay,
  including the newly added emoji-derived UTF-16 range.
- Same-name local shadow declarations and uses remain excluded.
- Results remain non-empty, unique, and deterministically ordered.

## RED correction

After a fresh bundle, the first test run produced `1` pass and `1` failure at
the fixture's own UTF-16 precondition. The helper counted the substring
`Profile` inside the function name `cloneProfile`, so occurrence 3 selected the
return type before the emoji rather than the intended new reference. No LSP
result assertion had failed; this was not accepted as a product RED.

The fixture-only function name changed to `cloneValue`, which contains no target
token. This made every occurrence unambiguous without changing the reference
graph under test.

## Characterization GREEN

The corrected public-boundary test was GREEN on parent `061a46a` without any
production change:

```sh
pnpm build
node --test tests/semantic/references-depth.test.mjs
# 2 passed, 0 failed, 0 skipped
```

The test proves the v1 TypeScript Program contained both references that the v2
overlay deletes. Both newly added v2 ranges were absent from that populated v1
result and present after `didChange`. The exact post-change arrays exclude both
stale disk ranges and both local-shadow ranges; every consumer location selects
`Profile` in the overlay source.

Minimal production change: none. The existing document synchronization and
TypeScript Program invalidation already satisfy R4, so changing production code
would be speculative.

Focused references regression and static verification:

```sh
node --test --test-concurrency=1 \
  tests/semantic/references-depth.test.mjs \
  tests/semantic/references-completeness.test.mjs \
  tests/lsp-semantic-request-reliability.test.mjs
# 13 passed, 0 failed, 0 skipped

pnpm check
# exit 0
```

One sandboxed regression attempt was unable to write the generated
`dist/scripted-semantic-server.cjs`. Re-running the exact command with write
permission produced the result above; it was an infrastructure denial rather
than a semantic failure.
