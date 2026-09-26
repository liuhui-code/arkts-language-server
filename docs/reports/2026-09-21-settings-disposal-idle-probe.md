# Settings references: one-second idle after resident-context disposal

Status: **exploratory diagnostic, not a leak finding, retention-policy change, or release gate**. This follows the [post-retention phase trace](2026-09-21-settings-post-retention-memory-trace.md) and [ADR 0002](../adr/0002-hot-semantic-context-lifecycle.md). The question was narrow: after a warmed context is logically disposed, does a one-second *natural* idle period lower process RSS before a transient reference verifier starts?

## Isolation and fixed workload

The repository was at `ea7fc9e65fd8fcf952e6e46d148fae14dcdcfa01`; the only pre-existing worktree change before this report was user-owned `AGENTS.md`. Production source and `dist/semantic-worker.cjs` were untouched. Two copies of the built `dist` tree lived under `/private/tmp/arkts-reference-idle.HI98fp/{control,probe}`. The control semantic Worker was byte-identical to the repository build (SHA-256 `842291ecfe0a7fd7cb147af0abd6dfa16f2b0bc8e9001b0dd466ce63838a09de`); the probe Worker had SHA-256 `1cf0547189974cce619ef3496fc1fc6bbc6b6f59860a333c1242b977f08a4380`. The **only** bundle difference was a debug-only `process.memoryUsage()` trace, `await setTimeout(1000)`, and another memory trace immediately after `disposeResidentContext(rootPath)` and before batch creation. The server entry was identical in both copies (SHA-256 `ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e`); the reference-verifier Worker and Rust sidecar were also the same (`08c2bcb91537a3c0f8dfca0003a7b1cd81a7ae7ef6e6761b3b25efe1e29b6200` and `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`, respectively). The copied bundles are temporary local artifacts, not a production feature flag.

All six fresh processes used the clean real Settings checkout at `/private/tmp/arkts-settings-e2e.vrQQm9/project`, SHA `ecc550dfaed880e04e38a2477eb7235cd50475b9`; Node `v26.3.0`, Darwin `25.6.0` x64; and the same DevEco ETS API 24 SDK (`6.1.1.125`) at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`. The project declares compile API 23. **These are API-24 compatibility observations, not proof of API-23 equivalence.** Each unmanifested replay recorded SDK path/version but did not run declaration-digest preflight (`sdkDeclarationDigest: null`), so it is not a formal SDK-locked release comparison.

The target was `HomeInitData` in `common/src/main/ets/sendable/HomeInitData.ets`, zero-based UTF-16 position `16:13`, `includeDeclaration=false`, against the [nine-location oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json). The public LSP sequence was open → completion → definition → `textDocument/references` (mode B), with normal automatic diagnostics. Strategy was `indexed-batched + closure + full SDK`, 64 batch roots, default `dispose` retention. No forced GC, heap snapshot, semantic-policy change, or production code edit was made. The external sampler requested 50 ms intervals and counted the Node PID once (Worker threads included) plus the sidecar; harness RSS was recorded separately. Actual external sample spacing was slower and variable.

## Raw results

Runs were interleaved in this order: control 1, probe 1, probe 2, control 2, control 3, probe 3. Each reached `residentBefore=1`, `residentAfter=0`, `removed=true` before verifier admission. All six passed the same nine exact URI/range Locations, with byte-identical normalized result arrays and normal target diagnostics `[]`.

| Run | Node RSS during inserted idle: start → end | Semantic Worker V8 heap used: start → end | External server + sidecar peak RSS | References duration¹ | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| [Control 1](/private/tmp/settings-idle-control-1.json) | no inserted idle | — | 1,006,407,680 B | 4,777 ms | 9/9 exact |
| [Probe 1](/private/tmp/settings-idle-probe-1.json) | 735,854,592 → 735,862,784 B | 540,539,344 → 540,548,712 B | 1,138,937,856 B | 5,447 ms | 9/9 exact |
| [Probe 2](/private/tmp/settings-idle-probe-2.json) | 746,475,520 → 746,483,712 B | 541,013,000 → 541,022,368 B | 1,138,372,608 B | 5,396 ms | 9/9 exact |
| [Control 2](/private/tmp/settings-idle-control-2.json) | no inserted idle | — | 1,130,672,128 B | 4,312 ms | 9/9 exact |
| [Control 3](/private/tmp/settings-idle-control-3.json) | no inserted idle | — | 1,150,828,544 B | 4,077 ms | 9/9 exact |
| [Probe 3](/private/tmp/settings-idle-probe-3.json) | 743,133,184 → 743,145,472 B | 540,571,184 → 540,580,552 B | 1,144,967,168 B | 5,303 ms | 9/9 exact |

¹ `request.completed.durationMs`, rounded to the nearest millisecond; it includes the deliberate one-second pause in probe runs. These durations **must not** be interpreted as product latency measurements. Median external peak was 1,130,672,128 B for controls and 1,138,937,856 B for probes; three runs per group, variable sampling, and unequal run order do not establish a meaningful peak difference. During the inserted interval, the probe traces were ~1,001 ms apart. Node RSS increased by only 8,192, 8,192, and 12,288 B; the semantic Worker isolate heap increased by 9,368 B each time. External samples inside those intervals likewise showed no RSS decrease. `rssBytes` is whole-process Node RSS; `heapUsedBytes` in these debug events is **one semantic Worker isolate's** V8 heap, not total Node heap or process RSS.

## Interpretation and replay

The specific one-second natural-idle hypothesis is **not supported**: 3/3 probes showed no material pre-verifier RSS decline. This does **not** prove compiler objects remain reachable, a registry leak, or two live Programs. Natural GC is not guaranteed within one second; V8 or the allocator may also retain resident pages after reclaiming objects. The earlier observation—high RSS after logical disposal but before verifier admission—still stands. No change to the production `dispose` default follows from this experiment.

While the temporary copied bundles remain on this Mac, the following command replays the exact probe workload through the existing framed-LSP runner; replace `probe` with `control` and choose a new output filename for its pair:

```sh
node scripts/bench/replay-references.mjs \
  --server /private/tmp/arkts-reference-idle.HI98fp/probe/server.cjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 16 --character 13 \
  --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-idle-probe-recheck.json \
  --mode B --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0 --trace
```

`--idle-ms 0` avoids the runner's **post-response** pause; the probe's debug-only pause is **pre-verifier**. Verify the bundle hashes, checkout, and SDK metadata in each raw report before comparing results. The temporary bundle is not a durable reproducibility artifact; its exact one-block change is located after `this.options.disposeResidentContext(rootPath)` in the copied `semantic-worker.cjs` and consists solely of `memoryUsage` → trace start → `setTimeout(1000)` → `memoryUsage` → trace end. Further causal work would need a controlled collection/retained-object test or a longer, separately labeled idle sweep, still isolated from production. Post-eviction PSS, the original >3 GB reproducer, final 50% memory gate, and cold ≤500 ms navigation target remain open.
