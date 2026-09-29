# Settings: candidate admission, index RPC and source proof phases

Status: **three-process exactness PASS; observation, not latency graduation**.

## Fixed inputs and scope

Parent server `9f91122ac504365c57473a430094da09baac9309` plus uncommitted
slices captured by each raw report. Clean Settings
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`, 1,846 indexed files.
Node v26.3.0/x64 Mac, DevEco ETS API24 `6.1.1.125` at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
SDK digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is accepted API24 compatibility, not matched API23 or DevEco equivalence.

[Separate manifest](../../bench/references/manifests/settings-homeinitdata-api24-candidate-phases.json)
pins all artifacts and the nine-Location oracle. New entry-server SHA-256
`e71bf3b6c5e4138673cf0b8cd0e0624732c400331c42c57dbba7b0d59c8380da`;
semantic/verifier hashes retain the preceding document-phase build. No earlier
manifest is relabeled. Production defaults remain indexed-batched/closure/full
SDK, roots 64, disposal; anchor reuse is off, phase trace is opt-in/on here.

Three sequential fresh processes, each with a private index cache, wait for
catalog-ready then run ten references plus an unsaved comment/version-2 retry.
Normal diagnostics stay enabled. All **33/33** responses return the same nine
exact Locations, version-2 empty target diagnostics publish and all exits are 0.
Target is `HomeInitData` usage at zero-based UTF-16 **28:30** in
`common/src/main/ets/sendable/HomeInitData.ets`, without declaration.

## Caller wall times (ms)

| Run/state | Request | Admission | Usage index RPC | Usage source proof | Declaration index RPC | Declaration source proof | Final status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 first | 7,306 | 31.62 | 14.16 | 0.27 | 543.09 | 270.71 | 0.18 |
| 1 edit | 5,100 | 0.01 | 5.02 | 0.01 | 271.83 | 282.46 | 0.18 |
| 2 first | 6,774 | 28.53 | 13.99 | 0.26 | 467.29 | 289.90 | 0.20 |
| 2 edit | 5,413 | 0.01 | 4.97 | 0.01 | 305.86 | 310.03 | 0.17 |
| 3 first | 7,607 | 29.54 | 2.33 | 0.26 | 485.42 | 306.41 | 0.22 |
| 3 edit | 5,495 | 0.01 | 1.37 | 0.01 | 307.45 | 325.04 | 0.21 |

First declaration RPC/source medians are **485.42/289.90 ms**; edit medians
**305.86/310.03 ms**. The first query at the usage position is unsupported,
so the existing complete path still requires a compiler-derived declaration.
Source proof resolves two bindings, zero unresolved, and retries the candidate
index with those resolutions. Its interval includes that retry and a status
check: **not all of 290–310 ms is Node resolver work**. RPC wall time includes
transport, index queue, decoding and OS effects, not just SQLite execution.

First document preparation median is **935.3 ms**, isolated anchor resolution
**2,037.2 ms**. First anchor/final compiler-ready medians are
**1,737.0/2,655.2 ms**; edit medians **1,478.6/2,573.4 ms**. Separate 308/613
SourceFile Programs remain. Index costs are real, but do not account for the
whole multi-second cold/miss latency. Candidate scope/index phases plus the
two non-overlapping outer anchor phases leave about 229–255 ms first and
3–4 ms edit unassigned; do not label that remainder SDK, queue or Rust time.

Cached repeats take 2–3 ms. First/edit request medians are **7,306/5,413 ms**;
the 500 ms all-state target remains unmet. Whole-run product-tree peak RSS:
**559,636,480 / 591,872,000 / 593,985,536 bytes**. These are not paired
legacy reductions, per-phase peaks or PSS. Three trace-on samples do not
establish P95, causal performance improvement or the final memory gate.

## Replay and evidence

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-candidate-phases.json \
  --out /private/tmp/settings-candidate-phases-recheck.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Fresh output path required. External RSS sampler is configured at 50 ms;
actual samples, harness/sampler memory, target Node/sidecar roles, complete
timeline and normalized references remain in raw JSON. Workers count once
inside Node. No forced GC, heap snapshot, source edit, default-policy change,
diagnostic suppression or result truncation.

- [Run 1](../../.bench/anchor-reuse-2026-09-26/candidate-phases-C-1.json):
  SHA-256 `a6927d4a4de5bb0038593100a4c757314dcae884d61da019903de7bd79e7537b`.
- [Run 2](../../.bench/anchor-reuse-2026-09-26/candidate-phases-C-2.json):
  SHA-256 `191905dfd4bb69db4173ee1fb36e2a9185f3380b96c4a4592b0b268a8ba51ebb`.
- [Run 3](../../.bench/anchor-reuse-2026-09-26/candidate-phases-C-3.json):
  SHA-256 `f929330fdd6769e3d8e7ad5f07cccd8a9cfe575b9b8790f62dadb588fb19cefa`.

Check/build, **40 focused regressions** and default-off phase characterization
pass ([RED/GREEN](../tdd/references-candidate-phase-trace.md)). The proxy
shrinks 984 → 975 lines, remaining migration debt; new modules are below 500.
This completes attribution for the principal candidate subphases, not cold
fusion, original >3 GB reproduction, final 50% memory or all-state 500 ms.
Next reductions must preserve anchor identity and binding/freshness proof;
do not skip either candidate query merely because its time is now measurable.
No full-suite claim, commit, push or merge in this slice.
