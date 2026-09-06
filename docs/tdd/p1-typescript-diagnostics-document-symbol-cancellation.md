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
- navigation mapping shares one work budget and checks every visited node;
- child and top-level sort comparators participate in that same budget;
- a final checkpoint runs before any completed tree is returned.

## Post-review P1: wide and deep navigation trees

Independent review found one regression and one unmet cancellation guarantee in `3d69963`:

1. `push(...navigationSymbol(...))` passed a promoted child list as function arguments.
   A synthetic unsupported container with 150,000 recognizable children threw
   `RangeError: Maximum call stack size exceeded`; the pre-change `flatMap` path did not.
2. The new cancellation contract was incomplete: the recursive mapper counted work only
   after visiting descendants. Cancellation at entry to node 64 of a 1,000-node chain
   therefore still accessed node 65 and the rest of the chain before observing
   cancellation during unwind.

### Slice 3: unsupported wide-container promotion

The fixed size of 150,000 is intentionally just a synthetic result tree, not a generated
source file. It is above the Node 20/V8 spread argument limit on the supported runtime,
reproduces in about one second locally, and avoids TypeScript parsing or a larger fixture.

RED on `cbc6dea` (including `3d69963`):

```text
node --test --test-name-pattern="wide unsupported" \
  tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
not ok 3 - promotes a wide unsupported navigation container without spread overflow
RangeError: Maximum call stack size exceeded
tests 3; pass 0; fail 1; skipped 2
```

GREEN after replacing both navigation-result spreads with single-item pushes:

```text
node --test --test-name-pattern="wide unsupported" \
  tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
tests 3; pass 1; fail 0; skipped 2
```

The contract asserts all 150,000 promoted symbols are returned and samples their first,
65th, and final names to protect stable order.

### Slice 4: deep-tree entry cancellation

RED after Slice 3:

```text
node --test --test-name-pattern="deep navigation" \
  tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
not ok 4 - cancels a deep navigation tree before entering the sixty-fifth node
Expected values to be strictly equal: true !== false
tests 4; pass 0; fail 1; skipped 3
```

The failing boolean was the node-65 access marker. Cancellation was injected through a
real SAB while reading node 64's span, but recursive post-order accounting entered all
remaining descendants first.

GREEN uses an explicit iterative depth-first traversal with post-order frames:

```text
node --test tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs
tests 4; pass 4; fail 0
```

The traversal now:

- accounts for work immediately after entering each raw node;
- never uses a result array as function arguments;
- appends promoted unsupported-container children one item at a time, with checkpoints;
- builds recognized hierarchies during iterative post-order frame completion;
- retains per-container and top-level cooperative sorting.

## Honest boundary

This evidence covers only synchronous work owned by the TypeScript core engine while it
maps diagnostic and document-symbol results. It does not prove cancellation in the
registry, legacy server, ArkUI composition, later LSP conversion, or production stdio
dispatch. It also cannot preempt arbitrary synchronous work inside TypeScript between
host-token polls.
