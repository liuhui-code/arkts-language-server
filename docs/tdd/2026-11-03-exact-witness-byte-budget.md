# Exact witness budget: reconstruction and fresh TDD receipts

## What survived and what did not

At 2026-11-03 14:23 UTC, the original phase 2 worktree, shared patch/report,
raw logs and frozen phase 1 fixture were missing. The existing Git repository
had neither branch/worktree nor object for `5b729f29ca0a94b1aaa73c5a1450cb15e97425a6`;
fsck exposed no recoverable unreachable candidate, and GitHub returned 422 for
that SHA. The old local artifact was **not** recovered. Conversation records
provide design/code guidance, not current test certification.

Main was freshly verified at14:25 as `298d65f5d7f796c347fe8be5c739e428066489d8`; PR115/116 remain open drafts.
The new isolated worktree is `arkts-witness-budget-recovery`, branch
`feat/exact-witness-budget-recovery-20261103`, authoritative base
`298d65f5d7f796c347fe8be5c739e428066489d8`. No phase 1/3 tree is edited.
Node20.19.5, pnpm8.15.9 and cargo1.95.0 come from the existing audit toolchain.
Pinned compiler SHA remains
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`.
New evidence root: `.bench/witness-budget-recovery-20261103/`.

## New baseline RED and characterization

1. Build untouched main with `node scripts/build-runtime.mjs`. New runtime
   identity is in `baseline-runtime.sha256`, not the lost candidate's old hashes.
2. `node --test --test-concurrency=1 tests/semantic/large-closure-witness-budget.test.mjs`:
   4002-source control PASS; 6002-source first definition returns-32803;
  1PASS/1FAIL, exit1 (`red-large-closure.log`). Both use actual server child
   processes and Content-Length framed stdio, not private witness substitutes.
3. Large SDK4200-declaration regression:0PASS/1FAIL, exit1,3.267s. Initial
   preparation is degraded/current-program-inputs-unproven and first definition
   returns-32803 (`red-large-sdk.log`, `red-large-sdk-runtime.txt`).
4. Five complete existing ADR0036 files pass43/43 on untouched main, exit0,
  61.390s (`baseline-characterization.log`): unnotified-import-type-recovery,
   changed-source-read-witness, sdk-relative-input-guard, request-input-validation,
   resident-input-proof-boundaries.

## Representation slice and retained failure

The first slice keeps both old4096 thresholds while moving facts/provenance and
failure paths into the exact shared ledger. Pure ledger/capsule tests pass6/6.
Typecheck/build pass. The complete five-file representation cohort is **42/43**,
exit1 (`representation-characterization.log`), not retrospectively PASS.

Only `changed-source-read-witness`, mutation=null fails. Definition/completion
content is current, but context count becomes2 instead of1. The recorded reset
reason is content-revision-change, not a capacity or namespace-generation error.
An unchanged complete-file rerun passes24/24 (`representation-source-rerun.log`);
this does not explain or erase the first failure.

Independent static review confirms regular-source tag equivalence and notes that
content-revision reset directly depends on applied/current revision and complete
source delta, not witness provenance. A diagnostic/read race is a hypothesis,
not established causality. The separate phase 3 experiment reports main5 trials
4PASS/1FAIL and its candidate4/1 with the same assertion. This establishes that
it occurs on main, not that every observed failure has a proven identical cause.

This reconstruction also ran a fixed five main/five representation cohort:
5/5 and5/5 selected cases pass. Every trial explicitly reports23 name-filter
skips; these are selected tests, never whole-file acceptance. Logs:
`repeat-main-control.log`, `repeat-representation.log`.

The independent main control uses unchanged tracked source/configuration and
its own compiled runtime. Initial `git archive` failed on the existing missing
grammar blob, before producing a usable control. Selected tracked-file copying
initially omitted config/semantic-runtime.json and the build failed; that log is
retained as `main-control-build-missing-config.log`. Adding the unchanged config
allows a new build; runtime hashes are in `main-control-runtime.sha256`.
No test assertion, production reset logic, diagnostic timing or deadline was
relaxed to obtain the later results.

## Budget migration and new target cohort

The second slice migrates resident and aggregate pending thresholds together,
preserving exact identities, failed-copy poisoning, source/non-source boundaries,
pre/post replacement checks and failure monotonicity. Capture responsibility is
extracted into the existing source-witness helper; the oversized language-service
file remains2979 lines, not larger. New ledger is131 lines; witness is372.

New typecheck/build pass; final `pnpm check` also passes (`final-check.log`). The first combined target cohort passes **18/18**, exit0,
16.998s, zero fail/skip/cancel/todo (`candidate-targeted.log`):
- six exact-ledger/capsule units;
- four explicit manifest checks (307 files; unit124, bundle160);
- two complete large-closure cases;
- one real >4096-fact SDK capsule workflow;
- five public overflow/aggregate/lifecycle workflows.

The final expanded cohort passes **80/80** across 13 complete files, exit0,
105.506s, zero fail/skip/cancel/todo (`focused-final.log`). It includes the above
new tests, all five original characterization files, resolution-namespace-lifecycle,
package-json-presence-guard and request-directory-proof-reuse. All 865 then-frozen
source/test inputs match afterward. The two measurement files were added later
and have their own fresh 3-case measurement receipt.

Independent safety review found no new mandatory correction. Fresh counterfactuals
each fail their intended public assertion (one fail/four name-filter skips):
- early unprovable return: incorrectly succeeds after mixed source/capacity denial;
- untranslated capacity: returns -32603 instead of -32803;
- missing release: incorrectly exhausts admission after successful replacements.
`independent-*-counterfactual.log` retains each failure; the unchanged production
control is 5/5, zero skips, 5.605s (`independent-overflow-green.log`).

No historical full-suite count qualifies this reconstruction. Fresh `check:fast`
is **NOT_RUN**, not PASS: the original tracked grammar WASM remains absent and
the normal-checkout full gate is still required before merge. The toolchain also
lacks wasm32-wasip2. No publishing, PR, merge or release is authorized by these logs.

## Fresh budget measurement

`ARKTS_WITNESS_EVIDENCE_DIR=<new-directory> node --test --test-concurrency=1 scripts/measure-witness-budget.mjs`
passes **3/3**, exit0, 20.871s, zero skip/cancel/todo (`measurement.log`).
Each case has 23,787 generated physical sources, one Worker, no watchdog and
normal close. This probe imports 23,785 additional sources; it is distinct from
the frozen phase 1 6000-import functional fixture below. Exact observed maxima:

| Root padding | Facts | Path UTF-16 units | Identity UTF-16 units | Accounted bytes | Result twice |
| --- | ---: | ---: | ---: | ---: | --- |
| 0 | 23,542 | 1,318,233 | 5,784,911 | 20,233,040 | Exact Target |
| 192 | 23,545 | 5,838,348 | 14,832,360 | 47,368,936 | Exact Target |
| 384 | 21,218 | 9,333,839 | 21,503,823 | 67,107,132 | -32803 |

All retained totals stay below 67,108,864 bytes. Membership remains incomplete;
none claims full READY. The observer reads retained fact metadata only and does
not call getProgram, re-read compiler inputs or acquire authority. Its overhead
means these timings are not a product performance benchmark. This accounting
model is not physical V8/RSS, a process-global bound or native Windows validation.
Use a fresh evidence directory; the measurement utility does not enforce exclusive
creation of its report names.

## Same frozen input, new functional replay

The phase 1 worker rebuilt and froze a new physical fixture at
`/workspace/shared/closure-stage1-rebuild/wide-23787`. Its content digest happens
to match historical conversation records, but only the **new** baseline report
and this **new** replay certify current state. Input SHA256:
`8e252feee53eaff2bece62bccacbc3d2a9d9e270e866c83e225acc32a274006b`.

Private evidence driver `run-frozen-phase1.mjs` uses the candidate's LspSession,
server and sidecar, clears inherited ARKTS_* and NODE_OPTIONS, sets only the SDK,
new log/cache paths and explicit candidate sidecar, and reads the frozen fixture
without writing it. It reproduces initialize → preparation terminal → public
readiness prepare:false → two definitions → shutdown. Client waits are
10/190/190/195/5 seconds; product deadlines remain unchanged. No observer runs.

The new phase 1 off baseline returned -32803 twice. Candidate returns exactly
Target.ets (0,13)-(0,19) twice, oracle SHA256
`7adfcd415195fe2b0944021564be282f2b5f9d06ffdf1163e4e3df795eb2ac54`.
One Worker, zero watchdogs, exit0; input and server/worker/sidecar hashes match
before/after. Preparation and readiness remain degraded/membership-incomplete.
6002 project Program sources are measured in phase 1's trace, **not** claimed as
a new measurement from this uninstrumented candidate. Candidate definition times
3154.357ms and146.756ms are descriptive single observations, not a latency or
900s-stall cure claim. Full payloads, logs, hashes and closure are preserved in
`frozen-phase1-functional/report.json` and `frozen-functional.log`.

Phase 1 baseline and the independent main-control worker differ only in bundled
dependency-path labels after exact prefix normalization; the original bytes and
hashes remain unmodified (`baseline-bundle-path-comparison.json`). Rebuilt candidate
server/worker hashes also match the former candidate hashes quoted in conversation,
but this does not recover its lost receipts or certify its old full run.

At14:48 UTC, remote main still resolves to298d65f. GitHub reports only open PR115
and116; their changed-file lists do not claim ADR0045. Main ADRs stop at0042;
PR115 owns0043, phase1 reserves0044, this slice0045, phase3 coordinates separately.
`remote-numbering-check.json` preserves fresh read-only verification.

## Persistence checkpoint

The first incomplete checkpoint was generated at14:36 and requested for durable
preservation through the parent; no persistence success is assumed until confirmed.
`/workspace/shared/witness-budget-recovery-checkpoint-1436.tar.gz`, SHA256
`735b48d44d400f9cae5aa25c546313716127b5f18c75574faf2f4f3eacb3d1b8`.
It contains the then-current partial patch and new RED/characterization receipts,
with an explicit incomplete-state README. A local/shared path alone is not a
cross-restart backup. A final source/receipt package will need separate confirmation.
