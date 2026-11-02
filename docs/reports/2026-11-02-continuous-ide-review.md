# 2026-11-02 continuous IDE review

## Current scope and status

**Current: reviewed corrections ready for publication to the existing draft PR
and fresh complete CI. Instrumented full gate2294/2295 FAIL remains; rename
cause unknown and not fixed; paired diagnosis completed without reproduction.** The user has removed the earlier
four-round cap and authorized continued review/correction. This is a separate
continuation, not a relabeling of completed groups or an acceptance claim.
Published baseline:
`b129d3e04e71a6b5fd68293d9153f6264d309c7e`, tree
`9e64d4a45ec45a80b48d86dc1e8f4049b84180c3`.
[CI41372738816](https://github.com/liuhui-code/arkts-language-server/actions/runs/41372738816)
is now terminal SUCCESS for that published input (fast2269/2269 and
release/E2E/Windows checks). Its result does not qualify newer candidates. Prior reports, failed gates and ADR statuses remain.

## Current follow-on: c462 CI failure and integrated correction — 2026-11-02

Published `c462ddade68e4e1b398503c53a83de4e96d4c8c4`,
[CI41389230974](https://github.com/liuhui-code/arkts-language-server/actions/runs/41389230974):
Linux fast **2281/2284, FAIL**. Rust235 and Windows checks pass; subsequent
Linux gates were not reached. Earlier local42-file401/401 did not include
navigation-close-reopen: this coverage gap is retained, not rewritten as full
acceptance. All sections below this follow-on remain chronological historical
receipts unless explicitly updated.

Independent review separates two causes:

- **Production availability regression:** unchanged close/reopen navigation
  tests show no early catalog preparation when the existing compiler is not
  dirty. Ordinary late catch-up after the first capture changes revision/catalog;
  the newly unconditional guard wrongly rejects that legacy path. An optional
  per-command preparation object now records whether early reconciliation
  actually ran. Undefined preserves prior lazy catch-up; object presence applies
  the additional guard even when `changed:false`. `changed` only controls the
  absent-stamp check. Original source/SDK/namespace/cancellation/final authority
  fences, raw target and lease ordering remain. Reverting only this performed
  restriction restores both unchanged navigation failures:0pass/2fail/3 name
  skips. No timeout increase, retry, blanket scan or second compiler is added.
- **Fixture observation-order defect:** the old pre/source fixture assumed
  Filler0000 was enumerated before ZZModel. Forcing actual native Dirent objects
  into ZZ-first order reproduces its failure; production enumeration is not
  sorted. The corrected fixture mutates at the target's own native lstat before
  observation (success), with a new mutation after the actual stat observation
  requiring rejection. Existing SDK/late-byte/physical-retarget negatives remain.

Performed-but-unchanged trace independently records `{changed:false}` followed
by rejected late retarget. Two earlier changed-only-gate variants stayed GREEN;
these are retained non-discriminating attempts, **not mutation kills**. The final
case explicitly asserts readiness before proceeding. Final clean focused50/50,
then strengthened complete window file7/7, all without skips. Forced reverse
native order passes selected3 cases with4 name-filtered skips. These scopes are
not summed into a full-suite result.

Exactly three files are integrated: `src/semantic/interactive-workspace.ts`,
`tests/fixtures/readiness-catalog-scan-window.cjs`, and
`tests/semantic/readiness-catalog-input-windows.test.mjs`. Final artifact hashes
are pinned in `../iteration-evidence/ci-catalog-recovery/final-artifact/manifest.json`;
root-cause traces, counterfactuals and limitations are indexed in its parent
`README.md`. The artifact's earlier isolated/main-unchanged wording is historical;
root has integrated the reviewed files. No test-layer entries change (manifest300,
bundle156); two cases were added. Full local `pnpm check:fast` is now **FAILED2283/2286**, with3 failures and
zero skips/cancellations/todo,3561406.298545ms;953/953 frozen inputs match.
The original CI three failures pass in this run, but that is not overall GREEN.
Log `ci-catalog-recovery/joint-fast.log` is maintainer-retained local evidence,
not a repository-accessible link. Replacement publication is paused.

### Latest full local failure receipt — 2026-11-02

Three new failures remain under investigation; no cause is assigned:

- `tests/replay-settings-cancel-control-cli.test.mjs`, definitions at118/169
  (assertions121/174): actual exit1 / FAIL instead of expected NOT_CANCELLED.
  These cases use a fake server and do not execute the three-file correction.
  Cleanup removed the original generated report, so no causal conclusion is
  drawn from that missing artifact or from code-path separation alone.
- `tests/semantic/resident-session-edit-call-inputs.test.mjs`, definition203
  (assertion233): incoming-call package retarget returned `[]` instead of
  expected `-32803`. Paired baseline/candidate reproduction is pending; neither
  a production regression nor a fixture issue is declared yet.

The complete2283/2286 FAIL and earlier c462 CI2281/2284 FAIL remain separate
receipts. Original CI cases passing does not establish acceptance of this
candidate. No publication, timeout change, authority relaxation or speculative
fix follows from this result. Evidence paths in this follow-on are local files
retained by the maintainer, not downloadable repository links.

### Integrated follow-on corrections — 2026-11-02 07:12 UTC

The preceding investigation checkpoint is superseded by these scoped findings,
not by a full acceptance result. A new complete fast gate is still required.
Manifest is now301 entries (unit122, bundle156); no aggregate test-case total is
inferred from entry counts. Evidence below is maintainer-local, not repository links.

**Incoming-call discovery boundary (test-only):** original-test tracing shows
background diagnosis first discovered/rejected the changed package manifest,
then later diagnosis recovered current inputs before incomingCalls. Its `[]`
was the current graph, not a stale edge; the extra catalog guard was not entered.
The integrated two-line change awaits the existing First.ets v1 diagnostic
before retargeting. Original `-32803`/no-result assertion, query order, deadlines,
configuration-watcher recovery and latest cold-oracle `[]` remain. Corrected
complete files pass8/8 on current and unconditional-guard variants. The latter
is not a full b129 baseline. An extra didChange-v2 background-first analogue
reproduces `[]` on both, but is **not** the original command sequence; the
unmodified original trace is separate evidence. See
`incoming-retarget-recovery/README.md`.

**Sampler shutdown (cancel and mixed drivers):** a retained real reproduction
shows semantic work PASS but late SIGINT kills a sampler after flush and before
native exit, producing false FAIL under the strict exit0 gate. This does not
retroactively attribute the original failures whose reports were cleaned up.
Both drivers now share natural-exit cleanup with grace
`max(5000, min(interval, 2147482647) + 1000)` and cooperative SIGTERM fallback.
Exit evidence is never rewritten; this is not a guaranteed hard wall-clock
termination bound. Three other drivers are unchanged, with no proven incorrect
resource PASS from this race. Query budgets and timeouts are not inflated.

Final pinned Node20.19.5 five complete files pass42/42, zero fail/skip/cancel/todo,
84627.872001ms. Old SIGINT is RED; fixed5s grace is separately RED with actual
TERM5003.609486ms despite exit0. Preserve earlier Node24 40/42 and Node20 41/42:
the latter overstrong no-signal assertion lacked the actual kill timestamp and
is not retrospectively classified early/on-time. Corrected tests record cleanup
and signal times, require signal no earlier than6999ms for a6000ms interval
(one-millisecond timer tolerance), and retain exit0/PID/RSS checks. No runtime
causality is inferred merely from version differences.

Evidence: `mixed-sampler-shutdown/review.md` and `final-receipt.json`; all eight
final file hashes match. Real sampler/helper and existing mixed CLI parameter/
report tests ran; the actual100-edit mixed CLI did **not** run because the pinned
fixture was unavailable. Previous failure receipts, including2283/2286, remain;
focused42 is not complete fast or fresh CI success. No new ADR approval.

### Latest instrumented canonical full gate — 2026-11-02 08:28 UTC

Canonical `check:fast` under external evidence instrumentation terminates
**2294/2295 PASS, exit1**, zero skip/cancel/todo,4118031.704339ms. All986/986
frozen input hashes match. Prior confirmed failures pass in this run; the whole
result nevertheless remains FAIL. The sole failure is
`tests/semantic/rename-completeness.test.mjs:97`, explicit barrel alias: id2
rename exceeds its original5s response deadline. Cause is unknown. The completed current and
published b129 paired diagnosis used the same5s deadline; no regression, load,
infrastructure or fixture explanation is assigned yet.

Evidence capture preserved556 fixtures with zero copy errors and zero unexpected
preload observations. All6071 directly observed child launches omitted the
evidence preload; this is **not** exhaustive proof about grandchildren. The
external shim, bridge and test-parent hook are not repository changes. Production
and test deadlines are unchanged. This is explicitly an **instrumented** canonical
gate, not an uninstrumented/native receipt. Earlier2283/2286 and other failed
runs remain separate. No full acceptance or speculative timeout fix follows; publication readiness
is recorded in the subsequent checkpoint.

### Publication-ready checkpoint after paired diagnosis — 2026-11-02

Node20 paired diagnosis is complete: b129 and current each pass three selected
runs (each1PASS/5 name-filtered skips), then each passes the original complete
rename file6/6 with zero skips. Original assertions and5s deadline are unchanged.
One baseline response takes4961.657ms, close to its deadline; that observation
establishes neither load causality nor a fix. `logging.degraded` ENOENT also
occurs in successful runs on both sides, without establishing a necessary cause
of the original timeout. No missing original transcript is reconstructed.

Maintainer-retained evidence: `final-followon-gate/rename-paired/RESULT.md`,
results, protocol-summary and input-hashes; original limitations in
`rename-timeout-diagnosis/FINDINGS.md`. Source comparison has no current/main
mismatch before or after replays. Both sides rebuilt on Node20.19.5; four current
bundles match main only after normalizing dependency module-label relative
prefixes, not byte-for-byte. Native baseline SHA256 is
`eebaa0c66ec5c685f71bf04c9c2bd95c9f03e7829c8d1cf3a54fad02b77e2015`;
current is `48d050f610fa91c233f6635036973721643c34a175d3f47fe2aed0ee6dbe71e0`.
Original hashes are retained. These controls are scoped diagnosis, not additional
full-suite passes or performance benchmarks.

Reviewed corrections are ready to publish on the same draft PR for fresh
complete CI. No additional confirmed must-fix emerged from this review; the
rename timeout remains an unexplained/non-reproduced observation, **not fixed**.
The instrumented2294/2295 FAIL, earlier2283/2286 FAIL and c462 CI2281/2284 FAIL
remain. Counts from complete and selected runs are not added together. Published
b129 remains the last complete green revision. This is publication readiness,
not CI acceptance, continuous-review completion, merge or approval.

## Historical implementation and validation receipts

## A. Missing active legacy database — confirmed recovery-contract defect

Native isolated transcript: initialize, incremental refresh to generation1,
clean shutdown, retain control but move the active legacy database aside, then
reopen. Existing code recreates an empty database and reports generation0;
search returns empty **STALE**, not READY. This is a recovery-policy discrepancy,
not a demonstrated incorrect complete semantic answer or spontaneous cache loss.

[ADR0034](../adr/0034-private-catalog-publication.md) allows the legacy filename as
an import starting point but requires missing published databases to fail closed.
The filename-based missing-file exemption plus CREATE open conflates fresh
bootstrap with an established publication. Control generation0 is insufficient
to establish freshness because ordinary incremental commits occur in the active
DB. No change to every apply_batch control write or globally immutable DB policy
is needed or proposed.

The final reviewed candidate is **integrated into main checkout at02:05UTC**:
four source files and two new tests, exact candidate-manifest hashes matched.
No main dist/target rebuild occurred at integration. Joint gates and fresh CI
remain pending, separate from published b129's running CI.

The implementation allows absent-control bootstrap/legacy import, but opens
existing control and published DBs without CREATE; an existing missing schema,
row or empty DB is rejected before initialization. Independent strengthened
probes showed malformed control could otherwise roll namedgen2 back to surviving
legacygen1 while namedgen2 remained intact. Those stale results were not falsely
READY. Truncated-control and missing-row rollback cases now reject;12 concurrent
fresh initialize/shutdown probes pass. Incremental transaction semantics and
controlgeneration0 remain legitimate; no per-apply_batch control writes or global
immutability policy was introduced.

Evidence progression is preserved in
`../iteration-evidence/native-index-publication-fix/IMPLEMENTATION.txt`:

- Baseline public4/7 PASS,3 FAIL→minimal7/7 PASS, not final acceptance.
- An initial bootstrap connection drop/reopen caused the existing WAL-only
  identity regression; that failed run is retained. Passing the bootstrap
  connection through open restores original last-connection-close behavior.
- Stronger malformed-control RED7PASS/2FAIL→9PASS; independent rollback and
  concurrent bootstrap controls are retained separately.
- Final isolated Rust workspace234PASS/0FAIL/**1 existing ignored external455
  fixture**, exit0. Strict Clippy/release build pass; new release NDJSON missing-DB
  fail-closed and explicit cache-clear recovery pass. All98/98 inputs match.
- `final-validation.json` pins release SHA256
  `48d050f610fa91c233f6635036973721643c34a175d3f47fe2aed0ee6dbe71e0`.
  The ignored external fixture was unavailable locally, not downloaded or passed.

Initial audit evidence remains in
`../iteration-evidence/native-index-publication-review/REVIEW.txt` and
`missing-legacy-transcript.json`; its copied pre-existing binary is not relabeled
as the final release. Mapping: R-07/R-08/R-34, ADR0034 storage contract with
ADR0005 index proof and ADR0013 evidence discipline. Dated corrective receipts
do not change ADR approval status or certify Windows/UI/power-loss/disk-full.

## B. Owner/revision churn — implemented/integrated, joint verification pending

The selected implementation is now integrated:15 resource files plus two manifest
files, with seven new entries and the published index regression retained.
Manifest299: unit121, bundle155, protocol15. **No new all-source proof capsule or
proof-handoff API was implemented.** The actual sequence performs a dirty/eligible
catalog prescan **before the first raw query capture**, retains a cached immutable
canonical-root/catalog stamp and checks that stamp after readiness refresh but
before compiler update. Original source views, disk text and query-target scope
remain; absent cache follows the original path.

Independent32/32 and updated ordering4 plus SDK19 (23 total) pass. Controlled
healthy owner counts improve4→2; two catalog scans remain an explicit cost, and
there is no general speedup or memory claim. A fresh static cross-layer review
of source/leases/protocol/manifest found no new confirmed must-fix, but did not
execute independent whole validation. Current-profile two-probe controls fail
baseline prewarm, so that comparison is **INCONCLUSIVE**, neither a new confirmed
product defect nor a passed optimization comparison.

The following rejected/unfinished probe descriptions are historical exploration,
not the integrated mechanism or its current adoption status.

### Historical design gates and rejected alternatives

The prior failed fresh-view/reordering candidates remain rejected. New isolated
guarded metadata-first probes pass25/25 and healthy3/3, but first-capture proof
stamping, target synchronization and cohesive coverage of all paths remain
unfinished. Independent dataflow review found omissions; no API/production
adoption or complete optimization is asserted.

A metadata-prescan candidate wrongly succeeds after same-byte physical retarget,
where baseline rejects3/3; it is rejected. A joint catalog guard addresses one
case but does not prove general input ownership through the refresh window.
Positive healthy/context counters remain scoped observations, not latency or
memory improvement claims. At this earlier probe checkpoint there was no main integration. The integrated
mechanism above supersedes that implementation status, not these failed results.

Evidence remains under `../iteration-evidence/batch3-resource-review/`, including
its design-gate and probe records. Mapping: R-20/R-22/R-26/R-30/R-31,
ADR0019/0035, constrained by ADR0025/0036/0038 and original final input fences.

## Risk and review-coverage matrix

| Area | Current evidence / boundary | Next qualification |
| --- | --- | --- |
| LSP snapshot/overlay publication | Recently public tested, same-version reopen/member-set and cancellation guards | Preserve regressions on each combined candidate; not global correctness proof |
| SDK/source proof ownership | Recently real-Worker/compiler tests plus explicit configuration recovery | Retain late-mutation/source-repair controls; new refresh design needs original-input proof |
| Index protocol lifecycle | Published b129 correction, scoped123/123 and independent26/26 | Exact-head CI currently running; no inherited complete pass from a11 |
| Rust publication/recovery | Missing-active/control recovery correction integrated; Rust234PASS/1ignored, release/Clippy/independent probes pass | Joint gate and exact new-head CI pending |
| Owner churn | Controlled4→2, independent32/32 plus ordering/SDK23 PASS; rejected alternatives retained | Guarded first-capture/stamp mechanism integrated; joint/fresh CI pending |
| Real editor UI | Not verified by framed stdio or smoke | Explicit UI validation needed; no invented UI defect |
| Native Windows UNC/network share | Algorithm tests and Windows smoke are not network-share filesystem proof | Native share coverage remains unverified, not a claimed defect |
| Complete30K references/rename | Historical limitations retained | No new complete-scale acceptance |
| Long endurance / total memory | No new qualification from small probes | Long-run lifecycle/resource evidence remains open |

## Integration and reporting rules

Continue the joint and fresh-CI validation loops; do not declare completion
while their outcomes remain pending. Preserve each original RED/rejected design, distinguish
isolated candidate, integrated source and exact-head CI, and avoid equating
successful subsets with complete gates. No merge or new Accepted ADR is implied.
ADR0007's500ms experience policy, ADR0029'snull default RSS budget, semantic
completeness, cancellation and fault recovery remain unchanged.

## Historical joint-gate start — 02:35 UTC (terminal receipt below)

The joint gate validates the frozen combined candidate: Rust formatting,
workspace tests, strict Clippy, release build, Node20check/build and41 complete
Node files. Evidence: `../iteration-evidence/continuous-integration/joint.log`;
1415 code/test/configuration inputs are frozen. No source/build edits during the
gate. Native234 isolated PASS and resource subsets are not its terminal outcome.
Fresh CI on the forthcoming combined head remains pending. ADR approval states,
500ms experience and null-default-RSS policies remain unchanged.

## 2026-11-02 published b129 CI terminal SUCCESS

[Run41372738816](https://github.com/liuhui-code/arkts-language-server/actions/runs/41372738816)
completed SUCCESS for exact head `b129d3e04e71a6b5fd68293d9153f6264d309c7e`:
fast2269/2269, artifact E2E7/7, large E2E1/1, Rust224 plus one explicitly
executed initially ignored fixture, query2/2/four SCM validations, WASM release
and Windows install/reinstall/LSP smoke PASS. This qualifies that published
index correction, not the newer native/resource candidates. Original earlier
FAIL receipts remain; no real UI/native network-share/endurance claim follows.

## Joint gate terminal FAIL — 2026-11-02 03:03 UTC checkpoint

Root verified exit1 at `node_focused`: **399/401 PASS, two timeouts**, zero
skips/cancellations/todo,890904.056ms. Rust workspace234PASS/0FAIL/1existing
ignored external fixture, Rust formatting/strictClippy/release, Node20typecheck
and build all PASS. All1415 frozen source inputs match. Raw evidence:
`../iteration-evidence/continuous-integration/joint.log`, `joint-exit.json`,
`frozen-inputs-verified.log`. Overall joint result is FAIL, not a sum of green
stages or independent review success.

1. `failed-build-recovery.test.mjs`, repeated fatal exits: response4 times out
   at the original5s during third-restart readiness. Parent recovery.complete
   does not establish Worker initialize ACK; no child logs resolve the cause yet.
2. `references-batching.test.mjs`, indexed declaration-anchor case: the first
   CONSERVATIVE run times out on response4 at the original30s. Observed verifier
   transcript records nine-batch work, batch3 getProgram around13s and batch4
   start. This is progress evidence, not attribution of the timeout to a defect,
   load or the candidate.

Serial isolated baselineb129/current three-pair replays are underway with original
timeouts and preserved fixture-cleanup logs. No root cause, fix, regression or
infrastructure explanation is assumed before those results. Main source edits
are paused while attribution is unknown. Native/resource logic reviews and
isolated passes remain scoped; neither is final integrated acceptance. User
was informed at03:03:10UTC. Fresh combined-head CI has not established success.

## Same-input diagnostic rerun terminal FAIL — 2026-11-02

The same41-file diagnostic rerun terminates exit1: **400/401 PASS**, zero
skips/cancellations/todo,681291.856ms; observer exit0. All1415 source inputs and
all captured dist/native-runtime hashes still match. Evidence under
`../iteration-evidence/continuous-integration/`: `node-rerun.log`,
`node-rerun-exit.json`, `post-rerun-inputs-verified.log`,
`rerun-runtime-verified.log`. This is a second failed run, not a replacement GREEN.

The original two timeout cases pass in this rerun. Isolated baseline/current
three-pair replays also pass12/12 and the two complete files pass34/34 on each
side. `../iteration-evidence/continuous-recovery-timeout/RESULT.md` preserves that
comparison. The original timeouts remain **unexplained/non-reproduced, not fixed**;
none of these later passes assigns a cause or changes the original deadlines.

The rerun's sole new failure is the project-semantic-units case in
`references-batching.test.mjs`: expected one scoped request, observed two.
Static inspection found a scripted sidecar generation commit20ms after catalog
start; production freshness can accept a generation newer than the dirty
baseline. The count alone therefore does not establish use of an old generation
or a faulty test. Baseline/current actual-generation observation and deterministic
hold/release diagnosis are underway before choosing any correction. No new main
source edits or root-cause claim at this checkpoint. Published b129 CI remains
an independent historical PASS; combined candidate acceptance is still open.

## Semantic-unit fixture correction — 2026-11-02 04:04 UTC checkpoint

**Test-only defect confirmed; six-file correction remains isolated, not integrated.**
Natural baseline/current runs pass three times each. A deterministic control
committing legitimate generation2 before the query reproduces the old `2 != 1`
assertion on both revisions. Accepted generations advance1→2; recovery records
baseline1/committed2; admitted roots narrow to entry/shared. Counting requests
alone incorrectly equated a fresh generation with stale-generation reuse. The
original failed run's temporary fixture was lost: its actual generation trace
has **not** been reconstructed, and no production stale-result defect is claimed.

The isolated test holds replacement generations greater than1 explicitly. While
held, it preserves the original scoped count1, workspace-changed fallback, zero
recovery events and full results. Release permits generation2 and checks new
roots plus identical complete results. Root review removed an initial pre-query
activation barrier: watched notification is still followed by the immediate
repeated query; activation is awaited only after that response. This preserves
the original invalidation-ordering coverage. Original timeouts and production
code are unchanged; no speculative fix is made for the two unexplained timeouts.

Strengthened baseline/current repetitions pass6/6; six complete neighboring
files pass21/21 without skips. Final exact-order independent review is pending,
so these are isolated receipts, not final acceptance. The proposed manifest is
300 entries/bundle156 (unit121/protocol15 unchanged), **not yet the integrated
manifest299**. Cohesive extraction reduces the original references file1149→995
lines; new case207 lines and fixture495. Remaining oversized debt is retained.
Evidence: `../iteration-evidence/continuous-recovery-timeout/UNITS-RESULT.md`,
`units-fix-artifact/manifest.json`, `units-immediate-results.txt` and
`runs/candidate-units-immediate-neighbor-files/test.log`. The original joint
399/401 FAIL and diagnostic400/401 FAIL remain separate failed receipts.

## Reviewed fixture integrated — 2026-11-02 04:11 UTC

The six-file correction is now integrated with all artifact hashes matching.
Final independent review approved the exact watched notification→immediate query
sequence; the activating wait occurs only after the repeated response. Manifest
is now300 entries/bundle156, with the extracted207-line test and original
references file1149→995. The preceding isolated/pending statements are historical
checkpoints, not current integration status.

The final local gate runs `pnpm check` plus42 complete Node test files (the
previous41 plus the extracted case), against1416 frozen inputs. Evidence is
`../iteration-evidence/continuous-integration/final-node.log`. It is **RUNNING**,
not accepted or green. No production changes occurred since the original joint
Rust234/Clippy/release/Node20check/build passes. Both original failed Node runs
and their source/runtime receipts remain retained. No deadlines were inflated;
no actual generation is inferred for the lost original fixture. Fresh complete
CI for this candidate awaits publication.

## Current local verification terminal — 2026-11-02 04:27 UTC

The final local gate has verified exit0 and `pnpm check` exit0: **42 complete Node
files,401/401 PASS**, zero fail/skip/cancel/todo,698669.119535ms. All1416/1416
frozen source inputs and all production dist/native-runtime hashes match.
`continuous-integration/final-node-exit.json`, `final-node.log`,
`final-node-files.json`, `final-inputs-verified.log` and
`final-runtime-verified.log` preserve the command scope and receipts outside the
repository. Manifest300/bundle156 includes the extracted semantic-unit case.

Rust workspace234PASS/0FAIL/1 original ignored external455 fixture, formatting,
strict Clippy, release and Node20 build already passed on the **same production
input**. Only the six-file test correction followed the failed joint gate.
The external fixture remains locally ignored, not passed; CI must run it
explicitly. All confirmed code/test defects in this candidate are corrected;
independent review found no additional confirmed must-fix within its scope.

This is local scoped acceptance, **not a fresh complete CI pass** or completion
of the user's continuous-review request. Published b129 CI qualifies only b129.
Original joint399/401 FAIL and rerun400/401 FAIL remain. Their two historical
timeouts are unexplained/non-reproduced observations, not fixed defects. The
lost original semantic-unit fixture's generation was not recovered; causal
baseline/current controls established the old assertion rejects a legitimate
new generation. Real UI, native Windows network-share/UNC, complete30K semantic
operations and endurance remain unqualified. No ADR approval/status changes,
merge or general latency/memory improvement is claimed.
