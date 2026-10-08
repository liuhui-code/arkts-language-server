# L01 experimental transient diagnosis at L3

Date: 2026-10-07. Parent revision:
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
The existing dirty worktree was preserved. This experiment is gated by both
`ARKTS_BENCHMARK_CONTROL=1` and `ARKTS_L01_TRANSIENT_DIAGNOSTICS=1`; it is not
the production diagnostic route.

## Public RED

Added a real child-process Content-Length LSP transcript to
`tests/semantic/semantic-l3-reference-admission.test.mjs`. With a 1 MiB
experimental budget, it opens a document, waits for automatic diagnostics and
an L3 eviction, applies an unsaved version-2 edit containing an undefined
identifier, and requires the version-2 compiler diagnostic without admitting
another resident context.

```bash
node --test tests/semantic/semantic-l3-reference-admission.test.mjs
```

Before implementation: **RED**, 2 pass / 1 fail. The version-2 diagnostic
was correct, but `active L3 must not readmit a resident diagnostic context`
failed (`actual=2`, `expected=1`). This distinguishes the admission defect
from diagnostic correctness.

## Minimal GREEN

At active L3 only, the experimental route executes full diagnosis through an
operation-scoped `OhosTypeScriptSemanticEngine`, including open overlays and
the existing ArkUI/resource and project-diagnostic merge, then terminates the
worker. It does not suppress diagnostics or return a partial result. The
runner checks document version and cancellation; the LSP publication fence
still verifies current version.

After `pnpm build`, the same public test was **GREEN**, 3/3. `pnpm check` and
`git diff --check` passed. The changed semantic worker runtime is 491 physical
lines, below the 500-line limit. No production default was changed.

This tiny transcript does not graduate the route. Compare the same pinned real
Settings workload with the experiment off/on, including normalized references,
versioned diagnostics, external RSS, and context events. The L01 resource gate
remains blocked until the real-project evidence passes.
