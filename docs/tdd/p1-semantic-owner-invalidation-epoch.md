# P1 semantic owner invalidation epoch

## Contract

Two lexical workspace roots may resolve to one physical workspace, while each
TypeScript language service must retain its lexical root so module resolution,
script names, and root-containment checks remain correct. Store invalidation is
owned by the canonical physical root, so a one-shot `removedPaths` or
`resetTypeEngine` payload consumed by one lexical view must not leave another
lexical engine stale.

The bounded registry therefore keeps one engine per lexical root (maximum four)
and uses Store-provided canonical owner identity plus durable reset/content
cursors as a coherence fence. It does not merge lexical script namespaces into
one physical-root engine and does not perform `realpath` on every semantic
query. ArkUI invalidation performs one root canonicalization, then a bounded
fan-out over the same four entries.

## RED

Parent revision: `8d965ca`.

The public Store-to-Registry reproduction used two directory symlinks pointing
to the same physical project. Both lexical `Main.ets` documents resolved their
own lexical `Target.ets`. After deleting the physical target, the first view
consumed `resetTypeEngine=true` and the removal; the second view observed
`resetTypeEngine=false` and `removedPaths=[]`, then still defined the deleted
second-alias target:

```text
node --test --test-name-pattern "rebuilds a stale lexical type engine" tests/workspace-file-change-coordinator.test.mjs
not ok - rebuilds a stale lexical type engine after another alias consumes a root reset
Expected values to be strictly equal: 1 !== 0
```

A second vertical regression showed that a lexical engine at content revision
zero could receive only the later delta at revision two and retain a target
removed by the missed revision. Before the content cursor fence, the deleted
target predicate was `true` instead of `false`.

ArkUI had the analogous owner split. Invalidating the first alias refreshed only
that lexical provider; the second alias still returned `owner_old`:

```text
node --test --test-name-pattern "fans out ArkUI invalidation" tests/workspace-file-change-coordinator.test.mjs
expected: [ "owner_new" ]
actual:   [ "owner_old" ]
```

## GREEN

- `SemanticWorkspaceView` publishes `canonicalRootId` and a persistent
  `typeEngineResetEpoch` from the DocumentStore canonical-root state.
- Every scoped reset advances that epoch once while the reset is pending; the
  epoch remains visible after the one-shot boolean/delta is consumed.
- Registry entries retain lexical engine/provider roots and record canonical
  owner, reset epoch, and applied content revision only after a successful
  prepare.
- Owner changes, reset-epoch mismatches, revision gaps, and revision advances
  without a delta rebuild only the affected lexical entry. A contiguous precise
  delta remains incremental.
- ArkUI invalidation hits the exact lexical entry (important after symlink
  retarget) and every bounded entry with the current canonical owner.
- Distinct physical roots continue to own two independent engines; a canonical
  owner retarget recreates only the lexical entry whose identity changed.

Focused and neighboring verification commands are recorded with the commit.
