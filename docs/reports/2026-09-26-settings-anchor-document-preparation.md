# Settings: document preparation versus isolated anchor resolution

Status: **three-process exactness PASS; observation only, 500 ms still FAIL**.

## Fixed environment and change

Parent server source `9f91122ac504365c57473a430094da09baac9309` plus the
uncommitted slices recorded in each raw report. Clean real Settings
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`, 1,846 indexed files.
Node v26.3.0 on this x64 Mac; DevEco ETS API24 `6.1.1.125` at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
SDK digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is accepted API24 compatibility, not matched API23/DevEco equivalence.

[New manifest](../../bench/references/manifests/settings-homeinitdata-api24-anchor-document-phase.json)
pins every runtime/oracle artifact. Semantic Worker SHA-256 is
`be297693deacb021f5eacf676e79f98d12b66216a6c64b21d6fc1393b473ad66`;
other artifact hashes match the preceding anchor-phase manifest. Earlier
manifests and reports are not rewritten to represent this new build.

The existing trace flag now separates `documents.prepare(position, true)`
from registry/isolated-anchor resolution. It does not change the prepared
membership, compiler roots, Worker lifecycle, memory policy or result mapping.
The extracted helper reduces the legacy engine 1,086 → 1,080 lines; that
file remains migration debt. Trace-off emits neither new event.

## Three independent mode-C processes

Every process uses a fresh private index, waits for catalog-ready, then issues
ten references followed by an unsaved comment edit and a version-2 retry.
Production `indexed-batched + closure + full SDK`, roots 64, default disposal,
normal diagnostics and one-second idle remain enabled. Anchor reuse is off;
phase trace is on. No explicit completion/definition warmup or forced GC.

Target: `HomeInitData` usage at zero-based UTF-16 **28:30** in
`common/src/main/ets/sendable/HomeInitData.ets`, `includeDeclaration=false`.
All **33/33** responses match the same nine exact Locations; each process
publishes normal version-2 empty target diagnostics and exits with code 0.

| Run | First request ms | First documents ms | First anchor resolution ms | Edit request ms | Edit documents ms | Edit anchor resolution ms | Whole-run product peak RSS bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 7,343 | 889.6 | 2,160.5 | 5,337 | 12.9 | 1,796.7 | 536,043,520 |
| 2 | 6,906 | 872.6 | 1,839.7 | 5,296 | 15.6 | 1,715.6 | 578,412,544 |
| 3 | 6,695 | 865.4 | 1,870.6 | 5,512 | 13.8 | 1,814.4 | 585,293,824 |

Each document preparation returns 256 prepared documents; subsequent anchor
filtering still produces a 308-SourceFile Program with one project SourceFile.
The final verifier still constructs 613 SourceFiles, including 151 project files.
These counts describe different pipeline states, not conflicting project sizes.

First document preparation median is **872.6 ms**, edit median **13.8 ms**.
First anchor/final compiler-ready medians are **1,534.2/2,543.1 ms**; edit
medians **1,478.3/2,579.8 ms**. Cached requests 2–10 take 2–3 ms, while
first/edit end-to-end medians remain **6,906/5,337 ms**. The prepared-document
warm state does not remove subsequent anchor or final Program construction.

Inclusive candidate-selection minus the two measured non-overlapping outer
anchor phases still leaves approximately 0.98–1.22 s first, 0.55–0.62 s edit.
That remainder includes unseparated admission/index/source-resolution/status,
worker queue/transport and other overhead. It is **not measured Rust/SQLite
time**. Registry resolve contains isolated Worker timing; do not add nested
spans. No causal speedup comparison with earlier builds is made.

## Replay and limits

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-anchor-document-phase.json \
  --out /private/tmp/settings-anchor-document-recheck.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

External sampling is configured at 50 ms; raw actual timestamps, Node/sidecar
roles, harness/sampler RSS, complete request timeline and normalized results
are preserved. Worker-thread RSS counts once. Peaks are whole-run process-tree
RSS, not per-phase peaks/PSS; short cache-hit bursts are not separately sampled
retention proof. Three samples and trace-on overhead do not establish P95 or
release latency. No legacy A/B, >3 GB reproduction, 50% memory gate or DevEco
comparison is completed. Cold fusion and exact scope/identity proof remain open.

Raw JSON SHA-256:

- [Run 1](../../.bench/anchor-reuse-2026-09-26/anchor-document-phase-C-1.json):
  `1386795d57e2f080516a9e6b0697ad064a858d6467c12be168e6dea9d0a79c42`.
- [Run 2](../../.bench/anchor-reuse-2026-09-26/anchor-document-phase-C-2.json):
  `52c21454da5d7e197f6d7fee79f468f059bf067d0cc46f403d66fc7b19db552d`.
- [Run 3](../../.bench/anchor-reuse-2026-09-26/anchor-document-phase-C-3.json):
  `8fa85e48767fc261c4e41f14579f070eaa7b638647565e31884e9ab55729c547`.

Check/build, 37 focused regressions and the tightened two-case trace-on/off
rerun pass; see [RED/GREEN](../tdd/references-anchor-document-preparation.md).
No full-suite claim, commit, push, merge or default change in this slice.
