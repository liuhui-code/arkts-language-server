# Settings references: controlled GC after resident-context disposal

Status: **isolated causal diagnostic, not a production GC proposal or release-gate result**. The preceding [natural-idle probe](2026-09-21-settings-disposal-idle-probe.md) found no Node RSS decline over one second after a warmed context was logically disposed. This follow-up asks whether its large semantic Worker heap is *collectible* when collection is deliberately requested, and whether that collection immediately returns resident pages to the OS.

## Method and fixed inputs

The repository was at `3198daecafe5a7298cb22973d8c0f8c08ad7d740`; only the user-owned `AGENTS.md` was dirty during the replay. Production source and built `dist` were unchanged. The no-GC arm used the previously copied debug `probe` bundle (`semantic-worker.cjs` SHA-256 `1cf0547189974cce619ef3496fc1fc6bbc6b6f59860a333c1242b977f08a4380`), which pauses one second after `disposeResidentContext(rootPath)` and traces memory. The GC arm used a third copied bundle at `/private/tmp/arkts-reference-idle.HI98fp/gcprobe` (semantic Worker SHA-256 `17dc17daed51f530cc2f82fc41414662688075e197560d825defe84c02d61064`). Its **only additional change** was 15 debug lines immediately after the same pause: require `global.gc`, capture `process.memoryUsage()`, call `global.gc()` in the *semantic Worker isolate*, and trace before/after memory and elapsed time. It did not collect all Node isolates or the Rust sidecar. Both arms launched with `NODE_OPTIONS=--expose-gc`, so exposure of the function was controlled; only the GC arm invoked it. The replay JSON does not persist `NODE_OPTIONS`, which is a reproducibility limitation.

Both copied trees used the same server entry (SHA-256 `ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e`), standard-library asset digest (`ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d`), reference-verifier Worker (`08c2bcb91537a3c0f8dfca0003a7b1cd81a7ae7ef6e6761b3b25efe1e29b6200`) and Rust sidecar (`8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`). These are temporary local diagnostic artifacts, not a feature flag or proposed shipping binaries.

All six completed replays were separate fresh processes using the clean real Settings checkout `/private/tmp/arkts-settings-e2e.vrQQm9/project`, SHA `ecc550dfaed880e04e38a2477eb7235cd50475b9`; Node `v26.3.0`, Darwin `25.6.0` x64; and DevEco ETS API 24 SDK `6.1.1.125` at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`. The project declares compile API 23. These are API-24 compatibility measurements, not API-23 equivalence proof. Runs used `indexed-batched + closure + full SDK`, 64 batch roots, `dispose` retention, normal automatic diagnostics, and the [nine-location oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json) for `HomeInitData` at `common/src/main/ets/sendable/HomeInitData.ets` zero-based UTF-16 `16:13`, `includeDeclaration=false`. The LSP sequence was open → completion → definition → `textDocument/references`. The unmanifested replays recorded the same SDK path/version but did not run SDK declaration-digest preflight (`sdkDeclarationDigest: null`).

One preceding attempt, [no-GC attempt 1](/private/tmp/settings-gc-nogc1.json), **failed before any LSP request**: the external RSS sampler emitted `spawn EPERM` under the sandbox and supplied no first sample. It has no references result and is excluded from the six-run comparison, not counted as a pass or an OOM. After sampler execution was available, the matched arms were run in interleaved no-GC/GC order. The independent external sampler requested 50 ms intervals, counted the Node PID once including its Worker threads, added the sidecar only for product RSS, and recorded harness RSS separately; actual sample spacing varied.

## Raw observations

All six completed runs had `residentBefore=1`, `residentAfter=0`, `removed=true` before the pause; all returned the same **9/9 exact normalized URI/range Locations** and empty target diagnostics. The normalized result arrays had the same SHA-256 (`af899f9d66934ede16f63e436c1c0eb367961b20335b9c598299189dec8b7010`, over `jq -S -c '.normalizedReferences'` output including its trailing newline). In the no-GC arm, semantic Worker heap and Node RSS were approximately flat through the one-second pause.

| Run | Forced-GC Worker heap used, before → after | Whole Node RSS, before → after GC | External server + sidecar peak RSS | Result |
| --- | ---: | ---: | ---: | --- |
| [No GC 1](/private/tmp/settings-gc-nogc1b.json) | not invoked | no-GC pause: 747,253,760 → 747,253,760 B | 917,159,936 B | 9/9 exact |
| [GC 1](/private/tmp/settings-gc-gc1b.json) | 542,849,992 → 29,582,008 B | 745,881,600 → 724,779,008 B | 830,443,520 B | 9/9 exact |
| [No GC 2](/private/tmp/settings-gc-nogc2b.json) | not invoked | no-GC pause: 751,063,040 → 751,079,424 B | 1,100,734,464 B | 9/9 exact |
| [GC 2](/private/tmp/settings-gc-gc2b.json) | 542,511,608 → 29,583,192 B | 741,498,880 → 720,445,440 B | 832,151,552 B | 9/9 exact |
| [No GC 3](/private/tmp/settings-gc-nogc3b.json) | not invoked | no-GC pause: 748,576,768 → 748,584,960 B | 1,134,288,896 B | 9/9 exact |
| [GC 3](/private/tmp/settings-gc-gc3b.json) | 538,006,680 → 29,552,392 B | 747,347,968 → 726,278,144 B | 835,059,712 B | 9/9 exact |

The GC call itself took 20.4, 21.2, and 18.8 ms in the debug Worker. It reclaimed 513,267,984, 512,928,416, and 508,454,288 B from that isolate's reported `heapUsed`; whole-process RSS dropped only 21,102,592, 21,053,440, and 21,069,824 B immediately. Thus `heapUsed` and RSS **must not be conflated**. One GC run's one-second *pre-GC* Worker heap trace fell from 565,828,984 B to 538,006,680 B, while RSS did not fall; the table deliberately uses the immediate GC before/after readings rather than hiding that natural pre-GC change.

The three no-GC Worker heap traces across the same one-second pause were
541,921,800 → 541,930,760 B, 543,205,488 → 543,215,240 B, and
543,761,584 → 543,771,336 B, respectively. They do not show a comparable
heap decline without the explicit collection intervention.

Median externally sampled product peak was 1,100,734,464 B for no-GC versus 832,151,552 B for GC, a descriptive difference of 268,582,912 B. Only three fresh processes per arm, variable external sampling, separate compiler/sidecar activity, and the debug-only intervention make this **exploratory**, not a proven production memory improvement. The peak comparison is distinct from the much smaller immediate Node RSS reduction. The `NODE_OPTIONS` value was controlled in the launch command but not serialized by the harness; the copied debug bundle and `/private/tmp` reports may expire.

## Interpretation and replay

The intervention supports a bounded conclusion: **a large part of the semantic Worker heap remaining after logical context disposal was collectible when that isolate was explicitly collected**. It does not demonstrate a retained-object leak. Conversely, collecting roughly 0.5 GB of V8 heap did not immediately return a comparable amount of physical RSS, so merely forcing GC is not an evidenced shipping solution. No production semantic loading, worker lifecycle, memory budget, default retention profile, or diagnostics changed.

While the temporary bundle exists, this command repeats the GC arm from the repository root; replace `gcprobe` with `probe` and choose a fresh output path to rerun the no-GC arm. Preserve `NODE_OPTIONS=--expose-gc` for both arms:

```sh
NODE_OPTIONS=--expose-gc node scripts/bench/replay-references.mjs \
  --server /private/tmp/arkts-reference-idle.HI98fp/gcprobe/server.cjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 16 --character 13 \
  --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-gc-recheck.json \
  --mode B --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0 --trace
```

`--idle-ms 0` disables only the harness's post-response wait; each copied Worker still contains the one-second *pre-verifier* pause. No heap snapshot was taken. Post-eviction PSS, the original >3 GB reproducer, the final 50% memory gate, and the cold ≤500 ms navigation target remain open.
