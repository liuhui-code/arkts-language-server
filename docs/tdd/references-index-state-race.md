# References index state race

Parent revision: `422408fccf24844731651362acc650867362e7ac`.
This R-07 slice preserves the complete LSP references result when a sidecar
starts a new catalog after serving candidates from its previous generation.

## RED

A real child-process, Content-Length-framed LSP test uses three ArkTS files.
The scripted sidecar returns a `ready` candidate result at generation 1 that
omits `Use.ets`, then reports `warming` while generation 1 remains committed.
The direct-import anchor incorrectly accepted that candidate and omitted a
known real reference:

```text
node --test tests/semantic/references-index-state-race.test.mjs
not ok - complete references must include the file omitted from stale candidates
```

After fixing the direct path, the same RED was reproduced for the independent
definition-anchor path: direct candidates were unsupported, the compiler
resolved the declaration, and its candidate search then accepted a warming
sidecar's old generation.

The test-layer manifest also failed until the new public transcript was
assigned to `bundle-e2e`.

## GREEN

Both candidate-acceptance paths now require the sidecar's current state to be
`ready` as well as matching the served and committed generations. Ineligible
candidates trigger the existing complete semantic fallback; no partial
candidate result is returned. A shared predicate keeps the two paths aligned.

```text
pnpm build
node --test tests/semantic/references-index-state-race.test.mjs \
  tests/semantic/references-index-resync.test.mjs
3 tests passed
node --test tests/test-layer-manifest.test.mjs
4 tests passed
pnpm check:fast
944 tests passed, 0 failed (macOS process-inspection permission granted)
```

The new test and fixture each stay below 500 physical lines. The existing
over-limit `semantic-worker-proxy.ts` shrinks in this change rather than
growing; the separate state predicate is owned by `ReferenceIndexFreshness`.
