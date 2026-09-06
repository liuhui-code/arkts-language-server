# P1 refresh propagation across workspace roots

Parent revision: `3b5a9d2`.

## Regression

A project-membership refresh invalidated disk documents and dependency closures, but discarded the invalidator's owner-root matches. Removing a file from a nested root therefore rebuilt an outer closure without publishing the removal, content revision, or conservative type-engine reset to that outer owner.

## RED

```text
node --test --test-name-pattern "refreshing a nested membership propagates" tests/project-file-set-cache.test.mjs
```

The outer view returned `removedPaths: []` instead of the deleted nested dependency.

## GREEN

The refresh applies the batched invalidation result to each affected closure root before publishing the new membership snapshot. Exact removed/changed paths remain root-scoped; affected owner roots advance once and removals conservatively reset their type engine. An unrelated warm root remains untouched.

```text
node --test --test-name-pattern "refreshing a nested membership propagates" tests/project-file-set-cache.test.mjs
pnpm check
```
