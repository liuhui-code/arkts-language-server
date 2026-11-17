> Superseded continuation: [2026-11-15 report](2026-11-15-30k-initialization-follow-through.md). Targeted95PASS is not whole acceptance. Warm14/diag16/warm18 DB postflight timed out; original top-level query-success text is not an overall pass. Import-heavy nested scope and full qualification remain OPEN.

# 30K initialization to unavailable: active diagnosis and repair

Status: IN_PROGRESS, not accepted. Protocol evidence only, no UI assertion.
Source: isolated feat/index-versioned-maintenance-20261104 on298d65f5;
Pre-memo server/worker/Native matched Photos16; current generic-fallback repair has its separate frozen receipt below. Exact identities,
four falsifiable hypotheses and seven gate rows: `.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/plan.json`.

## First confirmed boundaries

- Initialize handshake16:7.002ms, public response succeeds. It is not semantic READY.
- Epoch1 dispatch17:52:04.886Z; SDK selected17:52:12.772Z, metadata identified,
  dialect unverified/type-compatible-only. Later Program entry/return timestamps
  were not captured in16. A report that Program never returned is from other
  independently marked diagnostic runs, not a fabricated16stack.
- Epoch1 preparation failed17:53:34.034Z after89486.56ms, generic worker-unavailable.
  Original raw cause unmeasured. Replacement thread2 at17:53:34.287Z.
- Native catalog ready17:57:55.507Z:30000/30000, skipped0. Catalog ready alone
  does not prove Node semantic scope qualification; Native includes30000 while
  Node eligibility29995. Full parent-consumed qualification time unmeasured.
- First definition sends17:57:55.610Z, epoch2dispatch17:57:55.620Z. Product30s
  execution deadline17:58:25.645Z, Program starts1/returns0/checker0. Public
  request2 -32603 at30139.83ms. Shared activity174499 is progress, not proof of
  semantic termination or a loop. Shutdown acknowledged, exit0; DB integrityPASS.
- Diagnostic18: no raw Worker error. External90s observation initiated shutdown;
  explicit terminate00:24:03.411Z followed by exit1. This intentional termination
  must not be used as evidence of the original16failure or OOM.

## Product limit versus driver observation

Actual semanticWorkerDeadlines: prepare180000ms, ordinary request30000ms, global
120000ms, mutation10000ms, cancel1000ms. Existing driver waits90s for preparation
and then shuts down. That observation can interrupt finite work before the
product prepare cap. A diagnostic may continue observing the original product
cap without changing it; the original90s miss remains a failure observation, not
a newly accepted performance result. Raw cause and first exact query must decide
functional availability. Resource safeguards remain.

## Immediate independent tasks

1. Confirm missing-SDK fallback and package/identity scan hotspots using a small
   public LSP test before repeating original large workload.
2. Observe raw Worker cause, terminal response, shared stages and configured heap
   limit; separate external90s protection from existing180s product prepare cap.
3. Compare original30K with copied completed Native cache, then a fixed-path real
   content/whole-copy-group scale control; keep query target and all its closure.
   Original283eligible files;107whole276file copy groups plus a partial final group.
   19492sources import copied names. Removing arbitrary copies can BREAK topology:
   it is forbidden to call that unrelated-file scaling.
4. Reproduce seven gate rows. Confirm actual completeness, executed mutation and
   measured interval before changing any oracle. Keep complete and genuine-partial
   controls; preserve count and all old failures.
5. Fix only proven defects, public regressions, actual30K cold/warm and exact first
   query; then fresh whole gate and remaining overall acceptance.

The latest full check2470PASS/7FAIL/0skip ended2026-11-12T01:38:01Z with2477
source inputs unchanged. Earlier full-green results are historical. Of particular
note, the20004source completion case now reached initialization and its interactive
sequence; it fails a parse-interval assertion, not its earlier20s observation.
This distinction does not yet close that row or claim the whole feature repaired.

## Confirmed original-input failure after generic fallback repair

Frozen runtime: initialization-breakdown-20261112/fallback-runtime; SHA256receipt
fallback-runtime-identity.json. Parent298d65f5 plus sealed dirty candidate; Node20.19.5,
same API24/6.1.1.125 SDK and Native800e6628. Protocol only, not real UI. Original
Photos30K isolation H36/harness/project unchanged; cold separate index. Node eligible
29995, Native physical30000. First query retains picker-screen/getInstance input.

Run photos-fallback-cold-01:2026-11-12T07:51:21.508Z..07:53:31.137Z:

| Stage | Evidence / actual result |
| --- | --- |
| initialize id1 |7.034ms, successful framed handshake; not READY |
| Worker1 | created07:51:21.691Z, execution-start07:51:22.040Z |
| effective heap | isolate startup heap_size_limit4345298944bytes; online maxOldGenerationSizeMb4096, requested resourceLimits null |
| driver90s | recorded07:52:51.758Z, no cancellation/shutdown at that point |
| first failure |07:52:58.119Z error ERR_WORKER_OUT_OF_MEMORY: Worker terminated due to reaching memory limit: JS heap out of memory |
| failed build | program1/return0, synchronize1/return0, checker0, activity393650 at raw error |
| Worker1 exit |07:52:58.121Z code1, raw OOM precedes exit; no terminate call precedes it |
| public preparation |failed07:52:58.123Z,96436.16ms; observer elapsed96466ms |
| replacement |thread2 recovery complete07:52:58.376Z; configuration restored, zero open documents; failed Program not transferable |
| first definition id2 |immediate after preparation terminal;30674.15ms,-32603 Semantic worker unavailable |
| second failure |product execution-deadline07:53:28.727Z,limit30000, epoch2Program1/0,checker0; not another measured OOM |
| termination |thread2 terminate-called07:53:29.832Z, exit1.968Z; explicit shutdown path, not a spontaneous crash |
| closure |shutdownack/exit0, no external interventions, sampled owned processes CLOSED; two remaining SQLite DB integrity PASS |

Node PID peak4084.27MiB includes Worker thread memory once; Native separate62.04MiB,
summed observed tree4144.93MiB (not PSS; individual peaks need not coincide). No
external resource incident. Heap limit is V8 isolate behavior, not the removed product
RSS policy. Heap occupancy immediately before OOM was not sampled; no invented
Program/AST/cache byte breakdown. Native cold catalog had not published when the
semantic failure occurred; no claim that Native success or failure caused the OOM.

This confirms an OOM for this candidate/run, not retroactively for Photos16/18.
Generic repeated fallback repair is valid but insufficient: public focused4files
10PASS/0skip, exact one-import/60-import stats11/11 vs baseline11/660. Native package
metadata/redirect control passes against both frozen pre-fix and fixed runtime.

### Real-content dependency-size control

Same fixed candidate, SDK, target, Node and limits; isolated fixed-path source copy
retains originals plus complete copy groups001..006 and all nonsource inputs. Source
manifest records every SHA256. 1944physical/1939eligible;1944run preparation23362ms,
SDK-partial terminal, first exact definition660.50ms, repeat292.06ms. Node peak1432.27MiB,
Native30.84MiB; normal closure and structural integrityPASS. Neither partialSDK nor
nonempty output is relabeled full semantic readiness/completeness. This reduces the
actual dependency content and has a different root path from original30K, so it is
NOT an unrelated-file controlled comparison nor evidence of a complexity class.

### Next repair boundary

The preparation path eagerly warms each semantic module closure before root SDK
qualification. phone_photos module's28902root closure (previous observed07) is a
single Program despite stable module groups. Interactive selection chooses that
same module closure. Recovery restores input/config state but not an OOM'd Program,
so the next local query redoes large construction and hits its separate30s cap.
SDK/retained syntax versus project AST versus proof metadata ownership still needs
measured attribution; source count alone is not the root explanation. Any semantic
partition must preserve global scripts/augmentations and actual imported closure;
full READY requires full coverage across prepared partitions, not only the queried
file. No such partition repair is yet claimed complete.

## Returned AST / heap bounded attribution, not a successful initialization

Run photos-source-attribution-04 uses the same30K/frozen runtime and SDK. A preload
wraps the exact installed createLanguageServiceSourceFile and counts after return,
without retaining SourceFiles (WeakSet only). Compiler bytes on disk stay frozen;
this in-memory instrumentation is diagnostic, separated from ordinary cold01.
At4000project callbacks the driver deliberately terminates its owned test session:
this is a diagnostic protection stop, stored as FAIL, not initialization acceptance.
Source callback counters are not all getProgram returns or fully admitted Program
coverage. Exact paths/repeated parse-by-path and retained size are not yet measured.

| Actual returned SourceFiles at cutoff | Callback/unique object | UTF16 units | Compiler nodeCount sum |
| --- | ---: | ---: | ---: |
| project |4000/4000|26392995|3531275|
| SDK |1580/1580|46930124|2371960|
| other (includes standard lib/external) |224/224|4215033|234582|

At08:15:53.440Z only2project callbacks/5998nodes plus254SDK/302252nodes had
returned, isolate used heap299.89MiB. At08:16:06.614Z the4000project boundary
reports used heap1309.08MiB/RSS1456.23MiB. It demonstrates actual AST/materialized
input growth inside the first Program, not just file enumeration or Native disk
work. Heap sample includes compiler baseline, SDK, project AST, caches and proofs;
these totals CANNOT be assigned bytewise to individual components or extrapolated
linearly to all30K. No new V8 limit or product timeout is used. Closed owned process
proof and SQLite structural integrityPASS after diagnostic termination.

Second same-path real-content control564physical/559eligible (originals+wholecopy003):
prepare12655ms, first exact definition258.72ms, repeat118.83ms, Node942.59MiB,
Native24.05MiB. Same SDK-partial terminal, not READY. The1939eligible predecessor
uses the same test root and keeps groups001..006; removed sources are archived
outside that control root, original30K untouched. The controls change dependency
content and are single samples, not a timing-complexity proof.

## Actual call-chain source anchors

Paths/lines below are the isolated worktree source paired with the frozen receipt,
not dirty root sources or an installed Zed release:

- src/lsp/run-language-server.ts:183 calls prepareInitialSemantics on initialized;
  src/lsp/initial-semantic-preparation.ts:6/17 requests semanticReadiness prepare=true.
- src/semantic/semantic-worker-proxy.ts:167 routes preparation; dispatch through
  host/supervisor, src/semantic/semantic-worker-host.ts:209 creates actual Worker,
  :244/:249 receive raw error/exit. Supervisor:383 wraps cause as worker-unavailable,
  preserving internal cause but the initialization log/public response prints only
  that generic error. This is why prior raw cause was not known.
- src/semantic/project-readiness.ts:32/34 prepares catalog then initial semantic
  groups BEFORE root SDK qualification at:48/:59.
- src/core/types/type-engine.ts:200; initial-semantic-contexts.ts:9/16/24 synchronizes
  each group's real compiler; semantic-groups.ts:77 discovers a group using the
  entire configured semantic-unit dependency closure's source roots.
- typescript-language-service.ts:326 measures actual compiler readiness; installed
  bundled compiler getProgram/synchronizeHostData/createProgram acquire actual
  registry SourceFiles. Diagnostic04 counts returned source construction here.
- first definition uses type-engine.ts:193 prepareInteractive, selecting the same
  module closure; merely recreating Worker does not change required construction.
- src/semantic/semantic-worker-watchdog.ts:27 defines unchanged180sprepare/30sordinary;
  check() classifies epoch2 execution-deadline; failure-recovery.ts:108 creates
  replacement under shared recovery policy. Explicit terminate is independent from
  the original raw OOM error/exit event.

ADR0019 explicitly forbids splitting a real module into fake projects and requires
all selected groups prepared. ADR0024's empty-project-root SDK context was for truly
partial membership. Complete metadata now makes the original implicit20K shortcut
inapplicable. A root-scope repair therefore needs explicit per-operation coverage,
ambient/augmentation/global and package-identity controls, plus aggregate full-ready
proof if preparation is partitioned. Lowering membership, returning invented READY,
or just skipping eager work and leaving the same huge first query are rejected.

## Whole-gate follow-through

Three directory safety tests were not reaching their injected enumeration after
retained complete-proof reuse. invalidate() removes the cached catalog; refresh()
without a prior catalog does not enumerate, while membershipFor() does. The tests
now explicitly call invalidate then membershipFor; container retarget is asserted
before unlink/restoration. Original partial/refusal/recovery expectations retained.
Whole membership file17PASS/0skip: membership-enumeration-final3.log. Earlier two
probe attempts and raw gate failures are preserved. No product safety check removed.

The20Kcompletion interval now separately proves20001noise sources parsed initially
and no unrelated reparse during interactive completion/details. It reaches those
checks, then the unfiltered case times out at its unchanged60s overall deadline
(2PASS/1cancel), reaching later global references. This is a remaining failure,
not a repaired whole-gate row or permission to drop references. Stage timing probe
is separate; other gate input/READY premise rows remain OPEN.

### Latest20K stage probe (unchanged60s)

completion-parse-interval-stage-diagnostic.log: fixture creation2914.54ms, complete
READY20738.14ms, interactive checks including Native progress waiting58905.07ms,
reference await returns around60003.19ms while the test is already cancelled.
No exact successful reference result is established by that timestamp. Setup is
only2.9s here; it cannot explain away the60s failure. The38.17s between readiness
and completed interactive checks mixes completion/detail work, awaited index
progress and symbol query. Those nested stages are NOT individually measured;
do not assign the entire interval to Worker compilation or to the parent queue.
Result:0PASS/1cancel/2filtered (diagnostic selection), preserved alongside the
whole-file2PASS/1cancel. No thresholds/assertions lowered; this row remains OPEN.

### Current closure / implementation ordering

The fallback optimization is implemented and its focused regressions are GREEN,
but actual30K remains unavailable. The initialization root-scope repair is still
IN_PROGRESS. First specify/test legal query coverage and global input retention,
then implement preparation and query scope together; changing only eager startup
would merely move the same OOM/deadline into the first request. Preserve full
member metadata, source/config final fences, independent SDK qualification,
correct cancellation/lease disposal and native completeness. An operation-local
Program must never be promoted to a full-project READY certificate.

Old full gate2470/7 remains the authoritative whole-check failure; three directory
probes have subsequent17/17evidence, but other gate rows and the actual30K repair
need new verification. No new whole-green, zero-gap endurance, Windows or UI claim.
No product timeout/V8/RSS/member thresholds changed; no commit/merge/deploy.


## SDK refusal ordering and operation-scope follow-through (2026-11-12)

These are additional protocol diagnostics, not UI or completed endurance acceptance.
Original full-gate 2470 PASS / 7 FAIL remains historical and unresolved as a whole.

- `photos-sdk-preflight-cold-05`: same 29995 admitted sources, SDK, default closure
  profile and unchanged limits. Handshake 6.047ms; real SDK-partial preparation
  completed in 13.042s. First definition still failed in 30136.84ms at the product
  execution deadline. Node peak2473.72MiB. Thus moving the known SDK refusal before
  project warming fixes the doomed initialization ordering, not local availability.
- `photos-sdk-preflight-current-control-06`: same frozen candidate/input, only
  existing interactive profile=current. Preparation13.138s, exact first definition
  1362.17ms, repeated354.54ms, Node993.36MiB. A diagnostic control, not an approved
  replacement for preserving globals, augmentation and native package ownership.
- `photos-operation-scope-cold-07`: frozen operation-scope candidate, default profile.
  12:40:59.956Z–12:42:22.623Z, handshake6.806ms, SDK-partial preparation49.950s.
  First query still FAIL: product30s deadline, Program starts3/returns2, checker2/2.
  The SDK Program and projected Program returned; the subsequent full-unit fallback
  did not return before deadline. Node1849.19MiB, Native63.05MiB, tree1900.50MiB.
  No observed OOM. All sampled owned PIDs closed; both SQLite databases integrityOK.
- `photos-operation-package-observation-08` adds a synchronous diagnostic-only dump
  to a COPY of that frozen bundle; timings must not be substituted for ordinary07.
  Returned projected Program:3roots/482sourcefiles. Its entire native package table
  contains one entry: parent-repository `node_modules/@types/node/ts5.6/index.d.ts`.
  The conservative package-canonicalization guard triggers full-unit fallback on
  that entry. This confirms the trigger, not proof that ignoring it is safe.

The test project is nested below the tool repository and inherits its automatic
TypeScript @types discovery. An outside-parent directory control is being prepared
with identical file bytes/SDK/limits; it is explicitly a path/environment control,
not interchangeable with the fixed-root timing series. Original failures retained.

### Correctness regression before accepting local scopes

Public framed child-process suite
`tests/semantic/partial-project-initialization.test.mjs`:13PASS/0skip, including
SDK compatible/refusal controls, unimported globals, module augmentation, watched
and unwatched global-role changes, compiler-time mutation rejection, native-package
canonical owner plus removal recovery, cold background diagnosis, completion/details
before Native progress acknowledgement, transitive external global augmentation,
and unsaved overlay-only globals. No whole-check green claim.

The last case first returned -32803 on a valid unsaved-only file: the new syntax
metadata mistakenly required a disk admission token before checking overlay
authority. Store-owned per-file overlay access now precedes that token check;
publication also rechecks overlay version/content authority. The public case is
GREEN and asserts no disk file was created and no Worker replacement occurred.
Raw RED/GREEN evidence: `operation-scope-overlay-only-red.log`,
`operation-scope-overlay-green-attempt.log`; tsc PASS in
`operation-scope-overlay-typecheck.log`. Original externally-loaded augmentation
probe initially had a lexical-vs-realpath URI oracle error, not a proven product
defect. Corrected physical-URI positive controls pass; no transitive defect claim
is inferred merely from static suspicion.

Remaining scope acceptance: all-overlay delivery boundaries, generation/configuration
re-preparation and native package fallback eligibility still need explicit proofs.
Qualified-SDK dense30K full preparation, complete references/rename and existing
whole-gate failures remain OPEN. No threshold, product cancellation or identity
check was relaxed. No merge/release/deployment.


### Outside-parent control and Worker/config preparation lifecycle

`photos-operation-external-root-09`: physical30000 source files copied with APFS
clone to `/private/tmp/arkts-30k-initialization-20261112/project`; every regular file
SHA256 matches the protected H36 input. Receipt `external-root-control-identity.json`.
Same SDK, frozen runtime and limits. Start12:51:21.668Z/end12:52:08.124Z; real
SDK-partial terminal39.366s; first/repeated exact definition3983.611/1725.232ms;
Node1022.78MiB/Native43.44/tree1063.44. No observed replacement/OOM; sampled PIDs
closed and SQLite integrityPASS. Relocation is a deliberate environment/path
control (including absence of inherited parent @types), not fixed-root success or
evidence of scale-independent queries. Sustained~1.7s repeat is still slow.

Public fatal-exit control then exposed another actual candidate defect: initial
scope metadata did not survive replacement, while the one-time initialization
consumed flag correctly did. Next definition rebuilt100projectfiles instead of4.
RED `operation-scope-replacement-red.log`. The parent now admits one shared root
preparation for the current actual supervisor identity/configuration, comparing
before/after generations so an old terminal cannot mark a replacement prepared.
Weak receipts do not keep retired supervisors alive; cancellation of one waiter
does not cancel the shared repair. Worker SDK-partial metadata preparation can run
again under normal budget policy; it does NOT restore initial pressure exemption.

Expanded test caught two newly introduced redundant preparation failures: repeated
READY/status generations advanced7→9 or5→7. A known compatible already-prepared
root now bypasses SDK-only resetting; original proof-identity assertions retained.
Final six-file suite53PASS/0skip (`operation-scope-recovery-expanded-final.log`),
tsc/buildPASS. This is targeted evidence, not a new whole check:fast.

A separate280-unacknowledged-open driver hit the documented32-record replay
buffer: records33, bytes330, buffer-overflow, changed-input half-open and exactly
one replacement; exact overlay definition still returned. Retained FAIL in
`operation-scope-recovery-whole-attempt.log`; its one-Worker expectation conflated
raw-text delivery with this independent burst guard. The paced raw-delivery test
uses real foreground round-trip barriers every16opens (no sleep or product-limit
change) and preserves the older unsaved global, exact source range and one Worker.
This paced success does not certify the original burst as restart-free.

Final frozen `operation-recovery-runtime-identity.json` includes source/installed
runtime hashes. `photos-operation-recovery-cold-native-10` is running on the
outside-parent byte-identical30K copy, waiting independently for the real Native
catalog terminal after first/local queries. Reused-cache control follows only
after owned processes close; no intermediate index is mislabeled a warm complete
cache. Original nested-path failure remains OPEN.
