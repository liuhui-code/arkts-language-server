# Settings: local-export seed with final compiler proof

Status: **default-off prototype; six-process exactness PASS, not graduation**.

## Fixed environment and experiment

Server parent `9f91122ac504365c57473a430094da09baac9309` plus dirty slices;
the [new manifest](../../bench/references/manifests/settings-homeinitdata-api24-local-export-seed.json)
pins entry server, semantic/verifier Workers, standard library and sidecar.
Do not relabel earlier manifests or pool their samples with this build.
Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`, 1,846 cataloged files.
Node v26.3.0/x64 Intel macOS, 16 GiB. DevEco ETS API24 `6.1.1.125`, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`,
at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
This is the accepted API24 compatibility run, not matched API23/DevEco parity.

Query `HomeInitData` at zero-based UTF-16 **28:30**, usage in
`common/src/main/ets/sendable/HomeInitData.ets`, without declaration. Oracle
is the fixed nine exact Locations, SHA-256
`58908aa4ee2554864cd4467ccf7a51b3aa8e6dd570fc0f66decc6500bf7f937b`.

One build; execution order off-1/on-1/on-2/off-2/off-3/on-3, sequential fresh
processes and private caches. Mode C waits for catalog ready, requests ten
times, then retries after an unsaved comment/version-2 edit. No files copied,
project boundary changed, SDK replaced, diagnostics disabled or forced GC.
Both arms indexed-batched/closure/full SDK, roots 64, trace on, warm anchor
memo off. Only `ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=0|1` differs.

## Results

| Arm/run | First ms | Post-edit ms | Product-tree peak RSS bytes |
| --- | ---: | ---: | ---: |
| off 1 | 7,137 | 5,215 | 563,302,400 |
| off 2 | 7,655 | 5,188 | 597,508,096 |
| off 3 | 6,532 | 5,787 | 593,031,168 |
| on 1 | 4,820 | 3,806 | 560,037,888 |
| on 2 | 4,446 | 3,660 | 565,084,160 |
| on 3 | 4,070 | 3,655 | 584,654,848 |

All **66/66** responses match all nine exact Locations. Normal version-2 empty
target diagnostics publish; six server exits are 0, no timeout/OOM/partial
success. Cached repeats take 1–4 ms in both arms.

Observed first median **7,137 → 4,446 ms (-37.7%)**; post-edit median
**5,215 → 3,660 ms (-29.8%)**. Peak median **593,031,168 → 565,084,160
bytes (-4.7%)**; each corresponding run's peak is lower. Three samples per
arm, trace on and a single symbol do not establish P95, statistical confidence,
retention stability or a release memory gate. These are whole-run external
product-tree RSS peaks, not PSS or request-phase-only peaks; Worker RSS is not
added again to Node. Harness/sampler memory is separate in raw evidence.

Controls construct the separate 308-SourceFile anchor Program and the final
613-SourceFile Program on both misses. Enabled runs construct **no standalone
anchor Program**; all six final batches record `anchorVerified=true` in their
own compiler context. Final Program size remains **613**. Its first ready
median is 2,655 ms off / 2,462 ms on; edit 2,495 / 2,609 ms. Final queries
(definition guard plus references when enabled) remain ~43–56 ms. Avoided
anchor preparation is 1,561/1,458 ms control first/edit median, plus its outer
document/isolation overhead. This supports redundant preparation as a cause,
not the assertion that index-only references are correct or SDK is cheap.

Cold/edit latency remains far above **500 ms**. No default promotion: final
compiler preparation, wider symbol/SDK coverage, original >3 GB reproducer,
50% memory, DevEco/PSS and native Windows gates remain open.

## Safety and replay

Export/name lookup only seeds a candidate. Ready, unique same-file class,
nontruncated export search, complete reference identity/support proof and
matching generations are required. Every final batch uses compiler definition
resolution at the original cursor and checks exact declaration file/start;
failure discards results and retries the existing compiler-anchor path.
No `ts.Symbol`, AST or Program crosses a Worker boundary. The existing
transient per-batch lifecycle and full closure remain unchanged.

Public LSP tests cover default off, aliases/re-exports, same-name parameter
rejection/fallback, cancellation, edit-during-verification and comment-overlay
freshness. Strict immutable transport tests preserve admitted-anchor checks;
[TDD record](../tdd/references-local-export-anchor-seed.md).

```sh
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 ARKTS_REFERENCES_ANCHOR_REUSE=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-local-export-seed.json \
  --out /private/tmp/settings-local-export-seed-recheck.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Fresh output required. Set seed flag to 0 for same-build control. The external
sampler targets actual Node and sidecar PIDs at configured 50 ms intervals;
raw JSON includes effective environment, timestamps, diagnostics, normalized
Locations, all samples and phase traces. Accepted seed events explicitly say
`validation=pending-final-compiler-batches`, not verified final semantics.

Raw files under `.bench/anchor-reuse-2026-09-26/`, SHA-256:

- `local-export-seed-C-off-1.json`: `0ce74241ab2948e001b6f5ea2aa35a7281af404e5b411964044854814b624da3`
- `local-export-seed-C-off-2.json`: `4e6219c0fc540a655821d0d5838e5d2afbaa5436278f296eb64207c21fbe8144`
- `local-export-seed-C-off-3.json`: `1296eb35f1684059e85ff8d80b2b35a973cbfe9fc4c02cc8c2e6093a89a076e1`
- `local-export-seed-C-on-1.json`: `2c25ce174764fc98d70f562abb3a2f0417c119d4251a52c1c97b659d5dcbf6b6`
- `local-export-seed-C-on-2.json`: `86e9f18b846f7c316a388e4899be6c83defc42b02ac887ec0d95b61c6b608dc3`
- `local-export-seed-C-on-3.json`: `a019c990d88a5ab9f0d8a0d6f3f9218510f4f15f4b3638015fc9ecf96455737c`

No commit, push or merge in this slice. Current-build full fast verification:
**981 tests, 978 pass, 3 fail, zero cancelled/skipped/todo**, 955,287 ms.
All 22 anchor transcripts and batch/snapshot/freshness regressions pass. Only
the three existing external-sampler cases fail in the sandbox; same-code
authorized rerun passes 3/3. Full command exit remains 1, not blanket GREEN.
Log: `/private/tmp/arkts-local-export-seed-check-fast-20260926.log`.

Check/build, 43 initial anchor/protocol tests, two further seeded-edit
transcripts and five transport/inventory tests pass. Three existing external
RSS tests encounter sandbox process-sampling failure; same-code authorized
replay passes 3/3 (see TDD). No sampling assertion, diagnostic requirement or
timeout is loosened. The original full command remains recorded as failed,
not silently relabeled GREEN based on a subset rerun.
