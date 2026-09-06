# P1 TypeScript definition cancellation: TDD evidence

Public test boundary: `TypeScriptLanguageServiceEngine.define` and
`TypeScriptLanguageServiceEngine.typeDefinitions` inside a real `SemanticCancellationScope`, using
the protocol's four-byte `SharedArrayBuffer` cancellation cell. Controlled providers and result
objects place cancellation deterministically at ArkTS-owned boundaries without timers or sleeps.

Parent revision: `fd58a51`

## RED

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "cancels (define|typeDefinitions)" \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
```

Observed RED: 4/4 selected tests failed. For both public routes, one case cancelled immediately
before the TypeScript provider returned; the old method still returned a candidate and cancellation
was only detected by the enclosing scope. A second case cancelled on candidate 64; the old mapper
continued into candidate 65 and returned the complete candidate list to its immediate caller before
cancellation was noticed at scope exit.

Each test captures the exception inside the engine call, keeps the published result undefined, and
uses a fresh cancellation cell to prove a complete retry. Provider-return cases also expose a first
candidate access sentinel, so a late `finish()` checkpoint cannot falsely satisfy the boundary test.

## Minimal GREEN

Commit `b4b3fbc` makes `define` and `typeDefinitions` each construct one request-local
`CooperativeWork(this.checkpoint)` and pass it through the existing shared candidate mapper. The
mapper already brackets provider calls, checkpoints every 64 candidates, and checks the tail. Its
no-op default argument was removed so future call sites cannot silently disable cancellation.

No mapping, first-wins deduplication, provider-order, source-range, or lazy-file behavior changed.

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "cancels (define|typeDefinitions)" \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 4/4 selected passed

node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 9/9 passed; 0 failed/skipped/todo/cancelled

pnpm check
# PASS

pnpm build
# PASS; fresh stdio bundle

node --test --test-concurrency=1 \
  --test-name-pattern "cross-file definition|type definition" \
  tests/lsp-transcript.test.mjs
# 2/2 selected passed
```

Independent review found no P0/P1 after the provider access sentinel was added. This closes only
the TypeScript core definition and type-definition routes; completion resolve, Call Hierarchy
cadence, downstream Registry/ArkUI/Legacy/LSP loops, and production worker composition remain open.
