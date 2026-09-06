# P1 cancellation test-layer integration

Date: 2026-09-06

Parent revision: `bfe65f7`

## Scope

This developer-tooling slice registers the three GREEN cancellation contract
entries added by T4b, T4c, and T4d-1. They compile or exercise core components
directly and do not launch the production LSP bundle, so each belongs to the
fast `unit-contract` layer.

## RED

Command:

```text
node --test tests/test-layer-manifest.test.mjs
```

Observed result:

```text
tests 2; pass 1; fail 1
Invalid test layer manifest:
- tests/document-store-cancellation.test.mjs: discovered test has no layer
- tests/semantic/typescript-cancellation-bridge.test.mjs: discovered test has no layer
- tests/semantic/typescript-cooperative-cancellation.test.mjs: discovered test has no layer
```

## Minimal GREEN

The three entries are assigned exactly once to `unit-contract`. The expected
repository entry count advances from 70 to 73 and the unit-contract count from
31 to 34. No package script, production code, capability, or workflow changes
in this slice.

## Verification

```text
node --test tests/test-layer-manifest.test.mjs
tests 2; pass 2; fail 0; skipped 0; todo 0; cancelled 0
```
