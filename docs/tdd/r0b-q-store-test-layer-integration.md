# R0b/Q-store test-layer integration

Date: 2026-09-03

Parent revision: `5df61c0853b890dc07286df32e66142d8d3cf867`

## Public boundary

Every executable test entry must belong to exactly one explicit layer. The
R0b real-process project-membership suite belongs to `bundle-e2e`; the bounded
code-action registry contract belongs to `unit-contract`.

## RED

```text
node --test tests/test-layer-manifest.test.mjs
```

The manifest audit failed closed because both new entries were discovered but
unclassified:

```text
tests/code-action-resolution-store.test.mjs: discovered test has no layer
tests/semantic/project-membership-language-service.test.mjs: discovered test has no layer
```

## GREEN

Both paths were added once to their closest layer and the explicit aggregate
assertions advanced from 39 to 41 entries (`unit-contract`: 20,
`bundle-e2e`: 12). The same command then passed 2/2 with no failures or skips.

