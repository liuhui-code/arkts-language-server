# Settings rejected-verifier preparation attribution

Status: **exactness and normal diagnostics PASS; cold 500 ms FAIL**.
Default-off observability only. Constructor candidate completeness and final
memory/latency graduation remain open; no claim that the original 5 GB issue
or the full plan is solved.

## Change and verification

The [public RED/GREEN transcript](../tdd/references-rejected-batch-trace.md)
requires rejected discovery-anchor attempts to retain the verifier's already
captured phase/memory fields. Rejected attempts remain separate from successful
`references.batch.complete` events. A shared projection reads existing fields:
no extra Program/Checker query, memory sample or behavior change. Tracing off
emits no rejected event/compiler timing fields. Both default-off behavior and
exact same-name parameter references are tested through real framed stdio.

Check/build PASS. Focused constructor, multi-batch, shadowing, trace-off and
post-rejection cancellation/edit: 6/6 PASS, 106,145.668 ms. Executor/test
352/483 physical lines, below 500. The preceding 995-test full fast gate belongs
to the previous build, not this observation build. No commit, push or merge;
existing dirty tree/user AGENTS.md edits preserved.

Additional public completeness/conservative semantic-unit suites: 7/7 PASS,
37,873.045 ms, zero failures/skips. Unopened files, partial membership,
module/target and local package boundaries remain protected.

Subsequent [constructor-boundary characterization](../tdd/references-constructor-search-boundaries.md)
adds static `new this()` and an explicit-derived-constructor barrier without
changing production code. Final authorized `pnpm check:fast`: **996/996 PASS**,
exit 0, zero failures/cancellations/skips/todos, 908,988.667 ms. The final
Settings manifest preflight matches all pinned artifacts. This is fresh whole-
suite verification of the observation build, not a new Settings replay or a
performance graduation. Constructor test now has 489 physical lines.

## Fixed real environment

- Parent HEAD `9f91122ac504365c57473a430094da09baac9309`, dirty
  `codex/references-f2-fixed-benchmark`.
- Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`,
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`; boundaries unchanged.
- Node v26.3.0, ohos-typescript 4.9.5-r10, Darwin 25.6 x64, Intel Mac/16 GiB.
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  API24/6.1.1.125; declaration digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  Project declarations 23/20/20 unchanged. Explicit compatibility probe, not
  exact DevEco/API23 diagnostic parity.
- Query `common/src/main/ets/core/controller/MenuController.ets`,
  MenuController, zero-based UTF-16 **90:17**, declaration excluded.
  Separate known 267-location constructor oracle, not 247-location class oracle.
- [Manifest](../../bench/references/manifests/settings-menucontroller-rejected-batch-trace-api24.json)
  pins project, SDK, oracle, server, both Workers, stdlib and sidecar hashes.
- Indexed-batched/closure/full SDK/64 roots. Existing local-export discovery
  and conservative semantic-unit experiments explicitly on, anchor memo off.
  Automatic diagnostics on, no forced GC/snapshot, truncation or SDK changes.

No test suite runs during performance replay. Read-only `pmset -g therm`
before/after (02:58:15/02:59:48 +0800) reports scheduler/speed limit 100,
12 available CPUs. Snapshots do not prove constant clock during the request.

## Result

One fresh-process `textDocument/references` replay: **PASS**, 267 exact/legal
UTF-16 Locations, no missing/extra results, normal version-1 diagnostics (one
unresolved `@ohos.systemparameter` diagnostic), exit 0. No timeout/OOM or partial
response. Diagnostics arrive 1,975 ms after references response.

| Observation | Value |
| --- | ---: |
| End-to-end references | 52,584 ms |
| Node PID peak RSS | 849,014,784 bytes |
| Product process-tree peak RSS | 900,104,192 bytes |
| Harness RSS maximum at timeline observations (not externally sampled peak) | 76,943,360 bytes |
| External samples / actual spacing | 457 / 124–233 ms |
| Rejected attempts / successful batches | 1 / 14 |
| Full retry candidates / membership | 1,496 / 1,496 |
| Rejected attempt Program readiness | 3,817.77 ms |
| Rejected attempt query | 17.21 ms |
| Rejected attempt startup | 288.57 ms |
| Rejected attempt project/SDK/total SourceFiles | 322 / 427 / 801 |
| Rejected attempt prepared RSS | 506,380,288 bytes |
| Successful-batch Program readiness sum | 40,116.47 ms |
| All 15 attempts Program readiness sum | 43,934.24 ms |
| All attempts query sum | 1,804.00 ms |
| All attempts startup sum | 3,799.10 ms |
| Maximum successful project SourceFiles | 1,348 |
| Standalone definition anchor completions | 0 |

Readiness wall time accounts for approximately **83.6%** of this request.
`createProgram`/`getProgram` timings are nested in readiness: never sum them
again. The near-zero measured `getTypeChecker` getter does not mean checker
construction is free; this fork can do it during Program synchronization.
Startup is parent-observed spawn-to-ready, distinct from compiler readiness;
do not present phase sums as a perfect additive CPU accounting model.

The rejected class discovery attempt costs 4,180.57 ms at the parent batch
boundary and is discarded. The complete retry keeps every legal region and
returns the constructor oracle. This closes the missing rejected-attempt
observation, **not** constructor narrowing. Successful-only profiling would
omit 3.818 s of compiler readiness in this run.

Sampling targets 50 ms but macOS `ps` plus overhead produces the observed
124–233 ms spacing; raw curve is not a guaranteed maximum. Workers share Node
PID RSS and are not added twice. Harness is separate. One run is not a P95,
three-run reproduction, retention/no-regression proof, or a >3 GB reproduction.

## Replay and raw evidence

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-rejected-batch-trace-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-rejected-batch-trace-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Use the pinned Node/build; manifest validation rejects changed artifacts.
Never overwrite previous output. Raw curve, timeline, exact normalized results
and structured events:
`.bench/anchor-reuse-2026-09-27/menu-rejected-batch-trace-A-1.json`.
SHA256 `3d47ad39689b9139c97f301d724bf6dea00333fc1f841fae3c0821bff3a0bb8e`.
Keep original memory gates and experimental defaults unchanged. Next: establish
compiler-backed constructor search completeness (including inherited/aliased
calls) before narrowing; do not reinstate class proof to chase latency.
