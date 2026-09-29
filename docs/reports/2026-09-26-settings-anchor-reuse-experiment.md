# Settings: experimental definition-to-anchor reuse

Status: **opt-in implementation; not graduated**. This is R-10 warm definition
reuse, not cold anchor/first-batch fusion, a resident full-scope reference
fast-path, or a solution to the original 5 GB report.

## Fixed environment and workload

- Parent/server source baseline: `9f91122ac504365c57473a430094da09baac9309`
  plus this uncommitted slice; dirty state is retained in every raw replay.
- Real Settings checkout: `ecc550dfaed880e04e38a2477eb7235cd50475b9`, clean,
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`; 1,846 cataloged files.
- Node: `/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node`, `v26.3.0`.
- Backend: repository-locked `ohos-typescript@4.9.5-r10`.
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  API 24 / `6.1.1.125`, declaration digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  This is the user-approved API-24 compatibility configuration, not a matched
  API-23 or DevEco diagnostic-equivalence claim.
- Query: `common/src/main/ets/sendable/HomeInitData.ets`, **usage** of
  `HomeInitData` at zero-based UTF-16 **28:30**, `includeDeclaration=false`.
- [Manifest](../../bench/references/manifests/settings-homeinitdata-api24-anchor-reuse.json)
  pins the same server, semantic Worker, verifier Worker, standard library,
  default schema-9 sidecar and verified nine-location oracle for both arms.
- `indexed-batched + closure + full SDK`, batch roots 64, default `dispose`
  retention, no forced GC. Only `ARKTS_REFERENCES_ANCHOR_REUSE=0/1` differs.

Each replay creates a fresh Node process and private index cache, waits for
catalog readiness, leaves normal automatic diagnostics enabled, then runs
completion → definition → references (mode B). The global verifier remains
one sequential transient batch. This is not a repeated exact-result-cache hit.
The measured warmup definition/completion contents are not independently
golden-checked by this runner; final reference URI/ranges are checked exactly.

## Initial-build smoke observations

Execution order is control-1, reuse-1, control-2, reuse-2, control-3, reuse-3.
Do not treat this fixed order as a randomized release experiment or infer P95.

| Arm | Run | References ms | Sampled product peak RSS bytes | Anchor |
|---|---:|---:|---:|---|
| control | 1 | 43,286 | 755,748,864 | transient Worker / 308 SourceFiles |
| reuse | 1 | 26,819 | 954,839,040 | validated definition / no anchor Program |
| control | 2 | 35,863 | 749,522,944 | transient Worker |
| reuse | 2 | 21,907 | 869,167,104 | validated definition |
| control | 3 | 34,328 | 959,123,456 | transient Worker |
| reuse | 3 | 27,151 | 893,747,200 | validated definition |

All six completed runs return all **9/9 exact Locations**, no missing
or extra references, normal version-1 empty target diagnostics and clean
shutdown. Every reuse hit emits `anchorWorkerStarts=0` and
`anchorProgramBuilds=0`. Final compiler verification still runs in a transient
Worker and constructs the same 613-SourceFile batch (151 project, 410 SDK,
52 other standard-library files). The preceding completion constructs 2,200
SourceFiles (1,496 project, 652 SDK, 52 other files).

In the first pair the standalone control anchor alone takes 14,417.19 ms.
Removing it shortens the request, but sampled peak RSS **increases** from
755,748,864 to 954,839,040 bytes. The second pair also observes higher product
RSS in the reuse arm. This does not establish a retained-object leak or its
cause. Both arms still logically dispose the one resident context before the
final verifier. No GC or allocation policy was changed to force an RSS drop.

Control/reuse request medians are **35,863 / 26,819 ms** (ratio 0.7478,
observed 25.2% lower). Product peak RSS medians are
**755,748,864 / 893,747,200 bytes** (ratio 1.1826, observed **18.3% higher**).
The default-off flag is not graduated: eliminating one preparation does not
establish a passing memory/no-regression gate. The control anchor median is
11,101.41 ms. Removing this particular anchor does not remove the batch's
Program/Checker preparation or the large completion warmup.

Absolute timings are much slower than the earlier Settings report. Machine
load, allocator/collection timing, memory compression, OS cache and fixed
execution order remain uncontrolled. Do not attribute all timing/RSS movement
to the tiny memo, and do not promote the flag from these samples.

After this matrix, broader public-LSP testing exposed a missing overlay-set
component in the initial memo key: opening another edited dependency could
still reuse the old definition. That transcript was RED (13/14 focused cases
passed); the comment-only edit did not change its Location set, but the
snapshot policy was still incorrect. The implementation now keys all active
open-overlay paths/versions and rejects unknown versions. These six timings
belong to the **initial build**, pinned by the original manifest and retained
under `.bench/anchor-reuse-2026-09-26/pre-overlay-guard-runtime`. They are not
substituted for post-hardening performance or correctness evidence.

One additional independent **mode-A cold fallback** replay with the flag set
to `1` also passes 9/9 exact Locations, normal empty version-1 target
diagnostics and clean shutdown. With no explicit definition to reuse, its
trace remains `transient-worker` (anchor 10,150.23 ms); references take
38,931 ms and sampled product peak is 475,914,240 bytes. This is a
correctness/route smoke, not a paired cold performance comparison. It is kept
separate from the six warmed runs and their medians.

## Post-hardening build

The [separate overlay-snapshot manifest](../../bench/references/manifests/settings-homeinitdata-api24-anchor-reuse-overlay-snapshot.json)
pins semantic Worker SHA-256
`4dd1ebad73c5e6aa6184f510509f04b4f64ae0787c41859f408265ebe79c2bb3`.
Server, verifier, standard-library and sidecar pins are unchanged. One new
independent control/reuse pair uses this later build; it is **not pooled** with
the initial matrix:

| Arm | References ms | Sampled product peak RSS bytes | Exact Locations | Anchor |
|---|---:|---:|---:|---|
| control | 35,081 | 848,748,544 | 9/9 | transient Worker |
| reuse | 22,268 | 959,668,224 | 9/9 | validated definition, zero anchor Workers/Programs |

Both retain normal empty version-1 target diagnostics, one transient final
batch and clean shutdown. Observed peak RSS is again higher in the reuse arm
(about 13.1% in this single pair). This confirms the corrected route works in
the real project, but does **not** pass a memory/no-regression or 500 ms gate.
The flag remains default-off. Raw files are
`overlay-guard-control-B-1.json` and `overlay-guard-reuse-B-1.json` in the local
evidence directory. Do not infer a stable median/P95 from one pair.

## Prepared-source freshness build

The [source-snapshot manifest](../../bench/references/manifests/settings-homeinitdata-api24-anchor-reuse-source-snapshot.json)
pins the close/reopen repair and prepared-source hash guards. Its semantic
Worker SHA-256 is
`1855b57f71b334600e789d10ede35a82ef32a9f22f1edd28c8a6e03ff0601fe8`;
server SHA-256 is
`93e3c903f71f8c1eb2dad96f982a52297ee2d99b8eae8fe13dbbaeebcd5b7759`.
This separate fresh-process pair runs **reuse first, then control**. It is not
pooled with either older build and is not a randomized release sample.

| Arm | References ms | Sampled product peak RSS bytes | Exact Locations | Anchor |
|---|---:|---:|---:|---|
| control | 6,292 | 894,902,272 | 9/9 | transient Worker, 2,051.07 ms |
| reuse | 4,423 | 1,007,587,328 | 9/9 | validated definition, zero anchor Workers/Programs |

Both return the same normalized oracle, retain normal empty version-1 target
diagnostics and exit cleanly. Both final batches contain the same 613
SourceFiles. In this pair request latency is 29.7% lower, but sampled product
peak RSS is **12.6% higher**. No memory/no-regression or 500 ms gate passes.
Absolute times are much shorter than the older pairs; machine/OS/allocator
variation and build changes prevent attributing that cross-build difference to
the source hash guard. Only the within-pair observations above are reported.
Raw reports are `source-guard-control-B-1.json` and
`source-guard-reuse-B-1.json` in the local evidence directory.

## Raw evidence and reproducible command

Local raw reports are under
[`.bench/anchor-reuse-2026-09-26`](../../.bench/anchor-reuse-2026-09-26).
The [machine-readable initial-build summary](../../.bench/anchor-reuse-2026-09-26/summary.json)
includes all six warmed raw-report SHA-256 digests and refuses graduation.
Each JSON preserves the pinned environment, actual LSP transcript, request
timeline, exact normalized results, structured server phases and the original
external 50 ms target-process-tree RSS samples. Node worker threads are counted
once in the server PID; Rust is separate; sampler/harness memory is not added
to product RSS. Completion-time log RSS is not substituted for sampled peak.

Run from the repository root, with a fresh `--out` path:

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-anchor-reuse-source-snapshot.json \
  --out /private/tmp/settings-anchor-reuse-recheck.json \
  --mode B --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0 --trace
```

Set the flag to `0` for the same-build control. Replace `--mode B` with
`--mode A` to reproduce the isolated-anchor cold fallback. The
runner requires external process sampling permission on this Mac.

## Verification and disposition

[Public RED/GREEN](../tdd/references-anchor-reuse.md) covers default isolation,
same-snapshot reuse and conservative fallback. After the overlay-key repair,
`pnpm check`, `pnpm build` and **14/14 focused tests** pass: seven new public
anchor cases plus retention, pressure, result-cache and inventory coverage.
After switching the transcript oracle to explicit URI/range tuples, the seven
public anchor tests were rerun and passed **7/7** (no skips or cancellations).
The initial full `check:fast` cancellation/recovery timeout was subsequently
closed by the lifecycle-build run described below; focused successes are not
substituted for a passing full suite on a later changed build.
The existing draft PR #91 head `9f91122` independently passed `validate` and
`windows-install` in run `36238351976`; those checks cover the parent, not this
uncommitted implementation or Windows semantic performance.

R-10 remains experimental and default-off. Cold fusion, broader
configuration/mutation/cancellation sampling, randomized memory/PSS evidence,
native Windows and all existing release gates remain open. References and
completion are still far above the user's **500 ms** requirement. Original
>3 GB reproduction and final 50% memory/DevEco gates are not satisfied.

A later [close/reopen correctness slice](../tdd/references-reopen-mutations.md)
adds an eighth public transcript and preserves close as a mutation barrier.
Its 54 focused tests pass, but it produces another runtime build: the Settings
measurements above remain evidence only for their explicitly pinned builds,
not a performance claim for the later lifecycle repair.
The subsequent fixed-build full `check:fast` passes **966/966**; that closes
the earlier local verification gap for this later build, not any performance
or release graduation gate.

The prepared-source fingerprint build subsequently passes **63/63 focused
tests**, including ten public anchor transcripts, lifecycle/supervisor/lanes,
diagnostics, context pressure/retention, exact cache and test-layer inventory.
`pnpm check` and `pnpm build` pass. This was initially focused-only evidence;
the 966-test result above remains scoped to its earlier build.

After adding cancellation and in-flight edit characterization, the current
worktree's full `check:fast` passes **970/970**, with zero failures,
cancellations, skips or todos (913,596.8 ms). All twelve public anchor cases
pass. The rebuilt server/semantic/verifier SHA-256 values still match the
source-snapshot manifest, so the performance pair above retains its build
identity. [The TDD record](../tdd/references-anchor-reuse.md) records the full
command and raw-log digest. This does not turn the single pair into a release
sample or graduate any latency/memory gate; no commit/push/merge occurred.
