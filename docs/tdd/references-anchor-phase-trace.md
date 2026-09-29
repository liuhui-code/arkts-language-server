# Independent reference-anchor compiler phase trace

Parent: `9f91122ac504365c57473a430094da09baac9309` plus the preceding
uncommitted source-fingerprint/lifecycle slices. The user-owned `AGENTS.md`
changes are preserved. This slice adds observation, not anchor fusion or a
change to semantic loading, result completeness or Worker lifecycle.

## RED

The real child-process LSP test requests cold references through an import
alias/re-export and checks the exact six Locations, excluding an unrelated
same-name class. It then requires the isolated anchor's compiler preparation
and definition-query phases:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='cold usage-site anchor trace separates' \
  tests/semantic/references-anchor-reuse.test.mjs
```

Before implementation this exits 1: `missing anchor phase workerPrepareHostMs`.
Locations already match; this is a missing-observation RED, not a reproduced
semantic defect or an assertion of a 5 GB fixture.

## GREEN

Forward the existing default-off `ARKTS_REFERENCES_TRACE` option into the
isolated definition Worker. Its private reply now carries the same timings
shape as final batch verification; `references.anchor.complete` logs:

```text
workerPrepareHostMs
workerProgramReadyMs
workerGetProgramMs
workerCreateProgramMs
workerGetTypeCheckerMs
workerQueryMs
```

Compiler readiness is measured only with the existing trace flag. The new
definition query timer does not change what is queried. No source contents,
AST/Symbol objects or new absolute paths are logged. The Worker still disposes
the engine and terminates exactly as before; stdout remains protocol-only.
The RED command passes. A second public characterization test with the trace
flag absent passes the same exact Locations and proves the three compiler
probe fields remain absent. Existing alias, SDK-profile, disk/overlay
invalidation, cancellation and recovery tests are retained.

`workerGetProgramMs` contains the narrower compiler `createProgram` span; do
not add them together. The explicit `getTypeChecker()` call follows
`getProgram()` and may retrieve an already-created checker; a near-zero value
does not prove initial checker construction or all type work was free.
`workerQueryMs` is **definition** for the anchor, not `findReferences`.
Readiness also includes SourceFile statistics. Trace-on numbers are attribution
data, not trace-off product latency or a memory release gate.

`pnpm check` and `pnpm build` pass. The registry is 500 physical lines; the
anchor/Worker modules and transcript remain below 500. The previously changed
925-line supervisor remains migration debt and is not touched by this slice.
The preceding 970-test full run belongs to the source-snapshot build, not this
changed trace build. No merge is requested or performed.

Focused cross-regression is **43/43 PASS**, with no failures, cancellations,
skips or todos (129,340 ms):

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  tests/semantic/references-anchor-reuse.test.mjs \
  tests/semantic/references-batching.test.mjs \
  tests/semantic/references-context-retention.test.mjs \
  tests/semantic/type-engine-context-runtime.test.mjs \
  tests/semantic/references-result-cache.test.mjs \
  tests/semantic/references-coalescing.test.mjs \
  tests/semantic/references-scheduling.test.mjs \
  tests/lsp-diagnostics.test.mjs tests/test-layer-manifest.test.mjs
```

This includes all fourteen anchor transcripts plus batch exactness,
cancellation/freshness, context pressure, cache/coalescing, queue isolation,
normal diagnostics and test inventory. It is not full `check:fast` for this
changed build, nor real-project interruption/performance graduation.

See the [three-process real Settings profile](../reports/2026-09-26-settings-anchor-compiler-phases.md)
for fixed runtime pins, raw memory curves and first/edit query measurements.
