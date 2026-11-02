# 2026-11-01 recursive IDE review — group 2

## Scope and current status

**Group 2 four-round implementation/review complete. Final local scoped gate
376/376 PASS; published a11 complete CI now PASS (fast2267/2267); original
full2260/2264 FAIL retained. See the 2026-11-02 terminal receipt below.** The user's 17:07:30 UTC instruction authorizes a second
group of at most four review/research/correct/review rounds after group 1 reaches
its PR-validation terminal outcome; a completed review with no new confirmed
issue may stop earlier. This is not round 5 of group 1. No merge is authorized.

Parent: `f280c9bb85513b10b5149c6a7b398af75f72f597`. Group 1's
[CI run 41335246739](https://github.com/liuhui-code/arkts-language-server/actions/runs/41335246739)
terminated with Linux fast **2233/2234 PASS, one FAIL** and Windows smoke PASS.
The sole Linux failure was `changed-source-read-witness.test.mjs`, mutation
`sdk-config`: expected -32803 but received a completion containing markerNew.
All confirmed source-reset, replacement-load, namespace-retirement and source-
repair corrections are integrated. The final state is Node20 check/build and
29-file376/376 PASS, with1400/1400 inputs matching; manifest291 (unit119,
protocol15, bundle149). The initialization timeout remains unexplained and
non-reproduced. Published a11 CI has now passed; the dated terminal receipt below supersedes
earlier pending-CI checkpoints. Group 1's original
local 2134/2222 FAIL and subsequent focused 263/263 PASS remain separate evidence
in its [report](2026-11-01-recursive-ide-review.md).

Official checksum-verified Node 20.19.5 is now installed in an isolated location
for subsequent gates. This does not retroactively turn prior Node24 tests into
Node20 qualification; every next receipt must identify its actual runtime.

## Historical round-by-round checkpoints — 2026-11-01

The sections below preserve the state and receipts at each dated checkpoint.
Intermediate pending/unintegrated conditions are historical, not current blockers.
The opening summary and final terminal-validation section state current status;
no failed or intermediate run is relabeled as passing.

## Round 1 — confirmed workspace-symbol publication defect

R-13/R-31 overlay authority and R-34 verification; existing
[ADR0010](../adr/0010-incremental-invalidation-and-overlays.md) requires captured
overlay invalidation or recomputation, not mixed-version publication. ADR0009's
broader generation proposal remains Proposed and is not adopted by this fix.

Workspace symbol searches captured open overlays before persisted-index awaits,
but checked only each provider's client version when it returned. Final combined
publication checked neither exact snapshot identity nor overlay membership.
Public framed-stdio cases confirm stale success after same-version close/reopen,
edit/close during a pending overlay result, an early-resolved overlay changing
while another is pending, and opening an overlay while persisted search is pending.

The minimal correction checks complete overlay membership and exact captured
DocumentSnapshot identity after all awaits. The whole obsolete search fails with
ContentModified (-32801); existing cancellation wins with -32800. Generic service
errors retain -32603. No retries, second semantic owner, catalog storage/ranking,
budget or full-scan optimization is introduced.

### Evidence and limits

Local evidence directory: `../iteration-evidence/batch2-index-review/`, outside
the repository, not a published artifact link. Its `README.md` records:

- Exact frozen parent plus final public tests: `final-baseline-red.log`, exit 1;
  nine cases, four pass/five fail, no skips/cancellations/todo.
- Candidate: `final-focused-green.log`, exit 0; 30/30 including nine new public
  cases, existing workspace-symbol LSP/service tests and manifest coverage.
- The real production server/service runs in a child process with framed stdio;
  scripted semantic/index adapters and file gates control timing and facts.
  This is not real-compiler, installed-SDK or editor UI certification.
- Initial baseline archive setup lacked a config file; `frozen-setup-failed.log`
  is setup failure, not a defect RED. Same-revision config restored the real RED.
- Intermediate unclassified experiment/stale manifest-count failures are retained
  as test integration issues. At this round-1 checkpoint the manifest was290,
  protocol15; the final manifest is291.
- Typecheck passed before final test-only additions; combined checks were pending
  at this checkpoint. Final typecheck/build and376-test scoped PASS are recorded
  below; no full-suite PASS is claimed.

## Round 1 SDK witness slice — focused PASS, not overall completion

R-13/R-31, completion R-26; ADR0025 M004/M005, ADR0036's load-owned configuration
boundary and ADR0038's witnessed SDK inputs. Evidence is in
`../iteration-evidence/batch2-round1-sdk-witness/README.md` and its named logs.
Normal isolated Node24 and Node20 replays passed but did not negate the CI failure.
A timed observational replay showed configuration-unproven followed by source
content-revision resets that disposed the original SDK load witness.

A deterministic real-Worker filesystem hook mutates source and optionally SDK
bytes at an actual diagnostic dependency-closure stat, returning the genuine
native stat. Both exact baseline b57ad075 and f280c9bb reproduce the SDK RED;
the healthy source-only control passes. Original six tests, 403-source scale,
timeouts and resource policy remain. Tests prove actual PID/thread/call-stack
entry and require repeated -32803 until explicit configuration recovery.

Before a content-revision reset disposes a retained owner, the candidate checks
its load-owned non-source configuration facts. SDK/config/unknown failures remain
rejecting; healthy source changes and explicit configuration recovery remain
supported. An intermediate old-resolver-epoch guard incorrectly failed deletion
controls (eight failures retained); corrected pre-extraction characterization
passed 28/28. Post-extraction six complete files pass **51/51**, zero failures/
skips/cancellations/todo, exit 0, on **Node20.19.5**. Typecheck and runtime build
also pass (`post-extraction-expanded.log`, `post-extraction-exit.json`). This is a
passed first slice, not full SDK correctness or aggregate graduation.

## Historical round 2 checkpoint — source-deletion bypass and correction

Independent review changed SDK metadata then sent a watched source deletion.
That path reset through `document-store-reset` / `reset-epoch-change`, bypassing
the first slice's content-only guard and returning successful empty completion
instead of -32803. `review-sdk-deletion.log` preserves the public RED. The integrated candidate now covers source-driven reset reasons; frozen cohort
verification subsequently passes 88/88, as recorded below.
Do not rewrite round 1's 51/51 receipt as coverage of this counterexample.

### Explicit configuration authority propagation — scoped PASS

`rootDirty` conflated watched project configuration with bounded source-event
overflow; its early dirty return could also drop a later genuine configuration
event. A per-root drain-scoped optional `configurationChanged` boolean now records
only recognized configuration events. Source/resource overflow grants no such
authority, configuration after overflow survives, and later drains cannot inherit
it. Existing direct didChangeConfiguration reload remains separate.

The field crosses contract/proxy/supervisor/coalescing/strict wire/runtime paths.
Absent means false, true requires rootDirty, explicit false still counts toward
wire byte limits; strict keys/record/array/message bounds remain. This is event
authority plumbing, not permission to requalify unknown SDK input by rootDirty.

Evidence: `../iteration-evidence/batch2-round2-config-authority/README.md` and
`final-source-receipt.json` pin 15 files. RED3/8 (five failures) preceded final
Node20 typecheck and six-file **97/97 PASS**, no skips/cancellations/todo. Independent
review passes the new 12/12. Intermediate59/59 predates tightened false-byte
accounting and is not the final receipt. Manifest291 (unit119/protocol15).
Cohesive codec/coalescing/fixture extractions reduce existing oversized files:
worker protocol1888→1798, supervisor716→682, old coordinator test1120→1104;
remaining over-limit migration debt is explicit, new files remain bounded.

### Replacement-load and namespace-retirement windows — candidate integrated

Independent review also mutates SDK during replacement `loadCompilerSdk`, after
the pre-disposal check. A before-only guard cannot prove this late window safe.
The integrated correction carries a bounded old non-source-facts capsule across
retirement and checks it before retirement, after replacement construction and
after preparation. An additional source namespace-retirement bypass was publicly
RED, then corrected by capturing through the shared admission callback before
`reconcileResolutionOwner` retires its context.

The capsule contains frozen native identities/validity only, no old LS, Program,
resolver or context. Combined pending capacity is 4096 fact units (at least one
per capsule); exhaustion rejects rather than dropping denial evidence. Failure
retains denial through later requests until explicit configuration authority.
The five source-driven retirement paths and separate config/failure/dispose
paths are audited in `batch2-round1-sdk-witness/round2/retirement-authority.md`;
`main-source-receipt.json` freezes the integrated candidate. Actual configuration
can clear the matching capsule even if the failed owner is already absent.
Retire-first ownership, lease cleanup and the original final fences remain; no
new ADR is needed and no filesystem atomicity beyond actual checks is claimed.

Closing independent review reports no new must-fix in this scope: Node20 SDK
10/10 and configuration12/12 pass. The fixer's authoritative frozen cohort terminates **88/88 PASS** on Node20,
with typecheck/build PASS. This is scoped cohort evidence, not full aggregate
SDK/product qualification.
Earlier86/86 overlapped a dist rebuild and is explicitly non-authoritative.
Initial capsule setup/typecheck/stale-dist and later incorrect test-path failures
remain harness failures, not product REDs or successful frozen validation.

Workspace-symbol independent review separately passes the new nine and existing
21 tests on Node20.19.5, with no confirmed must-fix in that scope. It does not
certify the SDK/reset paths or close this round.

A separate observation records readiness refresh revision0→1 followed by an old
captured snapshot resetting completion1→0 and later diagnostics0→1. This churn is
not fixed by the first SDK guard and remains a separately assessed observation,
not a measured performance regression or a claimed completed optimization.

## Primary-source research and adaptation boundaries

[rust-analyzer Analysis](https://rust-lang.github.io/rust-analyzer/ide/struct.Analysis.html)
represents a point-in-time world view and cancels old analyses when host changes
advance that world. This supports explicit snapshot identity and invalidation;
we do not import its database/compiler design into ArkTS.

[clangd request handling](https://clangd.llvm.org/design/threads) orders each
file's reads with preceding writes and removes obsolete queued work. We borrow
input-order/lifecycle discipline, not its per-file threads or stale preamble
completion policy. Both references were read on 2026-11-01. Applying admission
and publication checks is our design inference, not proof of the SDK CI cause.

## Historical round 3 checkpoint — scoped review and validation handoff

Round 3 independent full-diff review completed with **no new confirmed must-fix
within the reviewed scope**: overlay publication, configuration transport, proof
capsules, failed-candidate cleanup and all source-retirement paths. Independent
Node20 public/protocol tests pass21/21, no skips; evidence is
`../iteration-evidence/batch2-round3-review/README.md` and
`public-and-protocol.log`.

This reaches the user's no-new-confirmed-issue early-stop condition at round 3;
there is no artificial fourth feature/review round. Implementation/review is
closed, **not the overall task**: full aggregate/CI validation still must reach
terminal outcomes, and newly confirmed gate failures remain actionable during
final validation.
Final combined `pnpm check:fast` started at 19:34 UTC on Node20 and is RUNNING,
not passed. Log: `../iteration-evidence/batch2-integration/check-fast.log`;
`frozen-inputs.sha256` seals 1399 code/test/configuration inputs, excluding docs.
No source/test/build inputs change during this validation. Correct final line
counts are TypeScriptLanguageServiceEngine2985→2979 and legacy engine728→706;
remaining over-limit migration debt is not erased by these cohesive reductions. Re-review failure boundaries,
then validate final combined inputs before claiming completion. Source inspection
also suggests catalog full-scan/parsing optimization opportunities, but no bounded
correctness reproduction or measured performance gain justifies a speculative
rewrite here. Current 500ms experience policy (ADR0007), null default RSS budget
(ADR0029), ownership/fault recovery, full scope and historical failures remain.

## Historical validation checkpoint — 19:39 UTC, investigation then open

The frozen complete gate is still RUNNING and has recorded at least one failure:
`tests/lsp-call-hierarchy-publication.test.mjs`, reopen case, expected marker
content `true` but observed an empty string. This is an observed assertion
failure, not yet a confirmed cause or terminal aggregate summary. A fixture
readiness/write-completion race is a hypothesis being tested in isolation; do
not label it a product or harness defect without causal evidence.

The main checkout's frozen code/test/build inputs remain unchanged while the
original gate runs. Round 3's no-new-must-fix finding remains scoped to the diff
reviewed then, not proof that the gate must pass. If this failure confirms a
correctable issue, reopen the final corrective pass as round 4 within group 2,
preserving the original failure and requiring fresh integrated validation.

## Historical round 4 checkpoint — marker fix awaiting integration at 19:43 UTC

The 19:39 hypothesis is now confirmed: asynchronous writing exposes the created
`entered` file before its `true` bytes finish, while the parent waits only for
fs.access. Both f280c9bb and the current candidate reproduce the exact empty-string
assertion under a controlled native 200ms open-before-write interval. This is a
fixture readiness race, not a new production call-hierarchy freshness defect.

The isolated correction writes `entered.pending` completely, then renames it to
`entered`. A permanent preload exercises the original four public cases; their
production semantics, assertions and timeouts remain unchanged. Reverting only
the atomic marker change gives 0/4 RED. Candidate Node20 typecheck/build and five
complete test files pass89/89, exit0. These scoped results do not qualify the
still-running main aggregate, whose frozen inputs have not changed.

Local receipts under `../iteration-evidence/batch2-round4-hierarchy/` preserve
`baseline-marker-red.log`, `candidate-marker-red.log`,
`permanent-baseline-red.log`, `permanent-candidate-revert-red.log`,
`final-focused-green.log`, `final-focused-exit.json` and `patch-receipt.json`.
Setup missing-path/config/symlink failures remain separate from product REDs.
The not-yet-integrated `atomic-marker.patch` SHA256 is
`ab488542fa5e6c5c77516a2b41fd0e069a30631a3cba93896a863fe2a617fa0e`.
Independent closing review passes the four public cases (4/4). Original full gate remains RUNNING with
an observed failure; no terminal full result or integrated correction is claimed.

This correction maps to R-02 evidence determinism / R-28 call-hierarchy regression
coverage / R-34 qualification, under ADR0013 without changing ADR0037's production
contract. Group 2 has now reached its four-round limit; close this correction's
review and validation rather than starting another implementation review round.

### Historical round 4 checkpoint — constructor fixture at 19:54–19:56 UTC

The full gate recorded another failure: the late-construction-failure test
expected a response error but received success. An isolated repetition (the fifth attempt) shows
the intended hook was not reached: markerNew succeeds while SDK remains API24,
late-sdk-read is false and constructionfailed is false. The watcher can precede
background bookkeeping, permitting legitimate in-place source update rather than
replacement construction. This confirms a fixture precondition gap, not a product
SDK-denial bypass in that observed execution.

An isolated test correction makes late variants perform an actual watched removal
of an existing filler, requiring source replacement before the constructor hook.
Original error, native-witness, repeated-denial and recovery assertions remain;
true/false diagnostic variants are unchanged. A healthy replacement control and
accurate late-case names are added. Candidate and counterfactual checks have completed as recorded below; no patch
integration is asserted. Evidence is retained
under `../iteration-evidence/batch2-round4-sdk-constructor/`.

This is the second final-validation fixture correction within round 4, **not a
fifth round**. Main frozen inputs remain unchanged until the original full gate
reaches its terminal outcome. The hierarchy atomic-marker patch now has separate
independent4/4 PASS, but neither isolated result establishes a full-gate pass.

#### Final isolated constructor-fixture receipts

Candidate full file passes17/17. Twenty late-pair repeats pass40/40, with all
Node exits0; the surrounding shell wrapper exited1 only because its final guard
was false, not because a Node test failed. The round 1 counterfactual retains
healthy1 PASS / late2 FAIL / 14 name-filtered skips. Independent closing review
passes3/3 selected cases with14 name-filtered skips; these skips are explicitly
scoped selection, not a whole-file count. Its 256 source hashes match frozen main
and the main test remains unchanged.

Final isolated `finaltest.mjs` SHA256:
`bb1fbd585fec11fa545b65afda001dc4dbaa4c5400d1e1ec508c6ecee2f63a9a`.
Both round 4 fixture corrections now have closing review with no new confirmed
must-fix. Neither is integrated while the original full gate remains RUNNING with
two observed failures. No terminal full count, full PASS or further review round
is claimed; integration and final validation still remain.

## Historical full-gate checkpoint — 20:24 UTC, four observed failures

The original frozen full gate remains RUNNING. It now has four observed failures,
not a terminal count: the two documented fixture cases plus
`references-batch-search-coverage.test.mjs` (line266, unprovable loaded lookup /
diagnostic recovery timeout) and `references-batching.test.mjs` (line13,
initialize response1 timeout before query execution).

Static triage is retained in
`../iteration-evidence/batch2-round4-reference-timeouts/STATIC-TRIAGE.md`.
A possible source-proof recovery interaction in the first case is only a
hypothesis; the initialization timeout cause is unknown. Neither is attributed
to the candidate or dismissed as environmental without replay evidence.
No source changes or diagnostic reruns occur while the full gate is active.
The two isolated fixture corrections remain unapplied; no new review round or
full-pass claim is made. Further diagnosis awaits the terminal frozen receipt.

## Original full-gate terminal receipt — 20:35 UTC

The Node20 frozen full run has terminated **exit1: 2264 tests, 2260 pass, four
fail, zero skips/cancellations/todo**, 3533772.229ms. All1399 frozen inputs matched
before any integration changes. Raw evidence is
`../iteration-evidence/batch2-integration/check-fast.log`, `check-fast-exit.json`
and `frozen-inputs-verified.log`. This is a full FAIL, not replaced by the scoped
passing receipts above or a sum of separate tests.

After that terminal receipt, the verified three-file hierarchy atomic-marker
patch and final 17-case SDK constructor fixture were integrated at20:35UTC;
diff whitespace checks pass. Their earlier “unintegrated” statements are dated
checkpoints, superseded by this integration receipt. No other production change
is implied. The two remaining reference diagnostic-recovery / initialization
failures are now being replayed in isolation; their causes remain unconfirmed.
No fresh integrated full PASS or completed qualification is claimed. Corrections
and validation remain within the fourth and final group-2 pass, not a new round.

## Round 4 closing source-recovery regression — integrated at 20:45 UTC

The diagnostic-recovery failure is now causally reproduced: the original public
coverage case passes f280c9bb but fails against the round 1 guard and subsequent
candidate. A dangling compiler-loaded source symlink leaves identity-unavailable
proof. After real source repair and watched source events, the guard conflated
invalid old resident proof with invalid non-source configuration and blocked
healthy replacement diagnostics. This **is a source-guard regression**, not a
fixture issue or generic timeout; earlier tentative classifications are superseded.

The narrow correction in `loaded-configuration-witness.ts` distinguishes source-
reset-only failure from namespace-only failure. Compiler-owned source identity-
unavailable, loaded-identity-changed and changed-during-load can be discarded only
for retire-first replacement, with lexical/physical workspace and SDK-exclusion
checks and current original non-source facts. Normal resident validity remains
false, unknown/config failures still reject, and no old LS is reused or SDK fact
restamped. Two public additions cover healthy repair and repair plus silent SDK
mutation: the latter repeatedly rejects until explicit configuration reload.

Evidence: `../iteration-evidence/batch2-round4-reference-timeouts/README.md` and
`main-integrated-receipt.json`. Node20 check/build pass; frozen five-file91/91,
zero failures/skips,328897.514266ms. Three serial selected batching repeats pass
(12 filtered skips each); independent source audit and selected3/3 pass with42
filtered skips. The two reviewed files are integrated: source witness379 lines,
SDK test297 lines/19 cases. Original full2260/2264 FAIL is retained unchanged.

The other original initialization timeout remains **unexplained and not
reproduced**. Passing isolated/full-file/serial replays do not establish a cause
or fix; no timeout was increased and no product correction is attributed to it.

## Final combined validation — terminal PASS, fresh complete CI pending

Node20.19.5 typecheck/build and29 complete test files terminated exit0:
**376/376 PASS**, zero failures/skips/cancellations/todo,577502.642ms.
All1400/1400 final inputs match. Evidence under
`../iteration-evidence/batch2-integration/`: `final-focused.log`,
`final-focused-exit.json`, `final-focused-files.txt`, `final-focused-inputs.json`,
`final-inputs.sha256` and `final-inputs-verified.log`.

This scoped pass does not replace the original2260/2264 full FAIL or prove a
fresh complete-suite pass. Both groups' implementation/review work is complete;
publication will update the same authorized draft PR112 from parent f280c9bb,
then fresh complete locked-toolchain CI remains required. No merge, fifth round,
UI/installed-SDK/network-share/endurance or performance graduation is claimed.
The original initialization timeout remains unexplained/non-reproduced despite
passing replays. Historical RUNNING/unintegrated checkpoints above are superseded
by the dated integration and terminal receipts, not erased.

Remaining touched handwritten over-limit debt was counted directly against HEAD:

| File | Before | After |
| --- | ---: | ---: |
| src/core/types/typescript-language-service.ts | 2985 | 2979 |
| src/semantic/legacy-semantic-engine.ts | 728 | 706 |
| src/semantic/semantic-worker-supervisor.ts | 716 | 682 |
| src/semantic/worker-protocol.ts | 1888 | 1798 |
| tests/workspace-file-change-coordinator.test.mjs | 1120 | 1104 |

Cohesive extractions reduce but do not erase this migration debt. No performance,
real installed-SDK/UI, native Windows or endurance graduation is inferred.

## 2026-11-02 01:24 UTC — published a11 CI terminal PASS

[Run41368012421](https://github.com/liuhui-code/arkts-language-server/actions/runs/41368012421)
completed SUCCESS for exact published head
`a11cdbc87b5223aae806f79d624b180df8f9d3c4`, base `b57ad075`, with validation
checkouts on merge commit `a175ae2314973689a22fb6b029ecb025b2759305`.
Complete fast2267/2267, artifact E2E7/7 and large E2E1/1 pass with zero
failures/skips/cancellations. Rust records224 passing tests plus one explicitly
executed initially ignored fixture (225 executions). Zed query tests2/2 and
four SCM query validations, WASM release, Windows install/reinstall and framed
LSP smoke pass. Raw local receipts:
`/workspace/shared/pr112-batch2-ci-evidence/validate.log` and `windows-install.log`.

This closes the published second-group CI gate, not a real editor UI/native
Windows network-share or general resource qualification. Earlier full2260/2264
and CI2233/2234 failures remain historical failures; the original startup timeout
is still unexplained/non-reproduced, not retroactively assigned a cause.
The separately authorized unpublished index follow-up has scoped123/123 PASS;
it requires fresh CI on its own future head and cannot inherit this full PASS.
