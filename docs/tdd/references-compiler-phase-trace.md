# References compiler phase trace

Parent revision: `30d41a3aa8deb229fa12eac83d94ec7c7972d52d` on `main`.
Public boundary: real `dist/server.cjs --stdio` and framed
`textDocument/references` with `ARKTS_REFERENCES_TRACE=1`.

RED 1: the batched transcript lacked separate nonnegative
`workerGetProgramMs` and `workerGetTypeCheckerMs` fields. GREEN 1: the
transient verifier times the first Language Service `getProgram()` call and
the following `Program.getTypeChecker()` call before collecting SourceFile
statistics. Their sum stays within `workerProgramReadyMs`.

RED 2: the transcript lacked a positive `workerCreateProgramMs`. GREEN 2:
the pinned `ohos-typescript@4.9.5-r10` fork's public `PerformanceDotting`
TRACE event named `createProgram` is collected around that first
`getProgram()` call, converted from nanoseconds to milliseconds, and only
the aggregate duration is logged. No event record, source text, or file path
is logged. The trace state is cleared inside the transient verifier Worker.

`workerGetProgramMs` is a wider boundary than `workerCreateProgramMs`: it
also includes Language Service synchronization and any other work performed
by `getProgram()`. `workerGetTypeCheckerMs` measures the explicit first call
to `Program.getTypeChecker()`; it is not a measure of all subsequent type
checking during `findReferences`. Upstream TRACE adds overhead, so use these
fields for phase attribution, not trace-off product latency or memory gates.
Trace-off requests do not invoke this extra compiler-readiness probe.

Commands:

```text
pnpm build
node --test --test-name-pattern='batched references preserve the legacy Location set' tests/semantic/references-batching.test.mjs
node --test --test-name-pattern='indexed batching narrows compiler batches but keeps the exact references result' tests/semantic/references-batching.test.mjs
pnpm check
```

Both focused real-LSP tests and `pnpm check` passed. The normal Location
sets still match the legacy oracle in these transcripts. The original >3 GB
reproducer and final 50% memory gate remain open.

The complete unsandboxed `pnpm check:fast` passed: 931 tests, zero failures
or skips. It ran outside the sandbox because this repository's unrelated
process-tree RSS test requires macOS process inspection permissions.
