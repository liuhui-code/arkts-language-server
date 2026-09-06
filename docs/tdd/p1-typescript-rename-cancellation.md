# P1 TypeScript rename cooperative cancellation RED/GREEN

Date: 2026-09-06

Parent revision: `707b6af`

## Scope

This T4d-2 tracer bullet covers request-owned work in the public
`TypeScriptLanguageServiceEngine.rename(...)` path. The TypeScript host token
can cancel while TypeScript itself is executing, but the prior implementation
did not poll while it mapped, sorted, and overlap-checked a large
`findRenameLocations` result.

The test supplies 130 valid locations through a controlled language-service
boundary. Reading the 64th location synchronously changes a real
`SemanticCancellationScope` shared cell to `clientCancelled`. The observable
contract requires all of the following without sleeps, timers, or a synthetic
exception:

- the real TypeScript `OperationCanceledException` is caught while
  `engine.rename(...)` is still on the stack;
- the 65th raw location is never accessed;
- no partial rename result is published;
- a retry under a fresh active cell returns all 130 edits in stable source
  order and keeps them non-overlapping.

## RED evidence

Command:

```text
node --test tests/semantic/typescript-rename-cancellation.test.mjs
```

Observed result at the parent revision:

```text
not ok 1 - cancels rename during result mapping without publishing partial edits
error: 'engine.rename must observe cancellation while mapping its own result'
expected: true
actual: false
tests 1; pass 0; fail 1; skipped 0; todo 0; cancelled 0
```

The shared cell changed while `rename` consumed its result, but the method
continued through the remaining locations and returned a complete value. Only
the enclosing cancellation scope's exit checkpoint threw, after a result had
already escaped the engine boundary.

## Minimal implementation

`rename` now creates one request-local `CooperativeWork`, using the existing
optional engine checkpoint port. It checks:

- at request entry and immediately before a normal return;
- before and after `getRenameInfo`, conflict preflight, and
  `findRenameLocations` boundaries;
- after every 64 owned location-mapping operations;
- after every 64 sort comparisons;
- after every 64 overlap comparisons.

All edits remain local until the final checkpoint succeeds, so cancellation
cannot publish a partial result. Checks do not run in `finally`, preserving an
exception already thrown by TypeScript or mapping code. No references behavior
or worker protocol was changed by this slice.

## GREEN evidence

Focused command:

```text
node --test tests/semantic/typescript-rename-cancellation.test.mjs
```

Observed result:

```text
tests 1; pass 1; fail 0; skipped 0; todo 0; cancelled 0
```

Related cancellation and rename regressions after a fresh bundle build:

```text
pnpm build
node --test tests/semantic/typescript-rename-cancellation.test.mjs tests/semantic/typescript-cooperative-cancellation.test.mjs tests/semantic/typescript-cancellation-bridge.test.mjs tests/semantic/rename-depth.test.mjs tests/semantic/rename-completeness.test.mjs
```

Observed result:

```text
tests 13; pass 13; fail 0; skipped 0; todo 0; cancelled 0
```

Static contract check:

```text
pnpm check
```

Observed result: PASS.

## Deferred work

This slice deliberately treats the existing top-level class conflict preflight
as one synchronous boundary. Its internal AST and symbol-table traversal does
not yet expose cooperative checkpoints; cancellation is checked immediately
before and after it. If profiling shows that traversal can exceed the latency
budget on large source files, it needs a separate public RED/GREEN slice rather
than widening this one.

Implementations, diagnostics, symbols, completions, highlights, inlay hints,
definitions, and type definitions remain outside this slice. Test-layer
registration is owned by the separate governance slice.
