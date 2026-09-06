# P1 TypeScript cancellation bridge RED/GREEN

Date: 2026-09-06

Parent revision: `f064358`

## Scope

This T4b tracer bullet specifies the smallest public bridge between the existing
`SemanticCancellationScope` and a real `TypeScriptLanguageServiceEngine`
query.

The test bundles the engine, scope, worker cancellation enum, and TypeScript's
`OperationCanceledException` constructor into one CommonJS driver. A resident
`Main.ts` and complete project membership containing unopened `Caller.ts` force
TypeScript to request a lazy project snapshot while running `references`.
The injected lazy reader synchronously changes the request's four-byte shared
cell to `clientCancelled`; no timer or sleep participates in the result.

The observable contract is stricter than merely rejecting `scope.run`:

- the lazy `Caller.ts` read must have happened;
- the real TypeScript `OperationCanceledException` must be caught while the
  direct `engine.references(...)` call is still on the stack;
- `engine.references(...)` must not return a normal result and leave the
  scope's exit checkpoint to discover cancellation later.

This distinction prevents the adapter's already-tested final checkpoint from
producing a false-positive claim that TypeScript itself is interruptible.

## RED evidence

Command:

```text
node --test tests/semantic/typescript-cancellation-bridge.test.mjs
```

Observed result at the parent revision:

```text
not ok 1 - interrupts a real TypeScript references query from a lazy project snapshot
error: 'TypeScript must throw while engine.references is still on the stack'
expected: true
actual: false
tests 1; pass 0; fail 1; skipped 0; todo 0; cancelled 0
```

The lazy read did set the cell and the enclosing `scope.run` rejected with the
same bundled TypeScript exception class, but only at the scope exit checkpoint.
`engine.references` returned normally because the language-service host does
not yet expose the scope's stable token to TypeScript. This is the intended,
behavior-specific RED.

## Minimal implementation

`TypeScriptLanguageServiceEngineOptions` now accepts an optional
`ts.HostCancellationToken`. The engine captures that token while constructing
the TypeScript language service, and the host's optional
`getCancellationToken()` method always returns the same instance. Core remains
independent of `SemanticCancellationScope`; composition stays with the future
worker dispatcher.

## GREEN evidence

Focused command:

```text
node --test tests/semantic/typescript-cancellation-bridge.test.mjs
```

Observed result:

```text
tests 1; pass 1; fail 0; skipped 0; todo 0; cancelled 0
```

Related semantic regression command:

```text
node --test tests/semantic/typescript-cancellation-bridge.test.mjs tests/semantic/project-membership-language-service.test.mjs tests/semantic/references-depth.test.mjs
```

Observed result:

```text
tests 8; pass 8; fail 0; skipped 0; todo 0; cancelled 0
```

Static contract check:

```text
pnpm check
```

Observed result: PASS.

## Deferred work

Worker dispatch, owned-loop checkpoints, first-cause response mapping, and
stdio responsiveness remain later slices. The bridge does not claim that
ArkLine-owned result mapping loops are interruptible yet.

The test-layer manifest remains intentionally unchanged in this slice. Register
the now-GREEN test in the separate layer-governance RED/GREEN slice so manifest
policy and runtime behavior keep independent evidence.
