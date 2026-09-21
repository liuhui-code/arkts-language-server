# First references during initial catalog: bounded wait experiment

Parent revision: `caafd2aa56c4f7faab49dc216a490c4449a87afc`. The user-owned
`AGENTS.md` modification was not touched. This slice is **opt-in** via
`ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS`; the production default remains
zero. No compiler scope, worker count, result completeness, or diagnostic
provider was changed.

## Public LSP RED

All behavior tests launch `dist/server.cjs` as a child and exchange real
Content-Length-framed LSP messages.

- `node --test tests/semantic/references-initial-catalog.test.mjs` failed
  before the implementation: the first request returned exact Locations but
  never observed initial generation-zero warming or fetched candidates after
  the catalog committed.
- `node --test --test-name-pattern='has not opened yet' tests/semantic/references-initial-catalog.test.mjs`
  failed after the first implementation: the sidecar had not completed `open`
  when the request arrived; the same request never fetched the subsequently
  committed candidates.
- `node --test --test-name-pattern='budget bounds a held status request' tests/semantic/references-initial-catalog.test.mjs`
  failed with a 250 ms configured budget and a deliberately held `status`
  reply: the complete response took 6,937.6 ms. An AbortSignal now reaches
  the sidecar status request and bounds the wait.

## GREEN and invariant

The opted-in path waits only around the first catalog/opening window, with a
five-second opening grace and an overall configurable maximum of 60 seconds.
It re-queries the ready index and still requires the existing complete,
same-generation eligibility proof plus compiler verification. On timeout,
degradation or unavailable status it retains complete-scope fallback, never
returns index occurrences as final references. Workspace mutation bypasses
this initial-only wait. The request's existing freshness signal cancels it.

The focused build and protocol run passed 12/12, including exact Locations,
ordinary diagnostics after completion, cancellation without partial results,
held-status budget, initial pre-open, timeout fallback and the existing
ready-to-warming rejection tests:

```sh
pnpm build
node --test tests/semantic/references-initial-catalog.test.mjs \
  tests/semantic/references-index-state-race.test.mjs \
  tests/test-layer-manifest.test.mjs
```

`pnpm check:fast` passed 954/957 in the restricted macOS shell. Its three
failures were fixture Git/process-RSS permissions (`spawn EPERM`, `not a git
repository`, and no first external RSS sample), not assertion differences in
this slice. Re-running only those three test files with macOS process sampling
and fixture Git operations permitted passed **38/38**. The new initial-catalog
tests passed within the full 957-test run. The aggregate command is therefore
not recorded as GREEN in this sandbox; a clean CI run remains required.

The [real Settings replay](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md)
completed 9/9 exact references in three independent index-cold processes,
but its 39.8–50.5 second request range and postponed diagnostics **do not**
meet the interaction gate. Keep the flag default-off. The original >3 GB
reproducer and completed same-build legacy comparison remain open.
