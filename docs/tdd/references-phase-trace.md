# References phase trace, first vertical slice

Parent revision: `349b3abe2e4ff35e00d3cead7f7c766fd981b49f`.
Public boundary: `dist/server.cjs --stdio`, Content-Length LSP
`textDocument/references`, with `ARKTS_REFERENCES_TRACE=1`.

RED command:

```text
pnpm build
node --test --test-name-pattern='batched references preserve the legacy Location set' tests/semantic/references-batching.test.mjs
```

The existing exact-location test failed because its first session event was
`references.batch.complete`, not the required planning event. The next RED
required nonnegative Worker host-prepare, Program-ready and query durations.

GREEN: the same public test passes. Each successful session now emits a
monotonic elapsed timeline for plan, batch start/completion and merge. The
existing batch event carries three Worker timings. `workerProgramReadyMs`
measures the call that materializes and counts Program SourceFiles; it is
**not** a pure `createProgram` or `getTypeChecker` measurement. The existing
`ARKTS_REFERENCES_TRACE` gate still controls all new log events; no path or
source text was added to them, and LSP stdout remains protocol-only.

`pnpm check` and the indexed-batching exactness test also passed. A local
`pnpm check:fast` attempt was interrupted after unrelated 5-second LSP
semantic/call-hierarchy timeouts on a high-load Mac; it is **not** recorded as
a passing full gate. PR CI must run the complete gate before merge.

Remaining F1 work: queue/anchor/index phase correlation and a separately
verified compiler-internal breakdown. Do not label the three Worker fields as
`createProgramMs`/`getTypeCheckerMs` in a benchmark until measured directly.
