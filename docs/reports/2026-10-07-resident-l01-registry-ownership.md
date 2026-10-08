# L01 Settings/API24 registry ownership after L2 trim and L3 disposal

Date: 2026-10-07. Status: **reproduced in two fresh real-project LSP
processes; L01 resource admission remains BLOCKED**. This is an ownership
diagnosis, not a production lifecycle change or a byte-accurate heap census.

## Fixed workload and replay

Both runs used clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`,
the API24 compatibility-track SDK at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony` (declaration
digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`),
server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`, Node `v26.3.0`,
and `ohos-typescript@4.9.5-r10`. The server worktree was dirty and preserved;
the prepared manifest pins its input digest and built artifacts. The actual
LSP sequence and oracle are the [20-edit Settings soak](2026-10-07-resident-l01-pressure-attribution.md):
`MenuController` preparation, `HomeInitData` baseline, then 20 alternating
unsaved 9↔10-reference edits at zero-based UTF-16 `16:13` in
`common/src/main/ets/sendable/HomeInitData.ets`, with normal diagnostics.
The pre-fix server-input digest was
`988e00903a8a560b592e27f40c0ab1d1ee23e33d0f8eefa45fc8037b0e167c2f`;
the built server digest was
`d03fb34c69c70c4a1c26350acd9e752683ced9cdff145beec8f8434952abd54e`.

Historical pre-fix command (it requires the pre-fix server-input/build pins
in the saved manifests; the later fix intentionally changes those pins):

```bash
node scripts/bench/generate-l01-soak-suite.mjs \
  --base .bench/l01-soak/registry-probe-base-20261007.json \
  --out .bench/l01-soak/registry-probe-new-manifest.json \
  --cycles 20 --mode diagnostic --trace 1 --pressure-every 0 --idle-ms 5000 \
  --registry-probe-out .bench/l01-soak/registry-probe-new.jsonl
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/registry-probe-new-manifest.json \
  --out .bench/l01-soak/registry-probe-new-report.json
```

`--registry-probe-out` is diagnostic-only and requires the benchmark-control
guard. No explicit pressure request, GC, heap snapshot, source/SDK boundary
change, budget increase, worker change or diagnostics suppression was used.
The default-off wrapper records aggregate `DocumentRegistry` refcounts for
the current Program's `resolvedPath`/`scriptKind` cohort around the existing
compiler `cleanupSemanticCache()` and `dispose()` calls. It does not modify
their results. The raw [run A transcript/RSS/normalized locations](../../.bench/l01-soak/registry-probe-20-report.json),
[run A refcounts](../../.bench/l01-soak/registry-probe-20.jsonl),
[run B transcript/RSS/normalized locations](../../.bench/l01-soak/registry-probe-20b-report.json),
and [run B refcounts](../../.bench/l01-soak/registry-probe-20b.jsonl) remain
ignored local evidence; they have not been committed or published.

## Independent observations

| Fresh process | Exact complete references | Diagnostics | Natural L2 trim / L3 evictions | First service, same 2,261-path cohort | Later direct dispose | External Node RSS peak lower bound |
| --- | --- | --- | ---: | --- | --- | ---: |
| A | 22/22 | PASS | 1 / 14 | trim `2261→2261`; after rebuild, dispose `4522→2261` | each full-cohort dispose `4522→2261` | 1,277,616,128 B |
| B | 22/22 | PASS | 1 / 13 | trim `2261→2261`; after rebuild, dispose `4522→2261` | each full-cohort dispose `4522→2261` | 1,262,280,704 B |

The first service was the sole resident semantic context in this legacy
single-root worker; automatic diagnostics leased that context. The first
trim occurred at natural L2. Before its later natural L3 eviction, queries
rebuilt the Program. The refcount for the *same sampled paths* rose from one
to two per path; disposal removed the new Program's count but left one.
Subsequent fresh contexts temporarily raised the count and returned to the
same residual baseline. The final eviction in each run sampled only 423
SourceFiles, so its `846→423` pair is a different cohort, not evidence that
the earlier 2,261-path cohort disappeared.

The fork's implementation explains this exact sequence:
`cleanupSemanticCache()` sets its `program` to `undefined` without releasing
registry references; `dispose()` releases SourceFiles only when `program`
exists. A post-trim rebuild acquires again, so `dispose()` can release the new
Program but not the acquisition whose Program pointer was discarded. The
observed residual is therefore **consistent with an orphaned registry
acquisition**. It is stronger evidence than immediate RSS after disposal, but
the registry API reports aggregate references, not per-LanguageService owners
or retained bytes; it cannot establish a 2,261-object heap size or assign the
whole process RSS to this mechanism.

Both runs also had 22 `semantic.references.complete` events, all LSP request
statuses `COMPLETE`, and 9/10 alternating HomeInitData positions matching the
fixed oracle; neither had an empty/partial success, timeout or OOM. The
top-level replay still exits `PREPARED_SUITE=FAIL` because the separate
generation-bound semantic-ready gate is `READINESS_UNSUPPORTED`; correctness
and diagnostics are independently PASS. External `ps` sampled the Node PID
once (worker threads are not added again): actual median sample interval was
about 122 ms in A. Mac RSS is not Linux PSS or DevEco product PSS. The probe
calls `getProgram()` to capture keys (0.77/0.78 ms in the first trim), so
probe-on timing and RSS must not be used as an undisturbed performance A/B.

## Decision and remaining gate

This identifies a concrete backend lifecycle defect candidate, not proof
that fixing it alone will meet 500 ms, the 50% reference-memory gate or the
original >3 GB case. Do not raise the budget, disable diagnostics, change the
production `indexed-batched` route, or call L01 resource-safe on this basis.
Next slice: add a real child-process trim→rebuild→dispose regression that
requires the residual refcount to reach zero, then make the smallest
backend-owned release change and repeat the exact Settings oracle, RSS and
normal-diagnostics replays. A post-GC live-heap ownership check and supported
process-tree PSS comparison remain separate release evidence.

The subsequent [backend recycle regression and two Settings replays](2026-10-07-resident-l01-registry-recycle.md)
do bring the sampled L2/L3 refcounts to zero, but expose severe cold-Program
tail latency. The resource/latency admission remains blocked.
