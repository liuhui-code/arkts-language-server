# 30K ordinary completion deadline and root-lifetime diagnosis

Status: OPEN. Original uninstrumented failure retained. Minimal planning fix has public RED/GREEN and one ordinary replay; current whole check is running. No threshold change.
Parent298d65f5d7f796c347fe8be5c739e428066489d8 plus frozen IX17 candidate changes.
This is protocol testing, NOT real Zed UI acceptance. API24 SDK is partial.

## Ordinary failure: IDX-V1-SCALE-003 recurrence

Scale24 stopped after95 recorded sessions:67PASS,17WITH_FUNCTIONAL_GAPS,11FAIL.
Ten failures are retained old-baseline witness-capacity failures; one is a current candidate execution deadline.
Two complete ordinary trials exist; the third is incomplete. Last2 baseline cells and all32 planned profiles,
density25 and topology26 were NOT_RUN. Photos23 completed its separate7264.848s protocol endurance;
it does not turn this scale failure or the full-reference/rename gaps into successes.

Raw: `.bench/index-versioned-maintenance-20261104/scale-acceptance-24/scale-runs/dependencies-30000-candidate-2-ordinary-warm/`.
Forensic receipt: `namespace-final-20261109/scale24-ordinary-completion-deadline-failure.json` under the same evidence root.
30000 reachable generated sources, static fanout32/depth5; total Program membership is separately observed below.
No edits before this failure: didOpen Main.ets v1, first definition, repeated definition, completion.
Completion LSP id4 at Main.ets zero-based UTF16 line2/character56; `instance.value` member access.
Sent2026-11-10T00:18:27.678Z, error00:18:57.803Z,30132.580ms.
Public -32603: Request textDocument/completion failed with message: Semantic worker unavailable.
Worker id5, epoch1/thread1, NodePID83949. Watchdog execution-deadline at00:18:57.700Z,
limit30000ms, elapsed30025.649ms, interrupt policy. Last activity25.587ms earlier;
phase program, starts/returns4/3, checker3/3, sync12/11 are cumulative, not all builds attributable to completion.
Parent admission-to-send0.719ms, Worker receive-to-dispatch0.538ms; no evidence this completion waited30s in a queue.
First/repeat definitions22927.192/8459.377ms; repeat waited4054.514ms behind diagnostics, a separate delay.
Node peak1761.355MiB, native120.480MiB, tree1858.902MiB. No OOM or external stop evidence.
Normal shutdown/exit0, integrityPASS,2 sampled owned PIDs closed, no open progress. Recovery after failure NOT_TESTED.
All79 runtime assets and30000 fixture inputs plus3536 SDK inputs verified at endpoints.
Frozen worker SHA63e80188fe6b5e1c5f69450f77701fccc93b7ce4926d63c45149b0bdd43d9129.

## Independent strict-preserved diagnostic

Raw `scale003-host-version-20261110/run-strict/` and `compiler-calls-strict.1.ndjson`.
Concise receipt: `namespace-final-20261109/scale003-strict-host-root-transition.json`.
Only diagnostic worker differs:998f67714b5ab96dee62a1711f9af12e7def0005e2fcea56cca410216578b721.
Normal close/exit0,17 operations,WITH_FUNCTIONAL_GAPS, assets unchanged. This run is not an ordinary timing sample.

| Step | Host version before/after | Program before/after | Roots before/after | Total source files after | Inclusive sync ms |
| --- | --- | --- | --- | ---: | ---: |
| Initialization | 2:partial:0 / same | none / 1 | 0 / 2 | 369 | 1528.086 |
| First definition | 259:partial:0 / same | 1 / 2 | 2 / 258 | 30369 | 16236.589 |
| First completion, no edit | 260:partial:0 / same | 2 / 3 | 258 / 3 | 30369 | 14892.462 |

getProgram envelopes16237.298/14894.102ms include sync; do NOT add these overlapping intervals.
30369 is total compiler source-file count, not independently classified project membership.
This proves root churn and expensive synchronization in the diagnostic control, not the exclusive cause of original deadline.

## Actual code mechanism

In candidate worktree `.bench/worktrees/index-versioned-maintenance-20261104`:
- `src/semantic/completion-batch-planning.ts:15-20`: incomplete membership selects current-root completion fallback.
- `src/semantic/interactive-workspace.ts:132-146`: current profile emits current/open/additional explicit semantic roots;
  closure profile leaves the existing workspace root ownership unchanged.
- `src/core/types/typescript-host-file-names.ts:32-54`: inferred admission versus explicit semantic set;
  `updateSemantic` replaces root selection and rebuilds names.
- `src/core/types/typescript-language-service.ts:284-294,1653,1739-1764,1831-1834`:
  prepare updates roots, admission and changed semantic roots advance generation; Host project version includes it.
- Installed OHOS TypeScript4.9.5-r10 `lib/typescript.js:107712-107717`: unequal root filename arrays make
  isProgramUptoDate return false. synchronizeHostData at124351 then constructs a replacement Program.

Initialization already isolates SDK roots. Remaining observed churn happens between interactive operations,
when different query profiles share a fallback compiler owner. No change to source version is necessary to trigger it.
A principled fix must stabilize roots by semantic ownership while preserving ambient/global inputs, explicit provider
batches, partial-membership honesty and final freshness. Ignoring changed roots or retaining every historical root is not approved.
Public LSP regression and precise owner-boundary analysis precede product edits.

## IDX-V1-OBS-013: historical observer strict-mode limitation

The initial boundary helper was prepended before the original use-strict directive and disabled its directive meaning.
Thus `scale003-current-20261110` and `scale003-host-version-20261110/run` cannot certify strict-equivalent behavior.
Their raw evidence remains intact. This does NOT affect the original uninstrumented failure or frozen candidate.
Observer test: old helper3 tests/1FAIL (`strict-red.log`), corrected helper3PASS (`strict-green.log`).
The corrected runtime-strict preserves the directive at the beginning; metadata/return/exception identity checks pass.
`strict-observation-limit.json` names affected artifacts. Diagnostic instrumentation stays outside product code.

## Remaining acceptance

Root-churn fix/regression pending. Extra full-namespace reference admission costs remain separately documented;
no attribution from that reference path is assigned to this completion. Current scale/multi-round distributions,
profiles/density/topology and final-candidate post-fix checks remain incomplete. No merge/deployment performed.


## Minimal root-profile fix: public RED -> GREEN

Candidate source now changes only completion planning for this slice. Ordinary partial fallback keeps the
configured interactive profile rather than automatically selecting current; explicit current and discovery
batch projection remain. Public test added to the existing partial-completion-admission suite.
RED: exact unchanged-source public definition and completion correct, but Program1 ->2, roots3 ->2.
GREEN: Program1 retained, roots3 retained, completion detail correct. Full focused two-file run4/4PASS,
0filtered/failed,29489.458ms; includes partial edit/comment/detail/discovery and4096-plus export recall.
Raw logs: `namespace-final-20261109/scale003-public-root-retention-red.log`,
`scale003-root-retention-build.log`, `scale003-root-retention-targeted.log`.
New ordinary candidate worker52b5296b32460757343ed4673d46615f12d02d3cbac1431ffc375fed1ed7a0e5;
diagnostic-verifier also incorporates the shared planning change.79 assets frozen separately at
`scale003-root-retention-fix-20261110/identity.json`; no instrumentation in this ordinary runtime.
Its unchanged30K sequence replay is running separately, not appended as a successful replacement for the failed95 matrix.
PriorIX17 2455/2455 and Photos23 completed on the PREVIOUS frozen candidate; final checks for this source remain pending.


### New ordinary replay: terminal, one session only

2026-11-10T00:58:52.199Z ->01:00:40.241Z.17 operations,9PASS/8FUNCTIONAL_GAP,
statusWITH_FUNCTIONAL_GAPS, normal shutdown/exit0, both DB integrityPASS,2 sampled owned PIDs closed,
no open progress and all frozen assets unchanged. First/repeat member completion2867.645/3162.709ms;
reopen completion3006.169ms. First/repeat definition18945.496/5913.251ms; edited/undo definitions10866.435/10356.784ms.
The original30s completion failure was not reproduced in this one run; sustained definition tails and full references/
rename unavailability remain. This does not establish a successful multi-round distribution or full30K readiness.
Node peak1860.578MiB, Native125.289MiB, sampled tree1982.727MiB. Worker threads included once in Node RSS.
Machine receipt `namespace-final-20261109/scale003-root-retention-first-ordinary-replay.json`.
The original failed95 sessions are retained independently. Current whole check is next, not assumed from IX17.


### Provenance and acceptance boundary

Pinned298d65f already contains the incomplete-membership ->current selection in completionPreparation.
Therefore this selection branch is pre-existing; the current diagnosis does not establish that R-13 introduced it.
The old30K comparison stops at its earlier witness-capacity failure, so it provides no comparable old completion latency.
The new fix removes one measured avoidable rebuild, not true30K dependency cost or all semantic-owner transitions.
IX18 fresh `pnpm check:fast` has started with2439 frozen inputs; it supersedes neither prior raw failures nor old
Photos endurance evidence until it actually completes. No second multi-round or post-fix endurance result yet.


## IX18 current whole candidate gate PASS (2026-11-10)

Fresh full `pnpm check:fast`:2456/2456PASS,0fail/cancelled/skipped/todo,4141.296s wall;
raw Node test duration4132.627s.2439 source inputs unchanged before/after; no mid-run source edit.
This includes the new partial definition->member-completion Program-retention regression.
Receipts: `namespace-final-20261109/ix18-complete-check-receipt.json`, `ix18-pnpm-check-fast.log`,
`ix18-terminal-summary.json`, and exact4-file `ix18-root-retention-review.patch`.
Rust is explicitly reused from identical249 inputs/Native5f648342 with check-log hashes revalidated, not a fresh cargo run.
Photos27 gate has actually released into isolated originalPhotos input preparation. New formal7200s not yet started;
Photos23 completed endurance remains old-candidate evidence. Scale28/density29/topology30 wait serially.
Original scale24 failed95 results, full30K references/rename limits, definition tails, partialSDK, OBS012,
Windows SSH timeout and real UI tool-host failure remain recorded. No full feature/platform/performance acceptance.
No product threshold change, commit/push/merge/deployment or daily process restart.
