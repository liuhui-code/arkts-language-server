# Resident references: prepared inputs and post-query terminal fences

Status: implementation/verification IN_PROGRESS, not UI/endurance/full-goal
acceptance, merge or deployment. Worktree /private/tmp/arkts-syntax-owned-factory-20261119;
parent1e3886df3c4d27755a53c073462f1456b0a3de7e. E means main checkout
.bench/repeated-query-proof-plan-20261117/implementation-20261118/.
Final frozen Workerba30d739c5cc24291a055b778203cfc507ab8bd8fea94186fd5d9602df4baa9e;
312product source hashes, unchanged Native800e6628. Final identity manifest:
E/runtime-m4-resident-reference-preparation-v2-identity.json.

## Correcting the remaining-cost attribution

The earlier probe observes Program creation only in the main semantic Worker.
It does NOT observe every transient verifier's Program. Existing diagnostic06
server.log already has references.batch.complete with55Program files:2project,
1SDK,52other, although the main Worker probe has no new Program observations.
Do not call the whole reference operation zero-build.

Within the references command1954.97ms, current/final membership and two candidate
identity guards total approximately1105.91ms, leaving849.06ms outside those spans.
Existing batch start/complete elapsed fields identify711.69ms in isolated verifier
work. Its non-overlapping recorded child phases are:

| Phase | ms | Boundary |
| --- | ---: | --- |
| Worker startup | 338.85 | runJob entry through runtime-ready, includes startup/transfer/module loading; not pure thread creation |
| Host preparation | 52.64 | engine.prepare |
| Program ready | 211.72 | includes getProgram209.84 and createProgram169.32; do not add them |
| Reference/anchor query | 24.00 | actual verifier query |
| Batch remainder | 84.47 | transfer/validation/disposal/other continuation not separately spanned |

Approximately137.37ms remains outside that batch and the already counted member/
candidate checks. It is still unattributed orchestration/planning, not all CPU,
queue time or removable cost. Parent direct-query502.43ms is Native candidate
selection BEFORE the main reference command, and cannot be added inside it.
All numbers describe this diagnostic session, not ordinary wall time estimates.

## The original complete20K transcript disables the production resident route

The original partial-completion-admission.test.mjs fixture spreads selectedL03Policy,
which explicitly sets ARKTS_REFERENCES_RESIDENT_FAST_PATH=0. Product runtime default
is1. Thus the original six5s failures exercise an explicit complete fallback path.
They remain real test/performance failures; do not remove them, flip the original
switch or describe them as default timings. A separate default-enabled control is
needed. Production SDKpartial Photos30K still cannot claim complete references;
it is a different capability/input case from this complete minimal-SDK fixture.

An initial default control01 accidentally resolved the observation fixture from
the main checkout rather than the isolated worktree: their hashes differ. Its
resident-hit3091.11ms and final5s timeout are retained but NOT a matched comparison.
Subsequent comparisons must run cwd=the isolated worktree and use frozen runtimes.

## NAV-PREP-002: missing synchronous scope on actual retained references

Public stdio cost RED:64unrelated regular files, complete SDK READY, exact three
reference locations. Default resident route performs320noise leaf lstats, all
outside a request observation phase, and one unscoped member pass. Disabled route
performs256 (current member64/final member64/candidate guards128).

Call chain:
LSP references -> parent resident-first/retained Worker command ->
LegacySemanticEngine.residentReferences -> prepareReferenceSearchWorkspace ->
queryRetainedReferenceContext / withResidentReferenceContext ->
TypeScriptLanguageServiceEngine.residentReferences -> queryAdmittedReferences ->
TypeScriptResidentReferenceState.admit before/after -> observedSourceIdentity.
The regular resident inputs were separately observed before/after instead of using
the request's current phase and independently validating at its final boundary.

Fix uses the existing synchronous preparation scope in runResidentReferenceQuery,
extracted into reference-anchor-preparation.ts. The actual engine method enters
its existing module/input-validation boundary INSIDE the existing resident lease.
Preparation owners contribute to the real final union; no awaited operation or
verifier startup occurs inside this handoff. No Program/query result cache added.

GREEN:192noise leaf observations (prepare64/final128), zero outside observations,
exact three ranges unchanged. Two member passes include a real independent final
member fence, so the member-pass count increases1->2 while total leaf work falls
320->192. This is not simply deleting a check. The explicitly disabled fallback
still has its original256observations and complete outputs.

## Post-admission failure must not become a cache miss

A new post-lookup final-entry race changed actual source/created namespace/SDK
inputs. The first repair exposed queryRetainedReferenceContext's catch: a genuine
failed final fence became undefined, allowing the SAME request to build a new
fallback Program. Source changes were later rejected by the parent namespace
check; SDK declaration changes could return successful locations after fallback.
Raw captures: resident-reference-race-capture01 and green02/races01 failures.

An unconditional propagation repair correctly rejected these, but broke the
existing pre-query SDK drift test: an inadmissible old Program must still be
allowed to use the established complete fallback BEFORE a semantic query starts.
Expanded01 recorded that failure. The suite also straddled a subsequent rebuild;
its89/90result is mixed-candidate diagnostic evidence, NOT final acceptance.

Final design explicitly distinguishes these states:

1. Admission miss before actual reference computation: preserve existing complete
   fallback and new-SDK loading. No old resident answer may be published.
2. Actual reference computation started, followed by an input-fence failure:
   SemanticResultInvalidatedError (a SemanticInputUnavailableError subtype), original
   cause retained. Invalidate the resident proof and propagate; no same-request
   fallback can silently adopt new inputs. Public failure stays -32803.
3. A fresh request can recover from actual current inputs. SDK metadata recovery
   is separately exercised through real didChangeConfiguration, using one semantic
   Worker; no restart, input restamp, capability relaxation or deadline change.

The typed guard is in resident-reference-query.ts, bound to the compiler query
through typescript-resident-reference-query.ts; the engine still owns the leased
validation scope. resident-context-lease.ts permits only the
admission-miss case to return undefined. Real cancellation/errors are not swallowed.
Existing pre-query SDK changed-declaration fallback test remains unchanged.

## Tests and limits

Final focused01:12/12PASS,0skip/cancel, including exact ranges, source/created/SDK
source/SDK metadata after-lookup refusal, following request/configuration recovery,
old pre-query SDK fallback, nested-root stale cancellation and manifest.
Frozen baseline3ee3a0c7:1PASS/4FAIL on the earlier five-case public version; logs
retain320-vs192cost and absent post-query refusal. Metadata case added afterwards.
Final manifest367entries (unit153/bundle191); TSC04 and diff whitespace checks PASS.
Final expanded02 is running against frozen62afdab0; no product edits/rebuild while
it runs. Over-limit migration debt remains engine2853lines (unchanged in this
slice), Legacy622lines (627before extraction), not new permission to grow them.

Early new race tests expected -32803 but got parent ContentModified -32801 because
the failed resident proof was swallowed; the final typed-state repair now produces
-32803 directly. Metadata02 additionally over-assumed that complete-SDK recovery
must reject another query until a config event, copying a partial-SDK assertion.
That extra assumption is not this fix's invariant: the final case verifies first
request refusal and explicit configuration recovery. Existing partial-SDK test's
unreconfigured rejection is retained unchanged in expanded02. Its full-SDK automatic
recovery observation is not independently certified here. Metadata01 failed to
load a mistyped preloader path before server startup; retained as tooling failure.

Ordinary default-enabled20K old/new serial timings are pending. The original
explicitly-disabled20K5s failures remain open. No claim of Photos30K complete refs,
real UI, enduring stability, final checkfast or completion of the full A-plan.


## Broader prepared-context lane and final frozen regressions

Frozen62afdab0 expanded02 completed104/104PASS,0skip/cancel. A further controlled
public counterexample forced exactly one resident-admission miss while retaining
the already prepared context; the real prepared-context reference method then
ran, and an actual SDK-source write occurred at its final fence. That method's
failure still became a cache miss: prepared-reference-race-red01 returned three
locations instead of -32803. This is a controlled reachable branch, not proof of
a naturally reproduced Photos timing window. Its forced-miss/mutation events and
full framed response are retained in the capture directory.

The same typed stage guard now also encloses the prepared reference query's
original leased execution. It marks computation started inside the actual engine
callback, after prepare/admission; its final fence still runs inside the lease.
The helper was placed with resident-reference policy and a typed compiler adapter;
no mutable global execution flag or additional coordinator was introduced.
The existing pre-query SDK-miss fallback remains unchanged and passing.

Final focused02:13/13PASS,0skip/cancel. Final expanded03:105/105PASS,0skip/cancel,
282113.55ms, including post-query changes, before-query SDK drift, nested overlay
cancellation, opt-outs, pressure/fallback, Native-byte guards and final member/SDK
ordering. All1016source/test/script frozen inputs unchanged at postflight.
TSC05/build05/diff checks PASS. New frozen runtime v2 has312source hashes; Native
unchanged. The prior104/104identity is retained separately, not relabelled as this
105/105candidate. No full checkfast yet.

The ordinary default-enabled comparison is now running three alternating fresh
sessions per old3ee3a0c7/newba30d739 runtime. Only its final TEST reference observer
is20s so failed5s samples are not clipped into fake complete latency. All original
result/range/parse/initialization assertions and product deadlines remain. The
original file (resident=0,5s observer) is untouched. Memory fields are maximum
logged boundary samples: whole Node RSS once (threads share the process), parent
heap and Worker heap separately; not continuous peak or Native-process memory.

Photos original30K ordinary harness was separately audited: it clears ARKTS_ test
variables and does not set resident fast-path/session-reuse switches, so this
20Kfixture's explicit opt-out does NOT invalidate the earlier default Photos
definition measurements. No unproven source-count/SDK/profile equivalence is assumed.

Read-only Windows retry failed:192.168.31.14:22 connection timeout (SSH255), no
Windows deployment, UI action or user process restart. This does not block Mac
work. Source freeze, complete trace and matched timing JSON remain the next
acceptance evidence; protocol is not UI or endurance.

## Completed ordinary default-route comparison

Three alternating fresh processes per version, final20s TEST observation only;
all6selected transcripts PASS with exact three-location/range assertions. UTC
18:45:42.514 through18:50:24.936 (~4m42s across six sessions, NOT one-session
endurance). Same20004relative source hashes/200188bytes in every captured input;
actual server Program stats20057files =20004project +1SDK +52other on both versions.
Cold process/initial preparation, then definition,30comment edits, completion and
details, finally FIRST references with a warm complete Program and empty result
cache. Do not call these repeated reference-cache hits or real Photos/UI samples.

| Version | Reference ms (three sessions) | Median / max ms | Resident-body median ms |
| --- | --- | --- | --- |
| Before3ee3a0c7 | 6261.62 /6315.06 /6258.34 | 6261.62 /6315.06 | 3125.82 |
| Afterba30d739 | 4204.54 /4145.51 /4259.79 | 4204.54 /4259.79 | 1041.58 |

Median outer improvement32.85%. Resident-body and outer times are inclusive:
DO NOT add them. The remaining~3.16s of the median pair includes before/after
readiness and other parent work; no claim all of it is queue or removable IO.
All six use one semantic Worker and zero verifier batches. Six actual server PIDs
were absent at a subsequent read-only ps check; Native exits/peak memory were not
independently sampled in this small experiment.

Maximum logged-boundary whole Node RSS: before884.98MiB /after884.90MiB. Worker heap
max674.37/678.62MiB, parent heap max62.27/46.68MiB. These are boundary-sample maxima,
NOT continuous peaks, do not sum thread RSS, and do not prove a memory reduction,
leak absence or Native resource bound. No RSS/heap/product threshold changed.

Raw per-run server events, outbound payloads, input fingerprints and test outcomes:
E/default-resident-20k-matched01.json; summary: corresponding-summary.json. Product
sources remain frozen. Separate default-enabled controls retain the original5s
reference observer: candidate01 PASS4154.01ms; candidate03 PASS4283.08ms (wire parent
send->receive4284.21ms). This is NOT the original resident=0 transcript passing.
Candidate02 failed before startup because a collector path was missing; tooling
failure preserved and excluded from performance samples.

## Receive-payload retention correction

The v1 collector saved transport.messages at close; that is only unconsumed inbound
messages. Successful consumed responses/READY report bodies were verified by the
public test but not persisted. This limits raw-payload evidence for the six matched
runs, not their recorded server latencies or exact test oracles. Do not reconstruct
unrecorded payloads and call them original wire data. Photos' independent full
wire.ndjson.gz collector is unaffected.

Collector v2 hooks the existing recordTranscript method before messages reach any
waiter. Candidate03 has1009full parsed Content-Length stdio records, includes READY,
actual exact3reference locations and one response terminal for that request. Both
wall and parent monotonic times retained; response-body byte size is the original
parsed frame length. Source/SDK/elapsed conditions otherwise unchanged. Subsequent
runs should use v2. This is protocol evidence, never UI interaction certification.

Remaining: original explicit resident=0 five-second tail; real Photos cold/first/
hot/edited final comparisons; M4/M5 completeness, final whole checkfast, Windows/UI
and endurance. A next measured hypothesis is the existing source-digest WeakMap
being keyed to newly allocated evidence wrappers rather than the unchanged source
text/SourceFile; inspect/prove cache churn before changing it. No such hash-cache
optimization has been implemented in this checkpoint.
