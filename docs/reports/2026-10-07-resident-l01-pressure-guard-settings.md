# L01 Settings experimental L3 pressure guard: explicit failure, no admission

Date: 2026-10-07. Status: **FAIL overall**. This was one real
`applications_settings` process with two explicit L3 recovery cycles. The
guard is available only under both `ARKTS_BENCHMARK_CONTROL=1` and
`ARKTS_L01_PRESSURE_ADMISSION=1`; it does not change the production default.
The public RED→GREEN fixture and the precise guard boundary are recorded in
[the TDD note](../tdd/l01-pressure-multibatch-rejection.md).

## Frozen run and replay

The ignored local [manifest](../../.bench/l01-soak/pressure-guard-2-manifest.json)
pins a clean `applications_settings` checkout at
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, the API24 compatibility SDK
declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`,
Node v26.3.0, `ohos-typescript@4.9.5-r10`, and server HEAD
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`. This run's server input
digest is `c3642b5da9b564d4c740b98d54f6fb4e7013193296033cd7e766cec7e334acef`
and built server SHA-256 is
`26fa509aabf9265aa9e2c376ef5c3672d58b57e2b82307a05d350a96f1eb7520`.
The raw [report](../../.bench/l01-soak/pressure-guard-2-report.json) records
`inputUnchanged=true` throughout the historical run.

Historical replay command, valid only while every manifest pin still matches:

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/pressure-guard-2-manifest.json \
  --out .bench/l01-soak/pressure-guard-2-rerun-report.json
```

Subsequent source edits invalidate the pinned server-input identity even if
`dist/server.cjs` still has the recorded artifact SHA. Rebuild and re-pin the
manifest before a new measurement; do not relabel a different build as this
run. The external macOS sampler requires permission to inspect the process
tree via `ps`.

## Six-request outcome

Both targets use zero-based UTF-16 positions and
`includeDeclaration=false`: `MenuController` constructor usage at
`common/src/main/ets/core/controller/MenuController.ets:90:17`, and
`HomeInitData` at `common/src/main/ets/sendable/HomeInitData.ets:16:13`.

| Scenario | Public result | Time |
| --- | --- | ---: |
| First `MenuController` references | Complete, 267/267 exact | 32.081 s |
| `HomeInitData` baseline | Complete, 9/9 exact | 454.9 ms |
| Unsaved edit 1, version 2 | Complete, 10/10 exact | 2.171 s |
| Explicit L3 recovery 1 | `RequestFailed` `-32803`, resource budget; no Location array | 84.5 ms |
| Unsaved edit 2, version 3 | Complete, 9/9 exact | 24.030 s |
| Explicit L3 recovery 2 | `RequestFailed` `-32803`, resource budget; no Location array | 96.9 ms |

The four complete responses had zero missing, extra, duplicate or invalid
locations against their normalized oracles. The two resource errors are
deliberate refusals, **not** complete references or correctness passes: the
report marks 4/6 complete and `correctness.status=FAIL`. In both L3 cycles,
the trace logged `references.plan.complete` with 1,496 membership files and
24 conservative batches, then `references.pressure.rejected` with
`resource-budget-exceeded`, `maxBatches=1`. No `references.batch.start` was
logged for either rejected request. Normal automatic diagnostics passed.
Candidate indexing was ready (1,846/1,846 files), while semantic readiness
remained `READINESS_UNSUPPORTED` / `NO_GENERATION_BOUND_PUBLIC_CONTRACT`.

## Memory scope and decision

External sampling observed a **lower bound** of 1,226,039,296 B peak Node PID
RSS and 1,280,901,120 B peak server-plus-sidecar RSS over 315 samples. The
sampler's own peak was 124,104,704 B and is separate; worker threads are
already inside Node PID RSS and are not added again. Although the requested
interval was 50 ms, actual P50/P95 intervals were 291/329 ms, so this is not
an exact instantaneous peak or a hard memory bound. One admitted batch can
still exceed the 1024 MiB soft budget.

The guard replaced the observed long multi-batch L3 timeout with a prompt,
explicit error in this experiment. It did not fulfill two reference requests,
did not establish stable sub-500 ms responses, and did not demonstrate bounded
RSS or semantic readiness. L01 resource admission remains **BLOCKED**; L02 is
not admitted.
