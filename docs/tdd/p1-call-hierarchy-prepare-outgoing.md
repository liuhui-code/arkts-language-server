# P1 Call Hierarchy CH1: Prepare and Outgoing TDD Evidence

Date: 2026-09-06

## Scope

This vertical slice implements the real production-bundle stdio path for:

- `textDocument/prepareCallHierarchy`
- `callHierarchy/outgoingCalls`

It intentionally does **not** advertise `callHierarchyProvider`. Incoming calls,
protocol/reliability evidence, and installed-artifact acceptance must be complete
before clients can discover the feature.

## Parent revision

The first RED was observed from parent revision:

```text
ec96afd5408d6fd50f755e09002b4e6aa8b14db7
```

Other agents advanced the shared branch after this RED; none of their files were
modified by this slice.

## RED -> GREEN cycles

### 1. Production stdio tracer

Command:

```sh
pnpm build
node --test tests/lsp-call-hierarchy.test.mjs
```

Initial result:

```text
not ok 1 - prepares a callable and returns its exact cross-file outgoing calls over production stdio
error: {"code":-32601,"message":"Unhandled method textDocument/prepareCallHierarchy"}
```

GREEN establishes one opened ArkTS caller, one unopened target, two call sites
after emoji, exact UTF-16 ranges, and one deduplicated outgoing edge.

### 2. TypeScript arrow span containment

The independent `const renderArrow = () =>` case reproduced TypeScript 5.9's
selection span outside its declaration span.

RED:

```text
not ok 2 - widens a TypeScript arrow span so the exact selection stays inside its range
error: {"code":-32803,"message":"Call hierarchy result is incomplete: source-unmappable."}
```

GREEN maps both spans exactly, unions the mapped declaration span with the
selection range, and falls back to the selection range only when the declaration
span cannot be mapped exactly.

### 3. Canonical URI validation

RED showed a non-file document URI reaching request freshness instead of being
rejected at the protocol boundary:

```text
not ok 4 - rejects non-canonical call hierarchy document and item URIs
expected: -32602
actual:   -32801
```

GREEN accepts only canonical, round-trippable file URIs and rejects HTTP URIs,
bad percent escapes, query strings, and fragments with `InvalidParams`.

### 4. Atomic result budget

A fixture with 65 call sites initially returned the complete 65-range payload.
With the specified 64-ranges-per-edge contract restored, GREEN returns only:

```text
code: -32803
message: Call hierarchy result is incomplete: result-limit-exceeded.
```

No truncated or partial-success result is emitted.

### 5. Locale-independent ordering

A reversed target fixture deliberately distinguishes JavaScript's locale order
from ordinal code-unit order (`CallZTarget.ets < CallaTarget.ets` ordinally,
while `localeCompare` reports the reverse on the test host).

RED returned the locale-sorted URI order. GREEN uses an explicit `<` / `>`
ordinal comparator in both core and LSP normalization, while repeated calls to
one target remain grouped and range-sorted.

### 6. GREEN refactor

With all public stdio tests GREEN, Call Hierarchy validation, protocol mapping,
deduplication, ordering, and wire budgets moved into the feature-local
`src/lsp/call-hierarchy-adapter.ts`. The central capability registrar now keeps
only handler wiring; no generic schema layer or unrelated feature was changed.
The same production-bundle suite stayed GREEN after extraction.

The feature-local adapter test also passes a malformed internal item through the
public normalizer and requires the fixed `RequestFailed/source-unmappable`
response instead of leaking a JavaScript `TypeError`.

## Final focused evidence

```sh
pnpm check
# tsc --noEmit -p tsconfig.json: PASS

pnpm build
node --test tests/lsp-call-hierarchy.test.mjs
# tests 8, pass 8, fail 0, skipped 0, todo 0
```

## Implemented contracts

- Follow-up requests re-locate from `item.uri + item.selectionRange.start` in the
  current overlay. There is no server-side item cache.
- Generated/source spans require an exact round trip. Unknown TypeScript kinds
  and unmappable required spans fail closed.
- Items, edges, and call-site ranges are stable-sorted and deduplicated.
- String ordering is explicit ordinal order and does not depend on ICU, locale,
  or host defaults.
- Prepare limits: 16 items and 64 KiB final JSON.
- Outgoing limits: 256 edges, 64 ranges per edge, 2,048 total ranges, and
  256 KiB final JSON.
- Input item limits: 64 KiB total, 16 KiB URI, 4 KiB name, and 16 KiB detail.
- Budget overflow is `RequestFailed`; a stale item is `ContentModified`;
  malformed input is `InvalidParams`.

## Remaining before capability advertisement

- CH2 incoming calls with explicit complete/incomplete workspace membership.
- stdio cancellation, stale-result, shutdown, sorting, and all budget-path
  reliability evidence.
- semantic-worker protocol coverage for all three Call Hierarchy methods.
- capability contract, feature matrix, and installed immutable-artifact smoke.
- The TypeScript API remains synchronous. These result caps bound returned data,
  and core/adapter normalization fails as soon as its own count budgets are
  crossed. The TypeScript call itself may still allocate its full result, so
  worker/SAB cancellation and supervision remain required.
