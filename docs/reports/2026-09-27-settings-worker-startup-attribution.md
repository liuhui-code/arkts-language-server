# Settings transient Worker startup attribution

Status: **constructor probe FAIL on diagnostics; three independent short
queries exact/diagnostic PASS; attribution complete, no reuse/default promotion**.

Follow-up to the [local-package closure comparison](2026-09-27-settings-local-package-closure.md).
R-01/R-11: determine whether the planned Worker-shell reuse experiment can
meaningfully address the observed repeated preparation cost. See [TDD](../tdd/references-worker-startup-trace.md).
The current constructor anchor is unsupported by index. The pinned compiler
FindAllReferences implementation recursively follows inherited constructors,
so class candidates cannot be substituted by matching names/nearby spans.
No index eligibility or compiler identity proof is weakened.

## Frozen environment and method

- Server parent `9f91122ac504365c57473a430094da09baac9309`, dirty build; no commit/push/merge.
- Unchanged clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`,
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`.
- Node v26.3.0, Darwin 25.6 x64. Selected SDK ETS API24 6.1.1.125,
  declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  Original compile/target/compatible 23/20/20 retained; API24 compatibility
  investigation, not SDK/DevEco parity.
- Constructor query MenuController.ets UTF-16 90:17, declaration excluded;
  separate verified 267-location oracle. [Manifest](../../bench/references/manifests/settings-menucontroller-worker-startup-api24.json)
  pins all runtime assets. Prior manifests/results are not overwritten.
- Existing trace on, conservative semantic-unit experiment on, full SDK,
  closure and 64-root packing retained; seed and anchor memo off. Sequential
  per-batch transient Workers; normal automatic diagnostics on. No GC/snapshot,
  project mutation, file-copy scale, budget or concurrency change.
- One constructor probe followed by three independent short-query processes,
  using the same Settings HomeInitData usage-site oracle (UTF-16 28:30,
  declaration excluded, nine exact Locations). Its
  [manifest](../../bench/references/manifests/settings-homeinitdata-api24-worker-startup.json)
  retains the same build/SDK; conservative-unit flag is off for this indexed
  one-batch query. This is not three repetitions of the constructor case.
  Existing replay tool, external 50 ms
  target RSS sampler. Node PID and product tree counted separately, not Worker
  RSS summed twice. No focused tests run concurrently with real replays.

`workerStartupMs` is parent-observed spawn-to-runtime-ready message receipt,
including compiler module loading and scheduling/transport. It is not pure
Worker creation CPU time; scheduling can overlap the child's subsequent
preparation. Program readiness contains getProgram/createProgram work; their
nested fields must not be summed again. Trace-on data is attribution, not a
trace-off release distribution or proof of Worker-reuse savings.

The authorized pre-run `pmset -g therm` snapshot at 2026-09-27 00:38:33 +0800
reports CPU_Scheduler_Limit=100, CPU_Available_CPUs=12 and
**CPU_Speed_Limit=35**; physical RAM is 17,179,869,184 bytes. This establishes
observed CPU limiting, not its cause or a constant frequency throughout every
sample. Do not compare new latency to the preceding day as a code regression
or improvement. No power/thermal settings are changed.
The post-run snapshot at 00:50:07 reports the same scheduler/CPU availability
but **CPU_Speed_Limit=28**. This is a CPU-limited investigation, not a controlled
release performance machine; neither snapshot proves a constant run frequency.

## Constructor negative probe

`menu-worker-startup-A-1.json` is **FAIL**, not a successful product gate.
The request completes in **176,223 ms**, 14 transient batches, all 267 tuples
exact; automatic diagnostics exceed the unchanged 180,000 ms deadline.
Normal server shutdown/exit code 0, no OOM/partial reference response.
External observed tree/Node peaks are **817,602,560 / 771,350,528 bytes**,
661 samples. Raw SHA256
`59723049dc0b7612b4a82806d84290e9ae05d185dad721fa2dc2a5e6f9942949`.

Summed batch startup is **10,979.23 ms**, anchor startup **667.65 ms**;
batch Program readiness **145,082.40 ms**, anchor readiness **5,303.04 ms**;
batch queries **5,992.03 ms**, anchor definition **44.15 ms**. Startup receipt
totals are about 6.6% of request wall time versus 85.3% readiness, under the
overlap/measurement caveats above. Startup-only savings cannot account for the
observed tens/hundreds of seconds or establish a route to 500 ms. Shell reuse
may also affect JIT/GC; this observation does not predict its actual speedup
or authorize persistent compiler state. Maximum project SourceFiles remains
1,348; all 1,496 legal candidates are preserved.

The three short-query runs are a separate attribution control, not a repair
of the diagnostic failure and not pooled with this constructor result.

## Three independent HomeInitData controls

All three replay statuses are **PASS**: nine exact Locations, one final batch
plus an isolated compiler anchor, normal version-1 diagnostics (zero target
diagnostics), and normal exit 0. Both anchor and batch report startup.

| Run | Request ms | Startup sum ms | Program readiness sum ms | Semantic query sum ms | Tree peak RSS bytes | Node peak RSS bytes |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 23,639 | 1,776.82 | 16,153.76 | 213.44 | 528,064,512 | 482,926,592 |
| 2 | 21,901 | 1,672.82 | 14,767.78 | 204.90 | 545,767,424 | 499,843,072 |
| 3 | 19,523 | 1,629.21 | 13,163.38 | 183.69 | 556,306,432 | 513,433,600 |

Startup receipt sums are 7.52%/7.64%/8.35% of request wall time; Program
readiness 68.34%/67.43%/67.42%. These are observed wall-time ratios with the
overlap caveat, **not an additive exact CPU breakdown**. The remaining time
includes document preparation, candidate/source proof, serialization and
other orchestration. Three samples cannot establish release P95 or a retention
plateau; RSS peaks are observed external samples, not guaranteed true maxima.
The sampler collected 176/176/170 samples; 50 ms is the sampling target, not
a guaranteed interval under expensive process enumeration/CPU limiting.

Raw files under `.bench/anchor-reuse-2026-09-27/`, SHA256:

- `home-worker-startup-A-1.json`:
  `81301b2f51f4d6dae5cf2928d69213d233050f1f2e33fb51b3c52a6fde22e0e4`
- `home-worker-startup-A-2.json`:
  `a200be8666eb6b4da0591c6c35ba51b851d623e20519481f0299d85bfcb9fd87`
- `home-worker-startup-A-3.json`:
  `4a933a66df1bc7d2cc9b712337e87f3bee2bf841500b55772ba6d05590ea2afb`

## Decision / next gate

This does not support Worker startup as the dominant explanation, nor a claim
that shell reuse alone can meet 500 ms. R-11 remains secondary/experimental:
no shell reuse or Language Service retention is implemented or graduated.
Prioritize R-10/compiler-backed constructor identity and candidate completeness
to avoid repeated large Programs. The multi-level inherited-constructor alias
characterization below is now GREEN; index completeness itself remains open.
Do not reuse the class
oracle, text-match away files or weaken fallback. The broader repeated-state
and SDK preparation problem is not solved by this trace slice.

## Verification

The public LSP observation requirement fails first, then passes after the
minimal default-off marker. Final focused anchor/constructor/alias/overlay/
cancellation/index/fallback/scheduler/coalescing/transport/inventory command
passes **41/41**, zero skips, 211,112 ms. `pnpm check`, `pnpm build`, frozen asset
preflight and diff whitespace checks pass. No new full check:fast/release claim.
Changed handwritten files remain ≤500 lines. Existing unrelated/user edits
and prior frozen reports are preserved; no commit, push or merge.

After the full focused command, the existing constructor characterization is
extended with `Thing → Implicit → Inherited` (neither derived class declares a
constructor), then `Inherited as Leaf` and `new Leaf()` in a file with no
base-class lexeme. Its real child-process transcript passes **1/1**, 79,278 ms:
legacy/indexed-batched/conservative grouping agree for separate class and
constructor queries, both declaration policies, explicit `super`, transitive
alias construction and same-name exclusion. This is an expanded rerun of one
of the 41 cases, **not 42 distinct tests**. No new production narrowing is
implemented; the handwritten test is now 423 lines.

## Replay

```sh
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=0 ARKTS_REFERENCES_ANCHOR_REUSE=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-worker-startup-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-worker-startup-A-replay.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

For the three short controls, use the same command with conservative-units=0,
file `common/src/main/ets/sendable/HomeInitData.ets`, symbol HomeInitData,
line/character 28/30, its no-declaration oracle and the HomeInitData manifest
linked above. Choose distinct fresh output names; do not overwrite evidence.
All 500 ms, original >3 GB, final 50%/DevEco PSS and native Windows gates remain
independent/open. The constructor diagnostic FAIL is not relabelled PASS.
