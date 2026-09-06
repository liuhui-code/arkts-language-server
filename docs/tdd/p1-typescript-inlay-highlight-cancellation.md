# P1 TypeScript inlay hint and document highlight cancellation: TDD evidence

Public test boundary: `TypeScriptLanguageServiceEngine` inside a real
`SemanticCancellationScope`, using the protocol's four-byte `SharedArrayBuffer` cancellation cell.
Controlled TypeScript results place cancellation deterministically inside ArkTS-owned loops; no
timer or sleep is used.

## Inlay provider and raw result mapping

Parent revision: `4b399c3`

RED command:

```sh
node --test --test-concurrency=1 \
  tests/semantic/typescript-inlay-highlight-cancellation.test.mjs
```

Observed RED: 2/2 tests failed. The provider-return case read its first hint after the provider had
cancelled. The 130-hint mapping case entered the sixty-fifth result after the sixty-fourth result
cancelled and returned a list before cancellation was noticed at scope exit.

Minimal GREEN (`39c052f`): bracket `provideInlayHints` with request-local boundaries, replace eager
`flatMap` with one explicit provider-order loop, checkpoint every 64 raw hints, and finish with a
tail checkpoint. Kind, label, source mapping, range, and padding filters retain their existing
semantics. No result cap moved into the core.

Adding the new test first made the layer manifest RED as unclassified. Registration then exposed
the guarded total and unit-layer counts (`78` and `38`), which were updated before the manifest
returned 2/2 GREEN. This makes the cancellation regression part of every fast gate.

## Inlay display parts

Parent revision: `39c052f`

RED command:

```sh
node --test --test-name-pattern "cancels inlay hints during display-part label mapping" \
  tests/semantic/typescript-inlay-highlight-cancellation.test.mjs
```

Observed RED: 1/1 selected test failed because the sixty-fifth display part was accessed.

The single-hint RED flipped cancellation while reading display part 64. The old
`displayParts.map(...).join("")` still read part 65; raw-hint cadence could only reject after the
whole label was built.

Minimal GREEN (`8c2a649`): preserve non-empty `hint.text` precedence and concatenate fallback
display parts in source order, but checkpoint the shared request-local work counter after every
part. The focused file became 3/3 GREEN; a fresh cell rebuilt the complete 130-part label.

## Document highlight provider, nested mapping, and sort

Parent revision: `8c2a649`

Four isolated cases were run against the parent implementation:

```sh
node --test --test-name-pattern "cancels document highlights" \
  tests/semantic/typescript-inlay-highlight-cancellation.test.mjs
```

Observed RED: 4/4 selected tests failed. They independently proved the missing provider-return
boundary, empty-group cadence, span cadence, and comparator cadence. Each case distinguishes an
in-method cancellation from a late scope-exit cancellation and verifies no partial publication.

Minimal GREEN (`8d59011`): use one `CooperativeWork` across provider boundaries, every group, every
span (including duplicates), and the existing deterministic sort comparator. Foreign groups,
unmappable spans, and unknown kinds retain fail-closed empty-result behavior. Fresh retries rebuild
complete source-sorted results without leaking partially sorted state.

Final focused and adjacent evidence:

```sh
node --test --test-concurrency=1 \
  tests/semantic/typescript-inlay-highlight-cancellation.test.mjs \
  tests/semantic/document-highlight-core.test.mjs
# 8/8 passed; 0 failed/skipped/todo/cancelled

pnpm check
# PASS

pnpm build
# PASS; fresh repository bundle from the slice source

node --test --test-concurrency=1 tests/semantic/document-highlight-depth.test.mjs
# 1/1 passed; 0 failed/skipped/todo/cancelled
```

The LSP inlay contract sorts and deduplicates the complete mapped set before applying its
1,000-item/256-KiB wire budget. An early core cutoff would change that result and was deliberately
not added. A single huge display-part string/native join, Legacy mapping, LSP normalize/sort/byte
accounting, and production worker composition remain separate memory/cancellation work.
