# L01 automatic L3 admission experiment: RED/GREEN and real-project falsification

Date: 2026-10-07. Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
The worktree was already dirty; no reset or overwrite was used. This is a
benchmark-only experiment, **not** production admission.

## Public RED

`node --test tests/semantic/semantic-l3-reference-admission.test.mjs`
started `dist/server.cjs` through Content-Length stdio, kept normal automatic
diagnostics, and set a 1 MiB policy budget so actual process RSS deterministically
latched L3. Two distinct previously unqueried symbols avoided the exact-result
cache. Both returned their exact locations, but the resident context create count
grew from 1 after diagnostics to 3 after the references: `3 !== 1`.

This uses automatic sampling, not the benchmark `applyMemoryPressure` request;
the latter would not prove the memory policy's latch. The small budget is a
test stimulus only, not a proposed product setting.

## Minimal experimental GREEN

With both `ARKTS_BENCHMARK_CONTROL=1` and
`ARKTS_L01_PRESSURE_ADMISSION=1`, a latched-L3 request that would otherwise
take legacy semantics uses the existing transient reference verifier. It gives
the verifier no index candidates, identity proof, support set, semantic graph,
or seeded anchor. Incomplete verification still becomes an explicit LSP error,
not a partial Location array. Production defaults are unchanged.

The same LSP test then passed: two cold symbols were exact with no resident
context readmission. A v2 unsaved overlay added a real third reference; both
`includeDeclaration` policies returned exact locations without another reference-
driven resident creation. The existing scripted sidecar index-resync fixture now
also runs under automatic L3: watched source change forced the index fallback,
the plan declared `candidateMode=conservative`, and its cross-file Location set
equalled the pre-edit oracle. The original default-mode index-resync case remains
GREEN. Focused command:

```bash
pnpm build
node --test tests/semantic/semantic-l3-reference-admission.test.mjs \
  tests/semantic/references-index-resync.test.mjs \
  tests/test-layer-manifest.test.mjs
```

These small fixtures prove routing and freshness guards, **not** semantic
equivalence for every ArkTS symbol or a memory bound for the transient worker.

## Falsification on real Settings

The pinned 20-edit Settings/API24 replay is documented in
[the experiment report](../reports/2026-10-07-resident-l01-pressure-admission.md).
It failed: 2 of 22 requests timed out after 180 seconds while exhaustive
batching was still in progress. This branch is therefore **NO-GO** for L01
resource/latency admission. Keep the experimental flag off by default; do not
advance L02 or treat the 20 exact responses as 22/22 success.
