# Input-validation gate reconciliation

Overall A-plan IN_PROGRESS. No merge, deployment, UI or endurance claim.
Evidence E: `.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.
Candidate isolated at `/private/tmp/arkts-hook-fixed-candidate-20261120`, parent
`1e3886df3c4d27755a53c073462f1456b0a3de7e`. Current Worker SHA
`3f9a6af3535725b40941b566fd361f48b9aa5e56741e8ecc0f498d0613ee4463`.

## Completed old full check

`reference-entry-approved-checkfast01.log`: 2727 tests,2705 PASS,22 FAIL,zero
skips. Completed 2026-11-19T21:40:03Z; source/worktree fingerprints unchanged.
This tested frozen Worker7b7b8584, not the new candidate. The runner prints each
failed heading again in its summary:44 headings represent22 failed tests.
Failures partition into19 private SDK constructor-hook startup cases,one metadata
provider-count oracle,and two post-computation invalidation error classifications.
The separate sandbox run was aborted after confirmed mandatory ps EPERM and is
not a completed full-check result. Neither result is overwritten.

## Private SDK fault-hook failures

The shared factory gained an optional syntactic-mode argument. The private exact
five-argument hook threw before executing the module; bounded Worker recovery
could not repair that injected startup error. The uniquely named header hook
supports both signatures and still rejects absent/duplicate headers.
All five unchanged consuming public files38/38 PASS, including real SDK/source
fault windows. See [detailed evidence](2026-11-20-sdk-hook-and-initial-scan-controls.md).
These19 failures are not19 independent product defects.

## Physical-observation provider accounting

The original8250-input assertion counted only execution of requestFileIdentity's
read callback. A current Native scan can now supply that original physical identity;
the final phase still reads every leaf independently. The initial diagnostic
`input-identity-phase-diagnostic01.log` retains the original failing assertion:
8250 current Native raw observations exist, and8250 final source read callbacks
exist, but the current source callback is intentionally not called again.

The counter now separately records raw callbacks and actual consumption of the
eligible completed-Native handoff, scoped inside requestFileIdentity before its
fallback. It does not credit memo hits. Exact2 observations per source and4 after
the next uncached symbol query remain mandatory. New phase histograms additionally
require every Program input in query/final raw observations and consumer calls;
final source reads must be exactly8250,then16500 across the two requests.
Exact reference locations,actual Program>8192 and metadata-byte checks remain.

`input-identity-provider-green01.log` failed before preparation: a private hook
assumed the bundled local name current, while the current artifact uses current3.
A direct real Worker load exposed `unique completed-Native identity handoff required`.
The fixture now captures the unique local identifier only inside the named
requestFileIdentity function. No product callback,timeout or freshness guard
changed. `input-identity-provider-green02.log`:1 selected PASS,0FAIL,8 not selected,
14535.53ms file time. This is functional/counter evidence,not a latency benefit.

## Typed post-computation invalidation lost across Worker boundary

The actual final resident reference guard throws SemanticResultInvalidatedError,
a subclass of SemanticInputUnavailableError. The Worker classifier formerly
matched the base type and sent workspace-incomplete,which became LSP-32803.
Historical READY mutation tests correctly expected-32801 because input changed
after the computation began. No stale locations were returned,but the phase was
lost and the public failure contract was wrong.

`src/semantic/semantic-worker-request-error.ts:12` now classifies the subtype first
as content-modified. Cancellation/disposal cell precedence is unchanged; ordinary
pre-admission unavailable/SDK cases remain workspace-incomplete. Existing parent
handling emits the established stale-result terminal. No new retry,rebase,wire
version or disk scan was added. Prepared reference post-search freshness still
throws at `reference-search-executor.ts:387`; it cannot silently restart on newer
inputs. Before-dispatch admission misses retain their existing complete fallback.

TDD: `result-invalidation-classifier-red01.log` proves the prior base-type mapping.
`result-invalidation-classifier-green01.log`:classifier matrix+manifest5PASS.
Typecheck/build PASS. `result-invalidation-public-green01.log`:11 selected public
PASS,7 not selected,including the two historical READY scenarios and resident/
isolated final fences. New tests now assert exact phase-appropriate codes; no
allowed-code set replaces the historical assertion.

LSP3.17 [implementation considerations](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md#implementation-considerations)
distinguish internal project-context invalidation during execution from ordinary
ordered notifications. Installed protocol3.17.5 definitions were checked; the
Context7 resolution attempt failed transport,so no successful Context7 retrieval
is claimed. This correction applies existing ADR0037/0044 constraints rather than
introducing a new accepted decision.

## Remaining verification

The full request-input-validation file and adjacent reference/member/SDK/final
fences are being rerun on current3f9a6af3. Its result must be recorded before
performance controls. Final full check on this actual candidate is still pending.
Real Photos/scale comparison must use this new hash rather than old7b artifacts.
No new performance improvement is claimed from these error/counter repairs.
Actual Windows UI,formal endurance and larger dependency-axis measurements remain
open; the minimal SDK control READY is not real Photos SDK qualification.

## Current adjacent regression completed

`input-validation-final-regression01.log`:41/41PASS,zero skipped/cancelled,
96933.81ms. All nine original request-input-validation cases execute, including
8250-input accounting and READY final-fence mutation; adjacent independent disk,
member,SDK,isolated/resident reference fences and classifier/manifest pass.
`input-validation-source-freeze01.json` fixes the current source/test/script
inputs; runtime-m4-input-validation-v1 freezes the current artifact for matched
Photos protocol measurements. This is not a new full-check or UI acceptance.

## Actual same-input30K serial ordinary pair

`input-validation-photos-comparison01.json` completed with failures,not PASS.
Raw summaries: `input-validation-photos-measurement-summary01.json`; complete wire,
logs,progress/resources and exact response bodies retained per run.

| Operation | Starting dirty5b candidate | Current3f candidate |
|---|---:|---:|
| Semantic preparation |91098ms|79088ms|
| First exact definition |9214.47ms|5245.59ms|
| Hot definitions (three requests) |3659.89/3609.24/4141.90ms|2761.57/2874.83/2784.04ms|
| First overlay edit |4068.42ms|3416.33ms|
| Undo then repeat0 tail |12738.26ms|5690.98ms|
| Node process RSS peak |2070.42MiB|1800.88MiB|

One process/version,baseline first,three hot requests are not three independent
starts. No cold OS-cache flush; Native warm catalog reused sequentially. Frozen
input is original30000source files,eligible29995; identical source/config SDK
checks before/after. SDK24 versus project20 still yields honest partial SDK
coverage,not complete references/rename qualification. Baseline is the starting
dirty candidate,not clean parent main. No UI/endurance claim or stable percent
speedup established. No per-Worker RSS summation: Worker threads share Node RSS.

All13 overlay/undo/close/reopen/cross-module exact checks execute on each version.
Both Native catalogs report ready,both server process trees close. Current3f
checks data DB in49.68s and control DB in0.006s,both `ok`,without a deadline change.
Baseline data DB hits the existing60s ETIMEDOUT/SIGTERM; control DB `ok`.
That baseline sample remains FAIL; it does not establish data corruption or prove
why check time differs. Original comparison is COMPLETED_WITH_FAILURES and the
strict downstream controllers01 stop,preserving evidence. No retry overwrites it.

Separate scale experiment02 may proceed because current candidate's functional,
resource,DB and closure controls passed; its metadata explicitly carries prior
baseline failure and does not retroactively pass the comparison. All existing
per-scale oracle,DB,resource/closure stops remain. Final current full-check02 is
queued serially after that experiment; it is not a substitute for missing scope,
Windows/UI,endurance or independent-repeat evidence. Remaining2.8s hot and5.69s
undo tail are still material performance costs,not declared resolved.

## Fixed actual closure final candidate scale series completed

`scale-controls/final3fB-fixed-closure-series01.json`:15/15PASS,three independent
processes per total-file tier,actual definition Program16in every traced query.
No reference/rename gaps in these synthetic partial SDK fixtures. Original source
hashes restored,each process tree closed and SQLite integrity PASS. Round1 fresh
isolated Native cache,round2/3 reuse that closed cache; no OS-cache flush.
`final3fB-fixed-closure-summary01.json` retains every sample and historical baseline.

| Total files | Init median | First definition median | Hot median / max |
|---:|---:|---:|---:|
|128|2228.90ms|184.25ms|54.11 /57.44ms|
|2048|3242.06ms|253.45ms|101.29 /130.21ms|
|8192|6320.53ms|513.16ms|250.95 /304.78ms|
|20000|12448.42ms|1001.41ms|564.56 /635.45ms|
|30000|17938.71ms|1534.63ms|832.21 /843.16ms|

Initialization/first each3samples; hot15requests nested in3processes,not15independent
starts. Actual Program16does not mean only16project members are scanned for
membership/global authority. A nonzero total-member growth cost clearly remains.
Historical clean-parent1e3886df with identical source hashes/SDK gives hot medians
49.82/117.60/395.40/943.76/1395.90ms. Current large-scale queries improve,but current
initialization medians2228.90/3242.06/6320.53/12448.42/17938.71ms exceed historical
1932.97/2946.58/5944.93/11491.77/16159.50ms. This separate-batch comparison is not a
randomized matched trial; initial regression/maintenance tradeoff needs attribution,
not deletion or a causal claim from correlation. Original full member-fence
regressions and observed growth do not justify dropping freshness contracts.

The first strict scale/full controllers stopped on the preceding failed comparison,
then independent scale02 explicitly retained that failure. No old failed status
was changed or sample excluded. Current actual full gate02 started
2026-11-19T22:04:08Z (pnpm pid42424); source freeze1022 unchanged,Worker3f9a6af3.
`input-validation-final-check02.json` and `.log` are authoritative for its terminal;
it is RUNNING at this update,not a whole-check PASS. True dependency closure,
fanout/depth/SCC,volume/density axes and current Windows/UI/endurance remain open.

2026-11-20 final frozen current3f gate completed: actual `pnpm check:fast` PASS,
2732/2732,0FAIL/0cancel/0skip,exit0,4392971.14ms. Source freeze unchanged before/
after; Worker before/after both3f9a6af3. Terminal23:17:50.959Z on2026-11-19UTC.
Authoritative logs/state: E`input-validation-final-check02.{log,json}`. This proves
current full correctness gate,not performance/UI/endurance completion. Old7b
2705PASS22FAIL remains intact. Same3f cost controls now execute serially; their
ordinary-before exact queries succeeded but DB postflight60s timed out,retained
as FAIL. Do not merge these separate evidence scopes or relabel the failure.
