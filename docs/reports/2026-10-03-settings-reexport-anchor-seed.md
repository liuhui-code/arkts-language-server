# Settings/API24: direct-proof diagnosis and opt-in re-export anchor seed

Status: **six independent first-query replays, one two-arm repeated/edit
replay, and one declaration-inclusive real-project pair PASS; narrow opt-in
latency improvement, no default graduation**.

## Fixed input and cause

Parent `911ae43c274175614559b63f0311504747d8393d` on
`codex/references-resident-fast-path`, dirty worktree preserved. Real clean
Settings checkout `.bench/real-projects/settings-ecc550` is
`ecc550dfaed880e04e38a2477eb7235cd50475b9`; no synthetic scale or changed
project boundary. SDK is DevEco ETS API24 `6.1.1.125`, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is the user-approved API24 compatibility track for the project's declared
compile23/target20/compatible20, not matched-SDK or DevEco parity.

The query is `textDocument/references`, `includeDeclaration=false`, on the
`HomeInitData` named re-export in `common/index.ets`, zero-based UTF-16
`(284, 23)`. The frozen oracle has nine exact Locations, SHA256
`58908aa4ee2554864cd4467ccf7a51b3aa8e6dd570fc0f66decc6500bf7f937b`.
The [manifest](../../bench/references/manifests/settings-homeinitdata-reexport-seed-api24.json)
pins server `74d195ba...9562`, semantic/verifier Workers, standard library,
sidecar `18f87160...f6b1`, Node v26.3.0, SDK and oracle. The only A/B variable
is `ARKTS_REFERENCES_REEXPORT_ANCHOR_SEED=0|1`. Indexed-batched + closure +
full SDK, 64 roots, normal diagnostics and transient final verifier stay fixed.

Trace-only `references.index.direct-proof` on the real cursor says
`supported=false`, `completeness=ready`: current direct index query does not
prove a named re-export position. An earlier diagnostic-only fresh replay
returned nine exact Locations in 7.643 s with 622,354,432-byte product RSS
peak; its anchor and batch each paid ~2.9/2.5 s Program readiness. The A/B
below uses a **new common build** and does not pool that diagnostic run.

## A/B results

Fresh-process order: off1, on1, on2, off2, off3, on3. Each waits for the same
catalog-complete condition, opens the same file, makes the **first** references
request, then idles 1 s. External 50 ms-requested sampler measures whole Node
PID once plus Rust sidecar; Worker-thread RSS is not added twice. All six runs
measure request wall time **after** catalog completion, so index startup is not
hidden inside or confused with the 4–7 s semantic query. All six runs
return the same nine normalized relative URI/range tuples (array SHA256
`5a3f7d018616d49b2dcbc569479d3963c8ad831ab3f19c8374e29f695aecc961`),
normal version-1 empty target diagnostics, no timeout/OOM/partial result and
server exit 0.

| Run | Request ms | Product-tree peak RSS bytes | Separate anchor Worker | Final batch |
| --- | ---: | ---: | ---: | --- |
| off1 | 7,184 | 621,912,064 | 1 | 9 Locations |
| on1 | 4,326 | 627,527,680 | 0 | 9; `anchorVerified=true` |
| on2 | 4,533 | 605,593,600 | 0 | 9; `anchorVerified=true` |
| off2 | 7,057 | 616,792,064 | 1 | 9 Locations |
| off3 | 7,389 | 617,234,432 | 1 | 9 Locations |
| on3 | 4,456 | 602,693,632 | 0 | 9; `anchorVerified=true` |

Medians: request **7,184 → 4,456 ms** (about 38% faster), product peak
**617,234,432 → 605,593,600 bytes** (about 1.9% lower). One on-run peak was
~0.9% above its adjacent off-run, so no per-run monotonic memory claim. The
final compiler batch still prepares **674 SourceFiles**; this avoids one
duplicate anchor Program but does **not** shrink that batch's working set or
make first-click references 500 ms. Trace is on and sample size is three per
arm, not a latency P95 or PSS/release-memory comparison.

Raw reports with full request timeline, memory curve, artifact pins, diagnostics
and normalized results: `.bench/semantic-ready-s05/settings-reexport-seed-{off,on}-{1,2,3}-20261003.json`.

## Same-process repeated/edit control

The unchanged manifest/build/project/SDK also ran mode C once per arm, in
**on→off** order. Each process made ten references requests on open document
version 1, appended an unsaved comment through `didChange` version 2, and
made one more references request. All **11/11 per arm** passed the nine-Location
oracle with the same normalized array SHA256 as the first-query series;
`repeatedResultsIdentical=true`, normal empty version-2 diagnostics and clean
server exit. The trace shows nine result-cache hits and two complete misses/
stores per arm. The seed arm accepted its discovery candidate twice; both
final batches reported `anchorVerified=true`. The control arm performed two
separate compiler anchors. Neither arm fell back or returned partial results.
The seed-on final batches still admitted 674 compiler SourceFiles and took
3.202/2.912 s; the seed removes duplicate anchoring, not the remaining heavy
Program preparation after either cache miss.

| Arm | First request | Nine unchanged repeats | Post-edit request | Product-tree peak RSS |
| --- | ---: | ---: | ---: | ---: |
| seed off | 7,263 ms | 1–6 ms | 5,701 ms | 659,251,200 bytes |
| seed on | 4,719 ms | 1–2 ms | 3,017 ms | 626,302,976 bytes |

The external sampler requested 50 ms intervals and retained 195/off and
157/on samples. It measured the whole Node PID once plus the sidecar, with
its own RSS separately excluded. This is **one sequential pair**, not a P95,
randomized A/B, leak trend, PSS or 500 ms first/edit pass. Raw reports:
`.bench/semantic-ready-s05/settings-reexport-seed-{off,on}-mode-c-20261003-escalated.json`.
An earlier restricted on-arm attempt failed with `spawn EPERM` while starting
the external sampler, before initialize or any LSP request; it is retained as
`.bench/semantic-ready-s05/settings-reexport-seed-on-mode-c-20261003-agent.json`
and is **environment failure**, not a semantic result.

## Declaration-inclusive real-project control

A separate pinned [manifest](../../bench/references/manifests/settings-homeinitdata-reexport-seed-with-declaration-api24.json)
uses the same clean Settings revision, SDK, query cursor and production binaries,
but `includeDeclaration=true` and the frozen ten-Location oracle. In serial
fresh-process mode A, seed-off and seed-on both returned **10/10 exact**
relative URI/range Locations, including the named re-export at
`common/index.ets:284:23–35` and the class declaration at
`common/src/main/ets/sendable/HomeInitData.ets:16:13–25`. Normal version-1
diagnostics were empty; both processes exited 0. The seed-on trace recorded
`anchorVerified=true`, with no fallback or separate anchor Worker. Both final
batches still built 674 SourceFiles.

| Seed | First request | Product-tree peak RSS | External samples |
| --- | ---: | ---: | ---: |
| off | 7,491 ms | 635,486,208 bytes | 154 |
| on | 4,506 ms | 612,376,576 bytes | 120 |

This **one serial pair** suggests a 2,985 ms (~39.8%) latency reduction on
this cursor, not a P95, randomized A/B, PSS, matched SDK, or product-wide
correctness result. The first restricted seed-off attempt failed with
`spawn EPERM` before initialize; it is retained separately as an environment
failure. Valid raw reports are
`.bench/semantic-ready-s05/settings-reexport-seed-with-declaration-{off,on}-mode-a-20261003-escalated.json`.

## Next-stage latency attribution (observation only)

A new build adds the default-off
`references.search.document-prepare.complete` event without changing
`documents.prepare(position, true)` behavior. Its separately pinned
[trace manifest](../../bench/references/manifests/settings-homeinitdata-reexport-preparation-trace-api24.json)
changes only the semantic Worker bundle hash from the declaration-inclusive
pair above. One new seed-on, catalog-ready mode-A replay on the same clean
Settings/API24 input passed the ten-Location oracle (including declaration),
returned normal empty version-1 diagnostics, and exited 0. Request wall was
**4,474 ms**; externally sampled product-tree peak RSS was **614,789,120
bytes** over 180 samples. The initial restricted attempt failed with sampler
`spawn EPERM` before LSP startup and is not a semantic result. Valid raw trace:
`.bench/semantic-ready-s05/settings-reexport-preparation-trace-on-mode-a-20261003-escalated.json`.

| Traced phase | Observed time |
| --- | ---: |
| Candidate selection | 111.07 ms |
| `documents.prepare(position, true)` | 1,139.25 ms; 256 prepared documents |
| Final transient verifier batch | 2,990.71 ms; 674 SourceFiles |
| Within verifier: Program readiness / `createProgram` | 2,630.53 / 2,208.12 ms |
| Within verifier: compiler reference query | 48.80 ms |

The preparation interval is about one quarter of this request, but this
**single run** does not attribute its time among dependency closure,
membership, file preloading, or identity preparation. The final verifier is
still the dominant interval. No source is excluded, no memory strategy is
changed, and no default flag is enabled. The next safe experiment must first
separate those preparation subphases, then prove exact Locations, overlays,
freshness and memory on the same pinned real project before skipping any
work. This trace is neither a 500 ms result nor a new A/B performance gate.

Re-run this pinned trace from the repository root with a new output path:

```sh
ARKTS_REFERENCES_REEXPORT_ANCHOR_SEED=1 /usr/bin/caffeinate -i \
node scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/index.ets --symbol HomeInitData --line 284 --character 23 \
  --oracle bench/references/oracles/settings-homeinitdata-api24-with-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-reexport-preparation-trace-api24.json \
  --out .bench/semantic-ready-s05/settings-reexport-preparation-trace-recheck.json \
  --mode A --catalog-state ready --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 1000 --trace
```

## Preparation subphases: cold membership, warm compiler miss

The next trace-only build has a separately pinned
[manifest](../../bench/references/manifests/settings-homeinitdata-reexport-preparation-phases-api24.json).
It preserves the same Settings revision, SDK, original cursor, declaration-
inclusive ten-Location oracle and transient verifier policy. Its six ordered
document-preparation events are emitted only with tracing; the public LSP
trace-off control emits none. Existing overlay authority and shadowed-path
projection moved to a cohesive helper; the preparation method's physical line
count decreased from 2,057 to 2,056. No file admission, membership, preload,
compiler strategy, budget or default changed.

One fresh-process mode-A replay returned **10/10 exact** Locations and normal
empty version-1 diagnostics, exit 0, in **4,793 ms**. An independent mode-C
replay on the same pinned build returned **11/11 exact** ten-Location responses:
first 4,478 ms, nine unchanged repeats 2–3 ms, then 3,094 ms after an unsaved
comment edit; normal version-2 diagnostics were empty. External whole-product
RSS peaks were 599,224,320 / 627,576,832 bytes (126 / 145 samples) for A/C.
These are single runs, not a paired performance effect or P95.

| Existing work | Mode-A cold | Mode-C first | Mode-C post-edit |
| --- | ---: | ---: | ---: |
| Current file + overlay authority | 0.53 ms | 0.53 ms | 0.15 ms |
| Dependency closure | 155.88 ms | 105.84 ms | 67.67 ms |
| Project membership | **987.46 ms** | **1,010.47 ms** | **0.05 ms** |
| Additional workspace preload | 54.13 ms / 121 docs | 21.16 ms / 121 docs | 7.25 ms / 121 docs |
| Entire document preparation | 1,198.88 ms / 256 docs | 1,138.83 ms | 75.35 ms |
| Final verifier batch | 3,242.93 ms | 2,989.65 ms | 2,929.82 ms |
| Within batch: `createProgram` | 2,464.63 ms | 2,201.56 ms | 2,156.54 ms |
| Within batch: compiler reference query | 47.27 ms | 46.02 ms | 47.19 ms |

The membership scan is the dominant **cold document-preparation** cost for
this checkout, while the preload is tens of milliseconds—not the assumed
one-second culprit. After the edit, membership is reused, yet the final
compiler Program is still built again and dominates the 3.094-second cache
miss. This evidence rejects preload deletion as the primary latency fix for
this symbol; it does not establish a safe alternative to membership freshness
or qualify persistent Program reuse, whose S05 100-operation RSS gate failed.
`withProjectFileIdentities` and `semanticGraph` lie after document preparation
and before planning; the current six events do not separately time them.
Raw reports with exact Locations, diagnostics, trace and 50 ms-requested
external RSS curves:
`.bench/semantic-ready-s05/settings-reexport-preparation-phases-on-mode-{a,c}-20261003.json`.
For reproduction, use the pinned trace command above, substitute
`settings-homeinitdata-reexport-preparation-phases-api24.json` as `--manifest`,
choose `--mode A` or `--mode C`, and give each run a fresh `--out` path.

## Reproduction and remaining gate

From the repository root, use the pinned manifest and the clean local Settings
checkout. Change only the environment flag `0`/`1` and choose a fresh output
filename:

```sh
ARKTS_REFERENCES_REEXPORT_ANCHOR_SEED=1 /usr/bin/caffeinate -i \
node scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/index.ets --symbol HomeInitData --line 284 --character 23 \
  --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-reexport-seed-api24.json \
  --out .bench/semantic-ready-s05/settings-reexport-seed-recheck.json \
  --mode A --catalog-state ready --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 1000 --trace
```

To replay ten unchanged queries plus one unsaved comment edit, change
`--mode A` to `--mode C` and use a fresh `--out` filename. The manifest pins
`includeDeclaration=false`; use the separate declaration-inclusive manifest
and oracle for that narrow real-project check.

Do not default-enable. Public child-process fixture tests now pass
include-declaration, unsaved **reference-adding** overlay with ContentModified
and retry, and explicit cancellation with no partial result. The real Settings
mode-C edit is comment-only. The declaration-inclusive first-query Settings
pair above is complete, but a real Settings reference-adding overlay/cancel
matrix and broader symbol/SDK correctness remain open, as do
randomized ≥100-operation session resource gate, post-eviction PSS, original
>3 GB reproducer/final 50% memory gate, Windows, and ≤500 ms. The prior
anchor-Program reuse experiment failed the Photos RSS gate; this seed retains
per-batch transient Workers instead. The first `pnpm check:fast` found a new
TypeScript implicit-`any` error and exited nonzero; after the annotation fix,
`pnpm check` passed and the emitted server SHA was unchanged. The **complete**
`/usr/bin/caffeinate -i pnpm check:fast` rerun passed **1,204/1,204 tests,
exit 0**, zero fail/cancel/skip/todo, duration 1,085,372 ms. The six real
replays and whole gate therefore use identical runtime bytes. All modified
handwritten source/test/script files remain at or below 500 physical lines.
After adding the three public safety cases, the complete macOS-sampler-enabled
`/usr/bin/caffeinate -i pnpm check:fast` passed **1,207/1,207**, exit 0,
zero fail/cancel/skip/todo, duration 1,106,443 ms. Final server/semantic-worker/
verifier SHA256 values still equal the pinned manifest, `git diff --check`
passes, the test file is 232 physical lines, and the Settings checkout remains
clean. This supersedes the 1,204-case count only for the new test source; it
does not change the earlier real A/B data or graduate the default.
