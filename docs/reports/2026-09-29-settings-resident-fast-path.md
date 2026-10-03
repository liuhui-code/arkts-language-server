# Settings / API24: resident full-scope references experiment

Status: **implementation and fresh regression GREEN; six real replays exact;
resident admission not qualified on Settings**. This is R-09 from [ADR 0002](../adr/0002-hot-semantic-context-lifecycle.md)
and the [Feature Ledger](../plans/references-feature-ledger.md), not a change to
the production defaults or completion of the whole latency plan.

## Fixed workload and ownership

- Parent server revision `911ae43c274175614559b63f0311504747d8393d`, branch
  `codex/references-resident-fast-path`, dirty implementation intentionally
  uncommitted. Preserve the user's AGENTS.md modifications.
- Real Settings checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`, clean,
  at `.bench/real-projects/settings-ecc550`; no copied scale files or source
  boundary changes. Original membership is 1496 project files.
- Selected SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  API24 / ETS `6.1.1.125`, declaration digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  This is the explicitly authorized compatibility track for the checkout's
  compile23/target20/compatible20, not a claim of matched-SDK equivalence.
- Target `common/src/main/ets/core/controller/MenuController.ets`, constructor
  cursor `MenuController`, zero-based UTF-16 `(90, 17)`,
  `includeDeclaration=false`. The frozen **267-tuple** oracle is
  `bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json`,
  SHA256 `72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
  The 247-location class oracle is not interchangeable.
- [Pinned manifest](../../bench/references/manifests/settings-menucontroller-resident-fast-path-api24.json)
  freezes server, semantic/verifier Workers, standard library, native sidecar,
  Node, SDK and oracle bytes. Same-build control/probe differ only in effective
  R-09 admission enablement.
- macOS `26.6.2` / build `25G83`, `MacBookPro16,1`, Intel i7-9750H @2.60GHz,
  12 logical CPUs, 16 GiB physical memory; AC attached. Node `v26.3.0`, local
  pnpm `8.3.1` (manifest requests `8.15.9`), pinned compiler
  `ohos-typescript@4.9.5-r10`. Command-scoped `caffeinate -i` prevents idle sleep;
  pre-existing user sleep-prevention assertions are not modified.

Each fresh process/index waits for catalog readiness, opens the original file,
then performs `textDocument/implementation` warmup and the first actual
`textDocument/references` query. This deliberately tests reuse of a fully
prepared Program, not cheap local completion warmup or an exact-result cache
hit. Warmup cost is charged and reported separately. It does **not** demonstrate
cheap first-click initialization. No `workspace/symbol` or document-symbol
request is substituted for references.

`indexed-batched + closure + full SDK`, 64 roots/batch, `dispose` retention,
1024 MiB budget, per-batch transient Workers and normal automatic diagnostics
remain unchanged. Anchor/local-export/conservative-unit experiments are off.
No forced GC, heap snapshot, larger timeout than the established 180 s real
replay deadline, source modification or synthetic benchmark scale is used.

## Evidence and interpretation

Three independent fresh processes per arm all return **267 exact, valid
Locations**, normal version-1 diagnostics and exit 0, with no timeout/OOM,
sampler error or substituted symbol request. Execution order was
`control1, probe1, probe2, control2, control3, probe3`, a small smoke comparison,
not randomized release/P95 evidence.

| Run | Full implementation warmup ms | References ms | Node peak RSS bytes | Product peak RSS bytes | Resident admission |
| --- | ---: | ---: | ---: | ---: | --- |
| control1 | 29,484 | 101,957 | 1,754,763,264 | 1,799,086,080 | Disabled |
| probe1 | 32,865 | 97,675 | 1,450,491,904 | 1,492,209,664 | L3 miss |
| probe2 | 33,996 | 97,490 | 1,450,147,840 | 1,494,859,776 | L3 miss |
| control2 | 28,696 | 101,011 | 1,782,947,840 | 1,824,403,456 | Disabled |
| control3 | 27,843 | 98,761 | 1,752,952,832 | 1,795,837,952 | Disabled |
| probe3 | 33,257 | 96,543 | 1,442,246,656 | 1,485,770,752 | L3 miss |

Reference medians are **101,011 ms control / 97,490 ms probe**; warmup medians
are **28,696 / 33,257 ms** and must not be hidden. Product peak medians are
**1,799,086,080 / 1,492,209,664 bytes**. These observations do not demonstrate
resident-reuse acceleration: **all six queries start an isolated anchor plus
24 transient batches**, with **0 exact-result cache hits**; every enabled query
has **0 resident hits**, L3 admission, and logical resident count already zero.
The probe's memory at rejection is 1,421,103,104 / 1,418,346,496 /
1,415,307,264 bytes. No Program/Worker build is avoided on this real workload.

The public small-fixture hit proves the implemented path, not its applicability
to this large Program under the production budget. The lower sampled probe RSS
does not establish a reuse saving or its cause, and the slower warmup includes
opt-in witness work. Retain the experiment **off by default**; do not raise the
budget, relax the coverage/freshness check or suppress diagnostics to manufacture
a hit. Cold/edit 500 ms and R-03/R-09 graduation remain unproven. R-07's actual
constructor-caller exclusion responsibility remains the next substantive scope
reduction task, rather than more warmup at an expanded budget.

The existing API24-track diagnostic remains visible: TS2307 for
`@ohos.systemparameter`, at zero-based `(19,28)–(19,51)`. A replay PASS denotes
exact references plus observed normal versioned diagnostics, **not** a clean
SDK/compiler diagnostic gate. Do not suppress it or call this SDK equivalence.

Memory is sampled by an independent process outside the blocked server event
loop: whole Node PID once (Worker threads are not summed) plus Rust sidecar.
Harness and sampler RSS are separate. Requested interval is 50 ms, but actual
sample gaps are **125–127 ms median / 234–287 ms maximum** across the six runs.
Peaks are observed RSS, not PSS or a hard upper bound. Harness event-sampled
peak is 76,337,152–78,446,592 bytes; independently sampled sampler peak is
128,749,568–130,854,912 bytes. Neither is added to product RSS. The 1024 MiB
policy is not an OS process-memory ceiling. The 10 s post-idle product RSS
varies across runs and is retained in raw timelines; it is not an eviction/PSS
graduation measurement.

Raw reports in `.bench/references-resident-fast-path-api24/{control,probe}-N.json`
retain the full request transcript, normalized results, external memory curve,
phase events, diagnostics, artifact/environment pins and close result. Do not
deduce a causal speedup from unqualified runs or three small-sample tails.

## Reproduction

Run from the repository root against the manifest-pinned local build. The
output must not already exist. For a fresh control, use
`ARKTS_REFERENCES_RESIDENT_FAST_PATH=0` and a different output filename;
neither arm changes the memory budget.

```sh
ARKTS_REFERENCES_RESIDENT_FAST_PATH=1 \
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=0 \
ARKTS_REFERENCES_CONTEXT_RETENTION=dispose \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=0 \
ARKTS_MEMORY_BUDGET_MB=1024 \
/usr/bin/caffeinate -i node scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-resident-fast-path-api24.json \
  --strategy indexed-batched --dependency-profile closure --sdk-profile full \
  --batch-roots 64 --mode B --warmup implementation --trace \
  --timeout-ms 180000 --diagnostic-timeout-ms 180000 --sample-interval-ms 50 \
  --out .bench/references-resident-fast-path-api24/probe-replay.json
```

Production promotion, cold/edit 500 ms, original >3 GB reproducer, final 50%
memory, post-eviction PSS/DevEco and native Windows remain independent gates.
The implementation [TDD record](../tdd/references-resident-fast-path.md) contains
the public REDs, configuration-freshness repair and 17-case GREEN evidence.
Fresh whole `pnpm check:fast` passes **1116/1116, exit 0**, zero failures,
cancellations/skips/todos, duration **1,016,832.04149 ms**, with original
deadlines, no failed-case rerun and command-scoped idle-sleep prevention.
Raw log `.bench/references-resident-fast-path-api24/check-fast.log` SHA256:
`7b1379f812619d9f488a91b8c6bce74342cf0a79c5e8a5a436aa24601045d4c7`.
The runtime/native artifact hashes still match the manifest after the complete
gate. `git diff --check` and the incremental physical-line check pass:
package resolver 559→495, registry500→486, public coverage439; language service
3712→3629 (still migration debt). No commit, push, PR, merge or default change
was performed; user AGENTS.md changes are preserved.
