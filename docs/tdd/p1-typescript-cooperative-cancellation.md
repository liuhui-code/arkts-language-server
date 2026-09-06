# P1 TypeScript owned-loop cooperative cancellation RED/GREEN

Date: 2026-09-06

Parent revision: `42eead1`

## Scope

This T4d-1 tracer bullet covers only the owned result-processing work in
`TypeScriptLanguageServiceEngine.references`. The existing host token can stop
work while TypeScript is on the stack, but it cannot observe cancellation after
TypeScript has returned a large result to ArkLine.

The public test calls `engine.references(...)` with 130 reference entries from a
controlled language-service boundary. Reading the 64th entry synchronously
changes a real `SemanticCancellationScope` shared cell to `clientCancelled`.
The contract requires all of the following without sleeps, timers, or a fake
exception:

- the real TypeScript `OperationCanceledException` is caught while
  `engine.references(...)` is still on the stack;
- the 65th entry is never accessed;
- no partial semantic result is published;
- a retry under a fresh active cell returns all 130 locations in stable source
  order.

## RED evidence

Command:

```text
node --test tests/semantic/typescript-cooperative-cancellation.test.mjs
```

Observed result at the parent revision:

```text
not ok 1 - cancels references during result mapping without publishing partial results
error: 'engine.references must observe cancellation while mapping its own result'
expected: true
actual: false
tests 1; pass 0; fail 1; skipped 0; todo 0; cancelled 0
```

The 64th getter changed the cell, but the engine consumed all remaining entries
and returned a complete value. Only the enclosing scope's exit checkpoint then
threw, so the exception was not caught inside `engine.references` and the
method had already published a result.

## Minimal implementation

`TypeScriptLanguageServiceEngineOptions` now accepts a separate optional
`checkpoint` callback. It remains independent from `hostCancellationToken` and
defaults to no work; core code does not import the semantic cancellation scope.

A request-local `CooperativeWork` performs explicit boundary checks before and
after TypeScript definition/reference calls, after each 64 owned mapping or
sorting operations, and immediately before a normal return. `references` maps
each `findReferences` response before querying the next definition instead of
building the former `definitions.flatMap(...)` intermediate. Checkpoints never
run from `finally`, so cancellation cannot replace an exception already thrown
by TypeScript or mapping code.

## GREEN evidence

Focused command:

```text
node --test tests/semantic/typescript-cooperative-cancellation.test.mjs
```

Observed result:

```text
tests 1; pass 1; fail 0; skipped 0; todo 0; cancelled 0
```

Related semantic regression command after a fresh bundle build:

```text
pnpm build
node --test tests/semantic/typescript-cooperative-cancellation.test.mjs tests/semantic/typescript-cancellation-bridge.test.mjs tests/semantic/project-membership-language-service.test.mjs tests/semantic/references-depth.test.mjs
```

Observed result:

```text
tests 9; pass 9; fail 0; skipped 0; todo 0; cancelled 0
```

Static contract check:

```text
pnpm check
```

Observed result: PASS.

## Deferred work

This slice makes no completeness claim for rename, implementations,
diagnostics, symbols, completions, highlights, inlay hints, definitions, or
type definitions. They require their own public RED/GREEN slices. Worker
dispatcher composition and test-layer registration also remain separate
governance slices.
