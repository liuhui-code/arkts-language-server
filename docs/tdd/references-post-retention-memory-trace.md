# References post-retention memory trace

Parent revision: `f4547237622c5ea6be2fc8160ffb068447a13453`.
Public boundary: a framed `dist/server.cjs --stdio` LSP session. The change is
observation-only and does not alter context disposal, compiler roots or results.

## RED

After a warmed definition and a `textDocument/references` request, the
existing context-retention transcript required a `references.batch.start`
event **after** `references.context.retention` with positive Node-process
`rssBytes` and `heapUsedBytes`:

```text
node --test tests/semantic/references-context-retention.test.mjs
```

The test failed at line 79 because `batchStart.rssBytes` was absent. The
retention decision already existed; this RED identified the missing phase
measurement, not a semantic-result failure.

## GREEN

`ReferenceSearchExecutor` now samples `process.memoryUsage()` only when the
references trace is enabled and attaches process RSS and the semantic Worker
isolate's V8 heap-used bytes to the existing batch-start event. Worker-thread
RSS is the same whole Node-process RSS and must not be added to the main
thread's report. With tracing disabled, no new memory sample is taken. The
test checks that the event follows the retention decision and carries positive
measurements. `pnpm build` and the focused test passed 1/1.

The [Settings phase report](../reports/2026-09-21-settings-post-retention-memory-trace.md)
compares one references-first process, one completion/definition-warmed
trace-on process and one warmed trace-off process against the same nine-location
oracle. The observation shows high Node RSS already present before verifier
admission in the warmed case, even after logical context disposal. It does
**not** establish whether that memory is collectible or retained, nor does
one trace-on/off pair quantify trace overhead. No forced GC or heap snapshot
was taken. F4/ADR 0002 graduation remains open.
