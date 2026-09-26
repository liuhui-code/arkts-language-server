# References in-flight coalescing

Parent revision: `f4ddfe4`. This slice implements R-05 after references gained
independent interactive/global scheduling in R-06.

## RED

A real Content-Length framed LSP transcript started references, waited until
its delayed verifier batch was active, then sent the identical request. The
newer request superseded the first in the LSP freshness lane:

```text
pnpm build && node --test tests/semantic/references-coalescing.test.mjs
AssertionError: {"code":-32801,"message":"References request is stale"}
```

This demonstrated that a semantic-proxy Promise map alone could not satisfy
the requirement: the first request was cancelled before both clients could
share semantic work.

## GREEN

`SemanticRequestRunner` now owns a bounded-lifetime shared operation for an
exact references key. `RequestFreshness` can attach concurrent waiters to the
same lane without changing the existing supersede behavior for a different
request. The shared operation uses its own abort controller; each waiter races
that operation against its own LSP cancellation signal.

The public transcript proves all four outcomes:

```text
two identical requests → one verifier → two exact results
cancel first waiter    → RequestCancelled for first, complete second result
didChange              → ContentModified for both old-snapshot waiters
new document version   → fresh verification, never joins the aborted operation
```

Focused verification:

```text
pnpm check
pnpm build
node --test tests/semantic/references-coalescing.test.mjs \
  tests/semantic/references-result-cache.test.mjs \
  tests/semantic/references-scheduling.test.mjs \
  tests/lsp-semantic-request-reliability.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs \
  tests/lsp-reliability.test.mjs \
  tests/test-layer-manifest.test.mjs
```

All 45 focused tests passed. The new LSP coalescer is 77 lines and the public
test is 126 lines. Existing over-limit
`register-semantic-capabilities.ts` remains 766 lines, exactly its parent size;
the change extracted shared-operation ownership instead of growing that debt.
