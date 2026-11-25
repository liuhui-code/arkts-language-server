# Owned syntax factory and original containing-source inputs

Status: A-plan IN_PROGRESS, no merge/deploy/UI acceptance. Authoritative newer
worktree `/private/tmp/arkts-syntax-owned-factory-20261119` seeded from2601frozen
files of `/private/tmp/arkts-binding-input-delta-20261119`; parent1e3886df3c4d27755a53c073462f1456b0a3de7e.
E=`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.

## Full-check finding and factory repair

Original280effc4 whole `syntax-symbol-checkfast.log` completed normally:
2705tests /2704PASS /1FAIL /0skip/cancel,4097484.05ms. All2601frozen files and
worktree status unchanged at postflight. The sole failure is
`semantic-capability-matrix.test.mjs:73`: raw language-service factories2!=1.
Direct syntax service creation bypassed the existing owned official factory.
This was an implementation omission, not an invalid architecture assertion.
A read-only owned-process stop plan was recorded but NO signal was sent; the
full check finished normally. Do not describe it as stopped or fully passing.

The new worktree preserves the old failing full-check identity. Architecture RED
1PASS/1FAIL and public LSP RED require syntax mode to use the owned factory and
settle its registry owner on close. Fix: optional Semantic/Syntactic mode on
existing createOfficialSemanticService ->recoverableLanguageService ->sole raw
createLanguageService. Default remains Semantic. Syntactic skips SDK auto-import
Program enrichment but uses identical ownership assertion, releaseRemaining,
retirement/quarantine and dispose. No new raw factory or weakened count assertion.
SDK unknown remains local parser qualification; genuine compiler ownership
corruption cannot bypass the existing quarantine merely by making a syntax query.

Focused factory/public guards and original resource/cancellation suites71/71PASS,
0skip/cancel (`syntax-owned-factory-expanded01.log`), TSC/build PASS. Public test
observes mode2 construction once, reuse on repetition, zero root enumeration,
registry-owner release on close and final session disposal. Original raw syntax
factory failed that transcript. This does not claim forced GC or precise heap
reclamation; actual ownership cleanup boundaries are observed.

Frozen repaired runtime `runtime-m4-syntax-owned-factory`, Worker
2ff2a8af6bcacbb2ea47513fef334568ceafc3d7d6c04bc6bc54e5a1361c591e,
312source hashes, Native800e6628. Ordinary Photos pair keeps exact full responses:
syntax symbols35.83/7.75/7.03ms versus old35.54/7.19/7.34ms;16items allsixresponses
equal. No claimed speed difference from ownership repair. Native30000READY,
candidate SQLite/owned close PASS; baseline SQLite60s timeout retained and series
COMPLETED_WITH_FAILURES. One process/version, protocol NOT UI/endurance.

## Current cost probe: measure before another optimization

`m4-current-cost-observer.cjs` adds nested sync/createProgram/createTypeChecker,
actual module resolution, retained proof, boundary and global/export-summary
spans. Compatibility checks transform AND syntax only; public calibration1/1PASS
then verifies actual definitions and nonnegative self times. No product hooks,
worker bytes or timeout settings modified. A historical observer's hook mismatch
is retained in compatibility01; it is a tooling mismatch, not a product failure.

Independent `current-cost-photos-diagnostic01` succeeds exact definitions,
Native/SQLite/owned close, same30000source hash and warm closed catalog/SDK.
Instrumented initial Worker command74926.48ms (controller75513ms), first definition
5825.83ms, hot3503.65/3504.75/3924.68ms. Ordinary repaired candidate initialization
71191ms, first4932.41ms, hot2617.09/2629.24/2692.40ms. Different sessions: difference
contains instrumentation effects AND unassigned run variance. Do not project
instrumented fractions onto ordinary latency or subtract the entire difference.

Non-overlapping self aggregation and counts: `current-cost-photos-diagnostic01-summary.json`.
Inclusive initial role parse/extraction22489.54ms and binding resolve24929.14ms
are disjoint sibling work in input/graph preparation. Do NOT add their children:
role globals2219.52ms, module resolve14839.67ms, configuration.identity8584.53ms
are nested or distributed functions, not extra independent work. Initial module
resolve entrycalls117732 include repeated confirmation and other callers, NOT
117732unique paths. Distinct binding keys were not measured.

Initialization parses19771role source texts (shared across29995eligible members).
Initial observed semantic Program has0project/256SDK/113other files. First
navigation observes Program2 with87project/282SDK/113other; all three hot queries
reuse that ID with zero new createProgram calls. This distinguishes actual
Program construction from repeated synchronization/proof entry. Observed Program
metadata counts are not a global count of all temporary or SDK export Programs.

Hot diagnostic still has two full Node membership passes (~338+337ms), plus
configuration/source-fact comparisons, repeated binding-proof traversal and
view/preparation work. No claim that all of this can be removed under current
unnotified-change correctness. Many source facts and graph owners still scale
with global member/edge counts even when the actual target Program stays87files.

## Binding containing-source identity slice

SourceRole import lists already come from an actual guarded byte snapshot and
SourceReadOrigin. ScopeModuleBindings nevertheless captured a later containing-
file identity before/after resolving every new binding. Target resolution itself
also performs guarded lookup/confirmation and remains untouched.

Public RED `binding-containing-origin-red01.log`:64independent containing files,
all actual origins qualified, exact GlobalThing definition correct,320lstat calls
inside their bindings (5/file). New witness retains the original source identity
instead of recapturing it around resolution. The first binding current() validates
all collected original inputs AFTER resolution; independent final union still
raw. No current identity replaces the actual source-read identity. Overlay/SDK/
weak/unknown origins keep the old before/after path. Target guards, negative
lookups, package/physical boundary and confirmation resolution unchanged.

GREEN selected1/2notselected:64lstat total,1/file, no realpath; original cost limit
<=2/file unchanged. This is actual Node API observation in a public framed LSP
fixture, not elapsed-time proof. TSC/build and whitespace checks PASS.
Expanded `binding-containing-origin-expanded01.log`101/102PASS,0skip/cancel:
mode/read-window, late source/SDK/member fences, aliases, proof renewal, graph
reuse and source provenance pass. The complete20K fixture's request9 references
still exceeds original5s after3locations merge while post-readiness runs. This
failure is retained, not excused as baseline or fixed by increasing the wait.
Additional complete20K ordinary capture/diagnosis is in progress.

Frozen containing-origin candidate `runtime-m4-binding-containing-origin`, Worker
b8a055755a5d4465d49ee4b9653a701bdcc001d4a6cbe279337434a2924c6530.
One ordinary Photos pair: initialization101149 ->84438ms, first5945.72 ->5251.94ms,
hot median3050.93 ->2910.72ms. Exact symbols/highlights/inlay full results and
13original lifecycle queries retained. Candidate Native/SQLite/close PASS;
control SQLite60s FAIL, whole series WITH_FAILURES. Earlier sessions were faster
(~71s initialization); reason for run variance remains UNMEASURED, no thermal/
OS-cache/SDK attribution asserted. This single pair is insufficient for a robust
latency guarantee or an assumption that hot-query cost is solved.

All30000source content hashes unchanged. Postflight checked all3955paths/content
in the prior SDK snapshot, zero differences; not exhaustive new-path discovery
and not a Program count. SameSDKpath/API24/project20 partial qualification remains.

## Checks, ADRs and remaining

ADR0019 original input/final freshness and ADR0044 load ownership retained;
ADR0020 one official owned factory respected after the explicit repair.
ADR0037 refinement uses actual source provenance; no watch-only planB or status
promotion. New whole check still REQUIRED on the final revised identity. Previous
whole2704/2705FAIL is not a pass for either new identity.

Remaining:20K reference tail/readiness proof cost, repeated semantic navigation,
current containing-origin multi-session/phase comparison, initialization role and
resolution costs, further M4/M5 and controlled actual-dependency scale axes,
frozen final check, actual Windows/UI/endurance. No unmeasured stage is assigned
to OOM or a compiler loop. No product memory/scale/deadline limit changed.

## Complete 20K references: retained ordinary result and bounded call stacks

Original complete-project 5s observer remains unchanged. Independent ordinary
capture02 passed (request.completed references4623.4ms), retaining all framed sends, the unconsumed inbound queue, full server logs and
20004input hashes before fixture cleanup. Consumed response bodies were checked
by the test but not retained by this v1 collector; see the v2 correction below.
This is a near-deadline successful sample, not proof that the expanded-suite
5s failure disappeared. Capture01 failed to load its diagnostic preloader due to
a script-path error before server startup; it is tooling failure, not product RED.

Independent diagnostic01 retains original product deadlines but uses larger
TEST observation windows only. Last three Worker commands were readiness1341.30,
references1733.01, readiness1289.97ms (serial sum4364.27ms); the public operation
was about5075ms. No new Program observations occurred in those three commands.
Do not sum nested spans or call this a pass of the original5s test.

Bounded diagnostic02 adds at most four project-lstat stack samples per phase,
not a stack on every syscall. Last commands1675.37/2000.45/1585.07ms; this is a
separate instrumented run and cannot be subtracted from ordinary4623.4ms.
Samples establish two additional actual consumers:

- readiness final membership enumeration is followed by resident Program disk
  input validation: TypeScriptResidentReferenceState.diskInputsCurrent ->
  observedSourceIdentity -> requestFileIdentity. It performs the regular-source
  before/after lstat window, accounting for the additional approximately2N final
  leaf observations. This is original Program byte provenance, not a Program build.
- references outside the synchronous input phase performs projectFileIdentitiesCurrent
  from ReferenceSearchExecutor.execute. Its entry and result-publication guards
  account for approximately2N additional leaf observations around candidate search.
  They protect candidate exclusion; merely caching their true result across await
  would remove the final check and is not an acceptable optimization.

The three commands each have their own publication boundary; sharing a query-time
valid=true across them is not equivalent. Final observations and real byte-read
windows remain independent. Next measurement times the identified resident,
source-namespace and candidate-identity consumers before choosing a proof-sharing
slice. Raw stacks: E/reference-readiness-leaf-diagnostic02/phases.ndjson;
compact retained summary: reference-readiness-leaf-diagnostic02-summary.json.
This is public stdio protocol diagnosis, not real UI or endurance acceptance.


Evidence collector correction: capture-readiness-evidence.mjs v1 writes only the
transport's remaining inbound queue at close, not every consumed response. Sent
payloads, raw server timings, input hashes and asserted results remain evidence;
do not describe received.json as a complete wire transcript. Version v2 additionally
hooks recordTranscript before waiters consume messages. Default20K candidate03
retains all1009parsed framed payloads, READY report, exact refs and one terminal.
Original Photos protocol wire.ndjson.gz uses its separate full collector and is
not affected by this correction. Older v1 runs are preserved, not overwritten.
