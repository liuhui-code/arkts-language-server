# References request trace correlation

Parent revision: `b16ab93` on `main`. Public boundary: real
`dist/server.cjs --stdio` and framed LSP `textDocument/references` with
`ARKTS_REFERENCES_TRACE=1`.

RED 1: the batched transcript had two queue events without a trace ID, so
they could not be joined reliably to plan/batch/merge events. The focused
test failed at the missing ID assertion. GREEN 1: each reference request has
a unique ID, shared by its queue event and all plan/batch/merge events;
existing exact Location equality remains intact.

RED 2: the indexed transcript's isolated compiler anchor lacked the ID from
candidate selection. GREEN 2: anchor and candidate selection now share that
ID with the following batched request. Both changes are observation-only;
the ID is generated only under the opt-in trace flag, carries no source text
or path, and does not appear on LSP stdout.

Focused commands:

```text
pnpm build
node --test --test-name-pattern='batched references preserve the legacy Location set' tests/semantic/references-batching.test.mjs
node --test --test-name-pattern='indexed batching narrows compiler batches but keeps the exact references result' tests/semantic/references-batching.test.mjs
pnpm check
```

Both focused real-LSP tests and `pnpm check` passed. F1 is not complete:
`workerProgramReadyMs` is still a combined Program-materialization/statistics
measurement, not isolated `createProgram` or `getTypeChecker` time.

The first sandboxed `pnpm check:fast` run passed 930/931 tests; the unrelated
declaration-façade process-tree RSS test hit `spawn EPERM`. That test passed
when rerun outside the sandbox. The complete unsandboxed `pnpm check:fast`
then passed all 931 tests with zero failures or skips.
