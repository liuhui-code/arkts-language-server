# P1 TypeScript completion resolve cancellation: TDD evidence

Scope: `TypeScriptLanguageServiceEngine.resolveCompletion` inside a real
`SemanticCancellationScope`, with the protocol's four-byte `SharedArrayBuffer` cancellation cell.
The tests control TypeScript provider results and property access, so cancellation is deterministic
and uses no timers or sleeps.

Parent revision: `f9be10b`

## Initial RED

```sh
node --test --test-concurrency=1 \
  tests/semantic/typescript-completion-resolve-cancellation.test.mjs
```

Observed RED: 7/7 tests failed. The old method only exposed the outer scope checkpoint, so details
provider return, detail parts, documentation parts, action scan, change validation, change-group
mapping, and text-change mapping all completed after cancellation. Each test distinguishes an
exception thrown inside `resolveCompletion` from a late scope-exit exception, rejects publication,
and proves a complete fresh-cell retry. The provider case guards the first details access; each of
the six owned-loop cases guards item 65 after cancellation at item 64.

## Vertical GREEN slices

1. One request-local `CooperativeWork` plus entry/provider/tail boundaries made the provider case
   1/1 GREEN while the other 6 cases remained RED.
2. Explicit provider-order display-part loops made detail and documentation 2/2 GREEN. Empty detail
   and documentation still fall back to the original item.
3. Replacing `find/every/flatMap/map` with explicit loops made the four action/change cases GREEN
   without intermediate edit arrays. The chosen action remains the first commandless, non-empty,
   same-current-file, non-new-file action; all edits retain provider order, range, text, and expected
   document version.

Independent review found an intermediate short-circuit regression: the explicit loop read
`candidate.changes` before rejecting `candidate.commands`. A getter characterization first made the
current refactor RED; restoring the old access order made it GREEN. The same test also places empty,
foreign-file, new-file, first-safe, and second-safe actions in order, preventing silent predicate or
first-match drift.

No result cap was added. Completion additional edits are atomic; partially truncating an import edit
set would corrupt behavior and the current result contract has no incomplete outcome.

## Final focused and adjacent evidence

```sh
node --test --test-concurrency=1 \
  tests/semantic/typescript-completion-resolve-cancellation.test.mjs \
  tests/test-layer-manifest.test.mjs
# 9/9 passed; 0 failed/skipped/todo/cancelled

pnpm check
# PASS

pnpm build
# PASS; fresh bundle from acfc7fd

node --test --test-concurrency=1 \
  --test-name-pattern "resolves and applies an unopened class auto-import" \
  tests/semantic/semantic-characterization.test.mjs
# 1/1 selected passed; edit applies and diagnostics close cleanly
```

The new file first made the manifest RED as unclassified. It is now in the fast unit-contract layer;
guarded totals are 79 entries and 39 unit entries, with the manifest 2/2 GREEN.

This closes only TypeScript core collection cadence (`acfc7fd`). Remaining work is explicit:

- Registry/Legacy do not inject the checkpoint into the production TypeScript engine, and the
  production LSP still runs the synchronous Legacy engine on the main thread.
- Legacy and LSP remap additional edits after the core returns; LSP mapping currently occurs after
  the request freshness scope finishes.
- Display parts, edits, and UTF-8 bytes need an all-or-none budget; native join is not interruptible.
- Each edit range can still scan the source, so cadence is not a substitute for a line-start index.
- Worker completion/resolve messages still need method-specific bounded codecs and real stdio E2E.

Therefore T4d and production cancellation remain unchecked.
