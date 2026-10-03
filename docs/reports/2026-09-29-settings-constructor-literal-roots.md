# Settings / API24: source-local constructor candidate roots

Status: **implementation and public tests GREEN; final whole-fast1133/1133
PASS; Settings exact, no new rule hits or latency improvement**.
This extends [the empty-module slice](2026-09-29-settings-constructor-empty-scope.md),
not its historical whole-gate verdict. See
[TDD](../tdd/references-constructor-literal-roots.md) and
[ADR0005](../adr/0005-index-proof-trust-boundary.md).

## Implemented vertical slice

After a successful original-cursor/raw-constructor compiler search, the pinned
official parser may prove an unsearched external module consists entirely of
exported const declarations with simple identifiers and scalar literal values.
No second parser, Program, TypeChecker or AST cache is introduced. Ordinary
comments are allowed; type annotations, imports/re-exports, identifier values,
directives/JSDoc, parse errors and every unknown shape remain unknown.
Existing exactly empty external modules remain eligible.

The Worker and accepting owner read original-token current text. Only pending
candidate roots are removed: original membership, dependency availability,
query, open overlays and unknown callers remain. Consumed exclusions are read
again before publication. Failure discards accumulated Locations and runs the
original complete plan with exclusions disabled, including recursive fallback.
One partial Program never certifies the whole constructor search by unioning
its search paths with other Programs.

Public framed-LSP cost RED **10 != 6** becomes **10 control -> 6 enabled**
completed batches across both declaration policies, exact legacy sets and the
unopened inherited alias caller preserved. A dependency-seam strengthening also
passes: the unknown caller imports the excluded module's scalar value; both
last Programs contain all six nonempty sources. It remains a dependency, not a
candidate root. Standalone command is 1/1 PASS, 8,734.671115 ms.

Related focus is **38/38 PASS, exit0**, 134,857.386425 ms: 16 constructor,
18 resident freshness/coverage and four manifest cases. The subsequent one-case
dependency strengthening above passes separately; the final whole-gate below
must test the frozen final test source. Original 30s references deadlines and
automatic diagnostics remain. Source-changed-after-replan recovery, aliases,
parser recovery, directives, overlays, cancellation and trace-off are public
transcripts, not private executor mocks. Independent narrow review has no
remaining concrete blocker. Experimental switch remains default-off.

## Fixed environment and inputs

Server parent `911ae43c274175614559b63f0311504747d8393d`, dirty
`codex/references-resident-fast-path`; preserve all preceding changes and
user AGENTS.md. [Manifest](../../bench/references/manifests/settings-menucontroller-constructor-literal-roots-api24.json)
pins server/Workers/standard-library/native bytes, Nodev26.3.0 and the oracle.
Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`, original1496-member
semantic universe, no boundary changes or copied scale files. macOS26.6.2
build25G83, IntelMacBookPro16,1/i7-9750H,12logicalCPU,16GiB,AC attached;
command-scoped idle-sleep prevention, performance replay separate from tests.

SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
API24/ETS6.1.1.125, declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is the authorized compile23/target20/compatible20 compatibility track,
not matched-SDK/DevEco equivalence. Original MenuController constructor cursor
`common/src/main/ets/core/controller/MenuController.ets` `(90,17)`, zero-based
UTF-16, declaration excluded. The 267-tuple oracle SHA256 is
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.

ModeC: fresh process/index, ready, original document, ten references, unsaved
comment, one retry. Normal diagnostics, no forced GC or heap snapshot.
Indexed-batched/closure/fullSDK/64 roots/dispose/1024MiB stays fixed. R-09,
warm anchor reuse and conservative-unit experiments are off; the local-export
seed is explicitly on to retain the established rejected-class-seed workload.
Only the default-off constructor exclusion experiment is enabled.

## Actual Settings result

**PASS, 11 x 267 exact/valid Locations**, all expected URI+UTF-16 comparisons
pass without errors. Exit0, normal version2 diagnostics, no timeout/OOM or
sampler error. Catalog ready7.695s after initialize response. Two class seeds
are rejected, work discarded, then **14 complete batches per miss**, 28 total.
Constructor root replans and whole-scope exclusion events are both **zero**.
Nine hits are from the existing exact-result cache, not this new rule.

| Query state | End-to-end ms |
| --- | ---: |
| First references | 61,205 |
| Nine cache hits | 29,32,51,37,27,29,29,27,27 |
| Unsaved-comment retry | 61,528 |

Programs still contain74–1348 project SourceFiles. Previous final-artifact
one-process smoke was57.394/58.108s; neither run is a randomized paired causal
latency comparison. This run proves exact real-workload behavior, **not**
acceleration, 500ms, cold P95, general constructor proof or default graduation.
Small source-shape surveys do not establish which admissible files are missing
from actual Programs; do not infer a candidate exclusion from file-count alone.

External sampling counts the Node PID once plus Rust sidecar, not each Worker
RSS again. Observed Node/product peaks **1,048,928,256/1,091,969,024 bytes**;
10s-idle product **793,694,208 bytes**. Harness event-sampled peak112,275,456
and sampler peak129,011,712 bytes are separate. Requested50ms has actual126ms
median/289ms maximum gaps,1116samples: observations, not hard caps or PSS.
Existing API24-track TS2307 `@ohos.systemparameter` at `(19,28)-(19,51)` stays;
replay PASS does not certify clean SDK diagnostics.

Raw `.bench/references-constructor-literal-roots-api24/settings-mode-c.json`
includes normalized results, framed transcript, memory curve, request/diagnostic
timeline and environment pins. SHA256
`8bcca1d23e2449b8ea6236702391200199d4fa9d41a4148f02d9fdd72601ecfb`.
Focus log SHA256
`b8379970ade875ffd68fbc77184cf88d2a2c5cc6a1dc34f912a009e1f8746b2d`.

## Frozen full gate

Final `pnpm check:fast` is **1133/1133 PASS, exit0**, zero failures,
cancellations/skips/todos, duration **1,093,203.504409 ms**. Source/tests/build
inputs remain byte-identical throughout the full run.
The 332-file `src/tests/scripts/config` byte inventory SHA256 is
`41889b1017906300391a1134997a15bc5af912dbb1adb062fe8495cce25b372d`.
The preceding 1126/1126 gate belongs to the preceding source, not this build.
Full raw `check-fast.log` SHA256 is
`d96a377c902223c88a2efd8ce8cce304c37063c76cff5538adc516efe835d485`.
Postflight passes the pinned server/Workers/standard-library/native/SDK/oracle
manifest, clean unchanged Settings revision and preserved AGENTS.md SHA256
`c5557997b071c23d6965ec240969333d0711a0412ebe2c30f075debffdd3028e`.
New handwritten source/test/script files stay
<=500 physical lines; LanguageService remains3629-line migration debt, reduced
from3712 at parent and unchanged by this literal-root slice.

Original>3GB, final50% memory, PSS/DevEco, nativeWindows and cold/edit500ms
remain independent open gates. No commit, push, merge or default change.

## Replay command

Use a new output filename; existing evidence is never overwritten. External
macOS PID sampling requires authorized read access.

```sh
/usr/bin/caffeinate -i env \
  ARKTS_REFERENCES_CONSTRUCTOR_SCOPE=1 \
  ARKTS_REFERENCES_RESIDENT_FAST_PATH=0 \
  ARKTS_REFERENCES_ANCHOR_REUSE=0 \
  ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
  ARKTS_REFERENCES_CONTEXT_RETENTION=dispose \
  ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=0 \
  ARKTS_MEMORY_BUDGET_MB=1024 \
  /Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-constructor-literal-roots-api24.json \
  --strategy indexed-batched --dependency-profile closure --sdk-profile full \
  --batch-roots 64 --mode C --trace --timeout-ms 180000 \
  --diagnostic-timeout-ms 180000 --sample-interval-ms 50 \
  --out .bench/references-constructor-literal-roots-api24/settings-replay.json
```
