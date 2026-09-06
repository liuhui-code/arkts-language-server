# P1 TypeScript completion and implementation cancellation: TDD evidence

Public test boundary: `TypeScriptLanguageServiceEngine` running inside a real
`SemanticCancellationScope` with a real four-byte `SharedArrayBuffer` cell. The TypeScript service
result is controlled only to place cancellation deterministically inside ArkTS-owned result work;
there are no timers or sleeps.

## Completion raw scan

Parent revision: `560784d`

RED command:

```sh
node --test --test-name-pattern "cancels completion during the bounded raw entry scan" \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
```

Observed RED: the old `filter(...).slice(0, 128).map(...)` visited the sixty-fifth raw entry after
the sixty-fourth entry cancelled the request. It also scanned entries beyond the 128 matching
results that could be returned. Cancellation was raised only by the outer scope exit, after
`engine.complete()` had published a result to its caller.

Minimal GREEN (`9e971f9`): bracket the TypeScript call with request-local boundaries, scan entries
once, checkpoint every 64 raw entries, and stop as soon as 128 matching results have been mapped.
Filtering, provider order, and the first-128-matches contract remain unchanged. A fresh cell returns
exactly `method0` through `method127`; the 129th raw entry is never read.

## Implementations filtering and candidate mapping

Parent revision: `9e971f9`

The first RED covered the raw implementation filter. Adversarial review correctly rejected that
as insufficient evidence for the declaration Set and shared candidate mapper changed by the same
slice. With production restored to the parent implementation, the three isolated cases were run
together:

```sh
node --test --test-name-pattern "cancels implementations" \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
```

Observed RED: 3/3 selected implementation cases failed. Each old loop reached its sixty-fifth
controlled entry and returned work before the outer scope noticed cancellation. The declaration
case also called `getImplementationAtPosition` after cancellation.

Minimal GREEN (`f8cb383`): use one request-local `CooperativeWork` across the definition provider,
declaration Set, implementation provider, raw implementation filter, and shared candidate mapper.
Provider calls have before/after boundaries; owned loops checkpoint every 64 items; the mapper
finishes with a final checkpoint. The three guards separately prove cancellation inside each loop,
no sixty-fifth access, no partial publication, and a complete fresh-cell retry.

Final focused and adjacent evidence:

```sh
node --test --test-concurrency=1 tests/semantic/typescript-cooperative-cancellation.test.mjs
# 5/5 passed; 0 failed/skipped/todo/cancelled

pnpm check
# PASS

pnpm build
# PASS; rebuilds repository dist from f8cb383

node --test --test-concurrency=1 tests/lsp-transcript.test.mjs
# 9/9 passed; 0 failed/skipped/todo/cancelled
```

This evidence proves cooperative behavior in the TypeScript core prepared for the semantic worker.
The production server still owns the engine on the main thread; worker dispatcher/endpoint/proxy,
completion-resolve edits, definition/typeDefinition activation, Registry/ArkUI merges, Legacy/LSP
mapping, bounded Call Hierarchy cadence, and real-process responsiveness evidence remain separate
checklist items.
