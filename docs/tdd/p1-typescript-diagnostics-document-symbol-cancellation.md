# TypeScript diagnostics and document-symbol cancellation evidence

Date: 2026-09-06  
Parent revision: `532811f`  
Scope: TypeScript core-owned diagnostic and navigation-tree result mapping only.

## Test-layer registration

The new contract was first discovered without a layer:

```text
node --test tests/test-layer-manifest.test.mjs
not ok 1 - classifies every executable test entry exactly once in an explicit layer
Invalid test layer manifest:
- tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs: discovered test has no layer
tests 2; pass 1; fail 1
```

It is registered exactly once in `unit-contract`. After registration:

```text
node --test tests/test-layer-manifest.test.mjs
tests 2; pass 2; fail 0
```

## Slice 1: diagnostics result mapping

Behavior: with 130 real TypeScript semantic diagnostics, cancellation injected while
mapping item 64 must throw `ts.OperationCanceledException` from inside
`engine.diagnostics`; item 65 is not accessed, no partial list is returned, and a fresh
request returns all 130 diagnostics in source order.

RED on parent `532811f`:

```text
node --test tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
not ok 1 - cancels diagnostics during result mapping without publishing a partial list
engine.diagnostics must observe cancellation while mapping its own result
tests 1; pass 0; fail 1
```

The failure distinguishes core cancellation from the outer scope safety net: the scope
eventually threw on exit, but `engine.diagnostics` had already returned its result.

GREEN:

```text
node --test tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
tests 1; pass 1; fail 0

node --test tests/semantic/diagnostic-code-characterization.test.mjs \
  tests/semantic/arkui-diagnostics-depth.test.mjs
tests 16; pass 16; fail 0
```

Implementation boundaries:

- request-local `CooperativeWork` checkpoints before and after TypeScript diagnostic calls;
- nested group/item mapping replaces eager `flat().flatMap()` allocation;
- mapping checks cancellation every 64 inspected diagnostics and again before return.

## Slice 2: navigation-tree result mapping

Behavior: with 130 real top-level TypeScript navigation items, cancellation injected
while mapping item 64 must throw `ts.OperationCanceledException` from inside
`engine.documentSymbols`; item 65 is not accessed, no partial tree is returned, and a
fresh request returns all 130 symbols in source order.

RED after Slice 1:

```text
node --test --test-name-pattern="document symbols" \
  tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
not ok 2 - cancels document symbols during navigation mapping without publishing a partial tree
engine.documentSymbols must observe cancellation while mapping its own result
tests 2; pass 0; fail 1; skipped 1
```

As in Slice 1, the outer scope did eventually throw, but the engine had already returned
the complete result. That proves the RED was inside the intended ownership boundary.

GREEN:

```text
node --test tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
tests 2; pass 2; fail 0
```

Implementation boundaries:

- request-local `CooperativeWork` checkpoints before and after `getNavigationTree`;
- recursive mapping shares one work budget and checks after each visited node;
- child and top-level sort comparators participate in that same budget;
- a final checkpoint runs before any completed tree is returned.

## Honest boundary

This evidence covers only synchronous work owned by the TypeScript core engine while it
maps diagnostic and document-symbol results. It does not prove cancellation in the
registry, legacy server, ArkUI composition, later LSP conversion, or production stdio
dispatch. It also cannot preempt arbitrary synchronous work inside TypeScript between
host-token polls.
