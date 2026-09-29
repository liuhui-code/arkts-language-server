# Candidate phase attribution through public references

Parent `9f91122ac504365c57473a430094da09baac9309` plus preceding uncommitted
anchor/document-phase slices. Preserve user-owned `AGENTS.md` changes.

## RED → GREEN

Real child-process, Content-Length framed LSP command:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='cold references trace distinguishes candidate' \
  tests/semantic/references-anchor-reuse.test.mjs
```

Before implementation it exits 1 with `missing candidate phase admission`.
The exact six alias/re-export Locations already pass; the unrelated same-name
class is excluded. This RED demonstrates missing timing, not a semantic bug.

Use the existing opt-in trace ID to report admission, direct-query,
direct-sources, declaration-query, declaration-sources and final status phases.
Successful and failed asynchronous phases log complete/error respectively;
errors are rethrown to the existing conservative fallback, never swallowed.
The synchronous ProjectGraph admission responsibility is extracted without
changing root computation, package entries, sorting or incomplete-graph policy.

`query` is external index-port caller wall time, including transport, queueing
and decoding; it is **not SQLite CPU time**. A `sources` span includes SDK/
package resolution, freshness status and any repeated index request needed
to prove bindings. Do not label it pure resolver CPU time or sum nested spans.
Nothing logs source text or adds absolute paths. Trace-off characterization
proves new phase events absent with exact references preserved.

Check/build and the new phase/trace-off tests pass (2/2). All roots, freshness
checks, cancellation signals, overlays, fallback and compiler final authority
are retained. No new Program/Worker residency, index answer shortcut, truncation,
forced GC, memory limit, diagnostics or default-policy change is introduced.
The proxy shrinks 984 → 975 physical lines; it remains migration debt.
New admission/telemetry modules and the public transcript are below 500 lines.

Focused and three-process real Settings results are recorded in the
[execution report](../reports/2026-09-26-settings-candidate-phases.md).
No full-suite, release-graduation, commit or merge claim is implied.

Focused command passes **40/40**, no failures/cancellations/skips/todos
(123,336 ms):

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  tests/semantic/references-anchor-reuse.test.mjs \
  tests/semantic/references-batching.test.mjs \
  tests/semantic/references-index-resync.test.mjs \
  tests/semantic/references-index-state-race.test.mjs \
  tests/semantic/references-scheduling.test.mjs tests/lsp-diagnostics.test.mjs
```

This includes all sixteen anchor transcripts and checks that ready→warming
rejects both direct/definition candidate paths, that committed catch-up restores
index use, and that normal diagnostics/cancellation/overlay correctness remain.
