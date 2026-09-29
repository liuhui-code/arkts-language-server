# Reference anchor document preparation attribution

Parent `9f91122ac504365c57473a430094da09baac9309` plus preceding uncommitted
anchor/mutation/trace slices. Preserve user-owned `AGENTS.md` changes.

## RED → GREEN

Public child-process LSP test:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='cold anchor trace distinguishes' \
  tests/semantic/references-anchor-reuse.test.mjs
```

Before implementation it fails with `missing anchor document-prepare observation`.
The alias/re-export fixture already returns all six exact Locations, excluding
the unrelated same-name declaration. This RED concerns missing attribution,
not a semantic defect or successful memory optimization.

Extract the cohesive anchor prepare/resolve/public-result mapping into
`reference-anchor-preparation.ts`. It preserves `documents.prepare(position,
true)`, compiler anchor resolution and one-based → zero-based range mapping.
The existing opt-in references trace now emits two request-correlated events:

- `references.anchor.document-prepare.complete`: synchronous document preparation.
- `references.anchor.resolve.complete`: registry preparation plus isolated resolution.

Neither duration is Rust index-query time. The resolve duration includes the
previous isolated-worker/compiler event; do not sum nested measurements.
No source text or new paths are logged. Trace-off characterization asserts
both events absent while preserving exact references. No extra compiler probe,
changed root set, retained Worker or Program, forced GC or increased memory
limit is introduced. Existing cancellation/freshness behavior is preserved.

`pnpm check` and `pnpm build` pass. New helper is 39 lines; the changed
legacy engine shrinks 1,086 → 1,080 lines and remains migration debt, not an
exception permitting growth. Focused and real-project results are recorded
in the [execution report](../reports/2026-09-26-settings-anchor-document-preparation.md);
no merge or full-suite claim is implied. The five-file focused command passes
**37/37** (117,542 ms): anchor reuse, batching, result cache, scheduling and
`tests/lsp-diagnostics.test.mjs`, with `node --test --test-concurrency=1`.
After tightening the existing trace-off assertion, the trace-off and new
document-phase cases are rerun together: **2/2 PASS**. This does not count
them as two additional distinct tests or claim full `check:fast` on this build.
