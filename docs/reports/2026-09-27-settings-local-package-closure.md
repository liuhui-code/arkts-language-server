# Settings local package closure and actual semantic-unit batching

Status: **real graph blocker repaired; full mode-C exactness/diagnostics PASS;
cold latency remains FAIL; no release/default promotion**.

Parent `9f91122ac504365c57473a430094da09baac9309` plus preceding dirty slices.
This follows the [constructor-unit negative report](2026-09-26-settings-constructor-conservative-units.md).
No real-project module/profile/dependency edits, artificial scale, forced GC,
heap snapshots or disabled diagnostics. User `AGENTS.md` edits preserved.

## Narrow implementation and boundary

Settings phone's `@ohos/settings.suggestion → file:../../feature/suggestion`
points to a legitimate local package with an empty Index.ets, not a root
module. The graph now verifies its manifest/name/entry/physical containment
and follows local metadata to declared-module dependencies. It records
packageRoots separately; **32 units remain 32**, membership remains 1,496.
Package roots are included in index discovery admission, not silently dropped.
No module identity is invented, and incomplete/unsafe packages still fall back.
Compiler remains the final authority, each verifier transient, concurrency one.

This is not general support for all references in undeclared package sources.
A separate real-LSP characterization preserves the existing -32803 failure
when such sources actually carry references; partial success is forbidden.
Metadata graph completeness alone does not graduate semantic capability.
See [TDD](../tdd/references-local-package-closure.md).

## Frozen input/build

- Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`.
- Node v26.3.0, Darwin 25.6.0 x64; selected ETS API24 6.1.1.125 at
  `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
  Declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  Compile/target/compatible 23/20/20 retained: compatibility investigation,
  not API23/24 or DevEco equivalence.
- Query MenuController.ets, `common/src/main/ets/core/controller/`,
  zero-based UTF-16 **90:17**, construction, declaration excluded.
  [Constructor oracle](../../bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json):
  267 exact normalized tuples, not the class-declaration oracle.
- [New manifest](../../bench/references/manifests/settings-menucontroller-local-package-closure-api24.json)
  pins server `f631bf3212267b3cabeaeaa27846c882872ca9c5137e321bc270982ecbcfb2a2`,
  semantic worker `50f3977844281e427c9935ddacfab4a884d95f09ae551c33a108b65daa912934`,
  verifier `952533f97faaa8f67e1bf752a34aee95e9b97f5ad5840a6398915559bac34113`
  and stdlib/sidecar. Previous pinned artifacts remain previous evidence.
- closure/full SDK/64 roots; local-export seed and anchor memo disabled.
  `ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS` remains default-off.

## Completed control and actual experiment

Fresh same-build legacy mode A: **PASS**, 267 exact locations, **9,258 ms**,
normal version-1 diagnostic publication (one diagnostic), exit 0.
External process-tree peak RSS **800,055,296 bytes**, 142 samples.
Raw `.bench/anchor-reuse-2026-09-26/menu-local-package-closure-legacy-A-1.json`,
SHA256 `636f62541993e637ac14645486aa213f767d8e771ef9f71693250e7635d1eb4f`.

Flag-on mode C is **PASS** for the replay's exactness/diagnostic contract:
eleven responses all match 267 tuples. First request **50,991 ms**, nine
cache hits **28–52 ms**, post-unsaved-comment retry **55,140 ms**. Normal
version-2 diagnostics publish (one diagnostic), exit 0. It plans **14 batches
per miss**, membership=candidates=1,496, semanticUnitMode=project-graph.
Twenty-eight transient batches complete. Process-tree peak RSS **972,840,960
bytes**; independently sampled server Node peak **943,423,488 bytes**;
883 samples. Raw `menu-local-package-closure-units-C-1.json`, SHA256
`3de3192206e25417ae6a64205ed8242f4db960aaaf8a25423b186c7499b1091a`.

The index still reports candidate-ineligible for this constructor query, so
all legal units are verified, not index-narrowed. The largest admitted closure
is **all 1,496 files**, and largest observed compiler Program has **1,348 project
SourceFiles**. This is not a hard small-Program bound: reducing duplicate batch
preparation does not make an indivisible correct dependency closure small.
At 5.5× the fresh legacy first-request latency, the prototype also fails the
earlier ≤3× cold go/no-go target, besides the user's absolute 500 ms target.
Do not graduate merely because fourteen is smaller than twenty-four.

The same-build flag-off mode-A comparison completes **PASS**: 267 exact tuples,
normal version-1 diagnostics, exit 0, **104,540 ms**, 24 conservative batches,
812 external samples. Raw `menu-local-package-closure-files-A-1.json`, SHA256
`2cd804fb1bebb9b4e00a09a380eefb62a6d122037c9323bcb01e061210d13cf1`.

For an equivalent first-request interval (request-start through response),
external samples show:

| Strategy | First references | Process-tree peak RSS bytes | Node PID peak RSS bytes |
|---|---:|---:|---:|
| Legacy | 9,258 ms | 797,655,040 | 751,685,632 |
| Default file batches, experiment off | 104,540 ms | 716,783,616 | 679,374,848 |
| Conservative semantic units, experiment on | 50,991 ms | 889,757,696 | 853,262,336 |

Grouping reduces observed first-request time by 51.2% versus file batches,
but increases interval tree peak by 24.1%. It is still 5.5× legacy latency
and 11.5% above legacy interval tree peak. These are **single-run comparisons**,
not medians, P95, confidence intervals or release graduation. Mode-C full-run
peak remains separately reported above; do not pair it with mode-A as a memory
win. Normal automatic diagnostics remain enabled in every measurement, so
these interval peaks are not compiler-only allocation attribution.

Default-off phase traces further separate first-request work: file batching's
24 completed batches spend a summed **88,590.72 ms** on Program readiness
(createProgram subset **75,139.99 ms**) and **4,128.03 ms** on verifier queries.
The 14 unit batches spend **40,345.81 ms** on readiness (createProgram subset
**33,770.64 ms**) and **1,763.26 ms** on queries. These fields overlap: do not
sum createProgram into readiness again. This directly supports repeated
compiler preparation as the remaining dominant cost, not result mapping.
Maximum actual project SourceFiles grows from **554 to 1,348** in the paired
first request, consistent with the memory trade-off; neither file count nor
this single trace is a byte-allocation model.

Worker threads are not counted again; external process-tree RSS, Node PID and
harness/sampler are separate measurements. The sampler interval is a 50 ms
target, not a guarantee that expensive process enumeration hits every deadline.

Original >3 GB/5 GB reproduction, final 50%/DevEco PSS, all-state 500 ms and
Windows gates remain open. No commit, push or merge.

## Verification

The final model/public LSP regression command passes **68/68**, zero skips,
in 113,927 ms: model boundaries, anchor seed/reuse, conservative units,
non-module package fail-closed behavior, index state/resync, scheduling,
coalescing, worker transport and test-layer inventory. A separate command
passes **21/21**, zero skips, in 95,015 ms: references-batching package,
re-export, semantic-unit and SDK terminal regressions plus bounded project
profile/resource checks. Its initially mistyped target-membership path is
corrected and run separately: **10/10 PASS**, zero skips, 6,796 ms. The three
commands total **99 passing tests**, without claiming the missing path was
executed by the first command. This is focused
verification, not a new full
`pnpm check:fast` or release gate PASS.

`pnpm check` passes; frozen server/semantic-worker/verifier hashes still match
the measured manifest. Changed model/helper/public fixture files are
391/172/142 lines, respectively. Pre-existing large-file migration debt is
not declared resolved: legacy-semantic-engine.ts is still 1,075 lines;
references-batching.test.mjs (only executed in this slice) is 1,517 lines.

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
  --manifest bench/references/manifests/settings-menucontroller-local-package-closure-api24.json \
  --out .bench/anchor-reuse-2026-09-26/menu-local-package-closure-units-C-replay.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Always choose a fresh output filename; frozen asset mismatch blocks replay.
