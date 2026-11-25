# Reference admission handoff and unchanged-source digest reuse

Implementation/regression in progress; no merge, deployment or UI/endurance claim.
Authoritative worktree `/private/tmp/arkts-syntax-owned-factory-20261119`, parent
`1e3886df3c4d27755a53c073462f1456b0a3de7e`. Evidence prefix:
`.bench/repeated-query-proof-plan-20261117/implementation-20261118/` in the primary
repository. Product defaults, deadlines, memory policies and original test waits
are unchanged. This is a slice of A-plan M4, not overall completion.

## Pure digest reuse

`typescript-resident-reference-state.ts` previously keyed source SHA memoization
by `SourceTextEvidence` wrapper. A real Main body edit followed by definition
reobserved unchanged noise sources: 128 wrappers replaced, no bytes changed and
same 64 actual SourceFile identities; the subsequent references rehashed all 64.
`source-digest-reuse-red02.log` is the actual failing cost oracle; red01 did not
cause reobservation and is calibration, not evidence of that defect.

The memo now keys the actual SourceFile weakly and compares exact admitted text.
All known-read/provenance, physical alias and strong-stamp guards precede lookup.
One entry per live SourceFile; no global string cache or retained Program. Public
framed-stdio regression observes zero unchanged noise rehashes, exact three result
ranges, and after a pre-request unopened-source disk change the exact five fresh
ranges and newly computed digest. A disk change before admission may safely be
refreshed; it is not the same case as mutation after computation begins.

Evidence: `source-digest-reuse-green03.log`, `source-digest-reuse-expanded01.log`
(36/36 PASS), typecheck02 and build02. Frozen Worker SHA
`0086f948fb3858655ab795aa8dc4047fae59ecdcce0d0bb7f9658cd8c7ad538e`.
Original explicit resident-off 20K five-second references still FAILED in
`source-digest-off20k-original01.log`; no overall latency gain is claimed for
this pure digest change. Earlier default20K 6261.62→4204.54ms median improvement
belongs to the previous preparation change, not this digest slice.

## Isolated reference entry handoff

`reference-entry-handoff-red01.log`: public resident=false fixture with 64 noise
files returned the exact expected references, but performed 256 noise lstats:
64 query +64 preparation-final +128 outside. Preparation had ended before the
executor's candidate identity admission, repeating one full leaf scan.

`runOwnerReferenceQuery` now prepares under the existing synchronous handoff.
`SemanticTypeEngineRegistry.prepareReferenceQuery` and
`ReferenceSearchExecutor.prepare` return deferred dispatch closures. Their
synchronous admission contributes original proof owners to the final union;
only successful final validation allows asynchronous work to start. Existing
`references`/`execute` callers retain immediate-dispatch wrappers. Explicit
pressure admission retains first-verifier and subsequent epoch/level semantics.

The Store can capture only its existing strong membership proof, without
refreshing it. `withProjectFileIdentities` binds that proof to its immutable
identity array through a weak Worker-local association. Matching original
catalog/root/revision is required. Strong proof current() uses the original
Native source+namespace authority; weak/custom ports retain per-leaf fallback.
After await it runs raw again; it does not reuse the earlier validity answer.
The existing capacity-failure predicate was extracted cohesively to avoid growing
the over-limit DocumentStore (still 1520 lines). Registry stays500 lines; executor
stays500. Remaining over-limit migration debt is not resolved by this slice.

Cost control now has 192 noise leaf checks:64 query +64 preparation-final +64
post-search. The latter is now counted under Native membership rather than the
old standalone leaf loop; therefore Native pass counter becomes3, while the
preparation query/final count stays2. The assertion was corrected to distinguish
these phases; total leaf bound192, post-search64 and final fences remain asserted.
This is 25% fewer observed noise leaf checks, not a 25% wall-time claim.

## New post-verifier counterexample and repair

`reference-entry-handoff-safety01.log`/`reference-dispatch-after-verifier-red01.log`
show a real isolated verifier completing, then an actual unopened source changing.
The executor returned incomplete/source-unavailable; the parent seed fallback
issued another verifier job and returned success for the same request. Although
the selected symbol's ranges happened to remain equal, that silently rebased a
post-computation request. It violates the already documented distinction between
admission miss and failed computation fence.

The post-search candidate identity failure now throws the existing typed
SemanticResultInvalidatedError, preserving cause. Pre-search complete fallback
is unchanged. `reference-dispatch-safety-capture01` retains both actual dispatches
and the disk mutation from the failure, with full framed transcript.

`reference-entry-handoff-safety02.log`:9/9 PASS. The private preload changes actual
fixture disk input at controlled boundaries, never substitutes compiler results:

- preparation-final after admission: -32803, zero verifier dispatches;
- after actual verifier completion: -32803, exactly one dispatch, no seeded retry;
- following request succeeds with three references in the same semantic Worker;
- resident/prepared SDK/source/created-member rejection and recovery remain GREEN.

`reference-dispatch-safety-capture02` retains full parsed wire payloads, server
logs and mutation/dispatch events via capture-readiness-evidence-v2. Build02 and
typecheck02 PASS. Current Worker SHA
`9d7ab60a6fa584124452f5367eb601b21624cfd7a647ec349e8619fdc37b1427`.
Expanded regression is running against1020 frozen source/test/script hashes;
its result must be recorded separately, not inferred from these nine tests.

## Remaining verification

Original resident-off20K five-second test, final full check:fast, same-condition
Photos first/hot/edit comparisons and scale axes remain required. Windows real UI,
formal endurance and SDKpartial full-reference/rename limits remain open. No
claim of constant-time disk freshness or total goal completion. The previous
full-check failures remain historical evidence, not waived or renamed successes.

## Expanded regression discovery: prepared-context admission boundary

`reference-entry-handoff-expanded01.log` is90PASS/3FAIL/0skip out of93, not green.
The SDK-selection, automatic-type metadata and observed-absent-directory cases
failed.1020 frozen source/test/script hashes remained unchanged during the run.
The controlled diagnostic `reference-entry-sdk-diagnostic02.log` and
`reference-entry-final-failure-probe.jsonl` show assertCurrentInputs throwing in
the prepared-context reference callback; the stage guard had marked computation
started before checking the loaded configuration. The actual failing stack is
not the new post-verifier membership guard, nor proof of a compiler crash.

The prepared callback now performs actual current configuration admission before
marking computation started, and retains its existing post-computation check.
Thus pre-existing stale metadata can reject the old context and take the original
complete fallback, while a change after admission/computation is still a failed
request. `reference-entry-admission-green01.log`: all3 selected formerly failing
cases PASS,23 unmatched tests not run. This is not a26-test pass claim.
The executor's existing execute wrapper also retains async rejection semantics;
only its explicitly named prepare API is synchronous/deferred. Typecheck/build03
PASS. The earlier9-test result belongs to build02 and must be rerun on build03.

## Frozen build03 results and final gate in progress

Frozen Worker `7b7b8584e9396c1635b8e002385d077633c0f9a6ee9a3254611c5ea4e269da77`,
313 source files; `runtime-m4-reference-entry-handoff-v2-identity.json` retains all
runtime/source hashes. `reference-entry-handoff-source-freeze02.json` freezes1020
source/test/script inputs. The sequential verification driver checks them before
and between each gate; unchanged so far.

- `reference-entry-handoff-expanded02.log`:93/93PASS,0skip/cancel,274996.65ms.
  Includes all nine input-race/cost cases, the three previously failing cases,
  pressure admission, cancellation/recovery and original proof boundaries.
- `reference-entry-off20k-original02.log`:3/3PASS,0skip/cancel, original source,
  original five-second client wait and original60s test limit unchanged.
  Full framed transcript in `reference-entry-off20k-capture02/arkts-semantic-ready-KltR8S/wire.ndjson`:
  reference request9 send→receive4924.366801ms, no error, exact three locations.
  This is ONE successful process/session, only~76ms below the original client
  wait; NOT evidence of sustained acceptable latency or a reliable tail bound.
  Prior failures remain, and no percentage wall-time benefit is inferred from
  comparing this successful sample to censored timeouts.
- `reference-entry-final-checkfast01.log`:actual pnpm check:fast started
  `2026-11-19T20:03:42.253Z` (Nov20 local), not completed at this update.
  `reference-entry-final-verification.json` records PID/args/start/end/exit for
  each stage. Do not use the focused green results as the full-check result.

These are framed-stdio protocol and unit regressions, not real Zed UI or endurance.
Remaining Photos/scale/M5/Windows/UI obligations are unchanged.

## Ordered downstream validation queued while whole check remains live

E`after-reference-gate-validation.mjs` is now running as a waiting controller;
its state file distinguishes WAITING from actual test execution. It starts no
product process until the existing `reference-entry-final-verification.json`
reports final PASS. A failed whole gate stops downstream validation and preserves
its evidence; it never restarts, cancels or overwrites the upstream gate.

Then it runs the four exact initial-strong-scan controls described in the M5 audit.
Only if those pass, it performs one serial ordinary Photos session per version:
A-plan starting dirty runtime-stamp5b638a7b, then frozen7b7b8584. This is not a
clean-main claim or a three-independent-cold-session distribution. Existing
photos-series-probe protocol driver and its resource/SQLite/closure protections
are reused, with initial/first/three-hot/overlay-edit/undo/close/reopen/cross-module
checks. SDKpartial full refs/rename remain an explicit separate limitation.

Each runtime manifest and Native hash is checked before execution. Original
30000 source paths/bytes and3955 recorded SDK metadata/declarations are compared
before/after each session. Project source additions are discovered; SDK checking
covers the original3955 paths, not exhaustive new unrecorded SDK additions, and
this limitation is recorded. No real project source, user installation/window or
user cache is changed. Only the previously isolated closed-warm56 Native cache
is reused; it is not a cold-index test. Baseline, candidate and terminal failures
remain distinct. The controller's preparation is not evidence that these pending
runs passed; consult its per-run PID/start/end/exit and actual result files.

## Whole-check environment failure discovered; no product assertion change

The still-live sandbox whole run developed failures in workflow/measurement CLI
cases. Some directly report `spawn EPERM`; prepared sampler/readiness cases also
fail, but their individual cause is not yet established by those headings alone.
The original full log and `sandbox-whole-failures-observed.json` preserve them.
Neither this partial observation nor the previous93GREEN is a full-check PASS.

Minimal Node20.19.5/x64 comparison, no product behavior or test changes:
`process-observation-sandbox01.json` and `process-observation-approved01.json`.
Ordinary Node and detached immediate-exit Node succeed in BOTH environments.
`ps -p <own pid> -o pid=,rss=` yields spawnSync ps EPERM in sandbox, but succeeds
with approved process observation. This proves the process sampling restriction,
not that every current failure is environmental or that detached spawn is broken.

An approved sequential verifier is running as a waiting controller in E:
`reference-entry-approved-verification.mjs` / corresponding.json. It waits for
original13701 terminal without cancelling or restarting it, preserves that run,
then executes the affected CLI files on identical frozen source. Only if these
controls pass does it run complete pnpm check:fast with required process sampling
permission. It freezes/compares all source1020 hashes, git status and tracked diff
plus untracked nonignored contents; no T source/test/docs edits during that gate.
Only a full PASS enables `after-reference-gate-validation-approved.mjs`, the four
initial scan controls and serial Photos comparison. The original sandbox downstream
controller stops on upstream failure; it cannot silently replace that failure with
an approved-run result. All logs/state names are distinct. No thresholds, freshness
assertions or product code were changed to accommodate the environment.
