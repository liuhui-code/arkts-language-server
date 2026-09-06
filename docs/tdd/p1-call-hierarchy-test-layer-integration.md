# P1 Call Hierarchy and cancellation test-layer integration

Date: 2026-09-06

Parent revision: `1ef51ef`

## Scope

This developer-tooling slice classifies three independently GREEN entries:

- Call Hierarchy LSP cancellation/freshness/shutdown evidence belongs to the
  real-process `protocol` layer.
- Call Hierarchy worker codec and TypeScript rename owned-loop cancellation
  are direct core/contract tests and belong to `unit-contract`.

No production capability, protocol implementation, package script, or CI
workflow changes in this slice.

## RED

```text
node --test tests/test-layer-manifest.test.mjs
tests 2; pass 1; fail 1
Invalid test layer manifest:
- tests/lsp-call-hierarchy-reliability.test.mjs: discovered test has no layer
- tests/semantic-worker-call-hierarchy-protocol.test.mjs: discovered test has no layer
- tests/semantic/typescript-rename-cancellation.test.mjs: discovered test has no layer
```

## Minimal GREEN

The three entries are assigned exactly once. Repository entry count advances
from 73 to 76, `unit-contract` from 34 to 36, and `protocol` from 7 to 8.

## Verification

```text
node --test tests/test-layer-manifest.test.mjs
tests 2; pass 2; fail 0; skipped 0; todo 0; cancelled 0
```
