> Latest: full gate FAIL2470/7/0skip, ended2026-11-12T01:38:01Z; unchanged2477inputs. Current initialization diagnosis: [phase report](2026-11-12-30k-initialization-unavailability.md). Historical RUNNING statements below are superseded.

# 2026-11-11: Functional closure after final index acceptance failures

This work reopens actual candidate gaps rather than declaring them acceptable.
Original scale37, density38, topology39 and Photos36 evidence is immutable.
Inventory: .bench/index-versioned-maintenance-20261104/functional-closure-20261111/initial-failure-inventory.json.

| Stable item | Deduplicated cause / current status |
| --- | --- |
| IDX-V1-FUNC-001 | Shared default20000path/4MiB membership truncation. Public30K RED reproduced; minimal separation now exact-output GREEN. Real Photos and broader regressions still required. |
| IDX-V1-SCALE-001 |16baseline first-definition failures from old configuration witness quota. Current candidate earlier repair exists; revalidate same cases after current changes, never alter historical baseline. |
| IDX-V1-SCALE-002/004 | Severe definition and global proof tails remain to profile and fix; same root cannot be assumed for queue waits, actual dependency growth and full-input validation. |
| Driver oracle | New function rename test queried imported local binding; correct local-alias edits failed the wrong global-export oracle. Corrected to export declaration with exact complete edit set; both attempts retained. |

Scale37 candidate65records:49PASS/16gaps/0FAIL; baseline64:40PASS/8gaps/16FAIL.
Density38 and topology39 are97/97 and145/145PASS, respectively, with their actual
fixed identities. Photos36 formal7264.739seconds completed but296full-scope gaps
remain functional failures to close. Its normal lifecycle is not full-feature acceptance.

Public regression on30003sources:
- RED: membership-public-red.log, exit1, references-32803.
- First post-fix: membership-public-attempt1.log, references succeed; rename oracle
  incorrectly demanded global changes from local-import rename, exit1.
- Corrected exact global export test: membership-public-attempt2.log, exit0.
  Instrumented references36311.07ms/rename26102.53ms; verifier plan has3candidates,
  one batch,3project source files (56total), while rename uses30003project files.
  Thus candidate count alone does not explain end-to-end cost. Do not sum nested
  compiler, proof and parent intervals. Ordinary controls/probe attribution pending.
- Full raw public transcript/server trace: membership-attempt2/large-default-membership.

Implementation changes only DocumentStore default metadata admission and its owned
catalog limit validation. Raw delivery256documents/8MiB, explicit admission limits,
physical/path checks, source read bounds, lifecycle and final fences remain.
ADR0045 is Proposed. Current product is NOT accepted; final previous2466PASS belongs
to pre-functional-fix source, not this new candidate. No deploy/merge/publication.

## Strict ordinary controls and real Photos initialization

Three strict original-driver replays are terminal PASS, each17operations with zero
limitations: unrelated30000, dependencies30000 and dependencies20000. Evidence:
functional-closure-20261111/ordinary-replay-execution.json and each ordinary result.
This closes only those exact functional cells, not Photos or performance. Ordinary
unrelated30K references first25.70s/repeat19.80s, rename first15.19s/repeat15.06s
remain severe tails. No longer count healthy membership refusal as success.

Real unchanged isolated Photos30K fresh-cache smoke01 FAILED the unchanged external
90s semantic-preparation observation: no terminal. Normal shutdown, no observed OOM,
Node RSS peak3103.55MiB. This is not proof of product deadline, deadlock or checker
stall. Independent CPU probe02 reproduces it; separate fresh cache and same input,
SDK and runtime. Both raw failures retained. Stable IDX-V1-INIT-001 is OPEN.

CPU probe Worker91.14s: initial-group preparation80.39s inclusive, getProgram/
synchronizeHostData77.88s inclusive; official readiness/checker observation phases
have zero sampled time. realpath self28.66s, read7.33s, lstat4.69s, GC4.50s, stat3.43s.
These nested inclusive intervals must NOT be added. Main thread mostly idle.
Detailed callframes/profiles: photos-initial-cpu-analysis.json and photos-init-cpu-02.

Confirmed narrower defect: initial-semantic-contexts calls measureCompilerReadiness
without the existing synchronous request-module-resolution scope. Configured public
LSP fixture with60SDK reexports probes the same missing relative candidate62times;
unconfigured control only1. New regression RED in initial-resolution-red.log.
Minimal fix enters the existing scope per leased group build, retaining genuine
load guards, source boundary checks, final uncached union, and no cross-request
negative cache. This addresses one measured repetition; real Photos90s failure
remains OPEN until exact replay, and remaining installedSourcePath/identity costs
must not be presumed fixed.

Genuine unsupported-source partial characterization passes old frozen runtime and
current membership-fix runtime (genuine-partial-* logs). It retains SDK warmup,
local correctness, global refusal, AST reuse and unnotified disk-change assertions;
this replaces only the obsolete assumption that file cardinality itself is failure.


### Initialization repair checkpoints

initial-resolution-green.log:9PASS. Configured60same-relative-import probes62to2;
unconfigured1. Actual original Photos smoke03 STILL FAILS90s. Its ps calls were
sandbox denied, samples0: resource peak and protection are UNMEASURED for this run.
Protected CPU04 repeats90s failure, normal shutdown, no observed OOM: Node peak
4123.64MiB/Native64.67MiB;91.19s Worker samples,74.75s getProgram inclusive,
realpath self27.50s. No checker reached in that sampling window.

A copied-worker counting diagnostic05 also fails90s and closes normally. At68000
relative-resolution calls:13432distinct keys,27095hits,39694misses while cache near
capacity, zero calls outside resolution scope. These counters are not syscall or
physical IO counts and can span initial groups; do not claim all misses redundant.
Raw relative-counts.json records keys and top repetitions.

Narrow regression now isolates capacity starvation:1600genuine prelude resolutions
before60same SDK imports, through real LSP initialize/query,122negative probes
(relative-capacity-red-attempt2.log). First probe without explicit project import
ordering passed; preserved. Bounded LRU implementation under verification keeps
existing1MiB, real load proof, per-importer boundary and final fence. No threshold
raise or new permanent negative-cache domain.


Final narrow LRU regression is verified against preserved pre-LRU runtime and current
ordinary runtime, same final fixture and same native-attempt observer. It uses1000
genuine nested SDK resolutions before the repeated target; no capacity/timeout
change. The observer now counts only the original .ets extension, separately from
.d.ets (the earlier broad regex double-counted both; raw failures retained).
Frozen pre-LRU final RED fails as required; current related suite9PASS/0skip.
Evidence: relative-lru-final-red.log, relative-lru-green-attempt3.log,
lru-final-sequential-execution.json. Intermediate too-small hot targets could fit
residual capacity and passed; private accounting diagnostics established why.
Do not relabel those intermediate probes as reproduced defects.

Real same-input ordinary Photos LRU smoke06 is running independently after the
final RED, with live resource protections and ps available. No result claimed yet.
Current pnpm check (TypeScript) PASS, functional-tsc.log. No new full check:fast,
Windows, realUI or same-source endurance acceptance has completed.

Partial-test migration is not all GREEN:21/23 initial migration cases passed;
unsupported-source source ordering caused two different legitimate readiness
reasons. Initial fixture migration now preserves partial SDK/root/AST checks.
The old capacity-only completion scenario is now tested as complete membership,
retaining20Kfiles/exact results/import details/narrow Program checks; it currently
FAILS its existing20s preparation window. This is an OPEN initialization tail,
not permission to shorten the project or extend timeout for a green check.


## Measured whole-Program amplification and cold read proof

Ordinary LRU Photos06 still FAILS the original90s terminal observation. Node RSS
4269.44MiB (~4.17GiB), Native64.66MiB; normal close/no observed OOM. Thus the two
resolution fixes do NOT close real Photos initialization. Diagnostic07 uses copied
instrumented runtime and unchanged input/SDK/admission/timeouts. It also fails90s
and closes normally. First phone_photos group alone has28902project roots, and
its Program enters with28904roots includingSDK. At last checkpoint24954project
and1804SDK files have actually parsed,130529155project and51145157SDK UTF16 code
units respectively. Program has not returned; checker entry never observed.
These are parsed text volumes, not heap or physical disk bytes.

That phase logs424518project/80657SDK/47794other realpath API attempts, plus
lstat/stat attempts; they are not distinct files or kernel syscalls. Relative
resolutions81371calls/39104hits/17970distinct keys. Diagnostic overhead means
do not compare its wall time directly to ordinary06. Source/SDK/IO domains and
top repeated paths are in photos-build-phases-07/build-phases.json. Do not call
this28K dependency closure: these are explicit group roots, not demonstrated
query-required imports. semantic-groups.discover includes every eligible member
under module closure source roots, then prepareInitialSemanticContexts eagerly
builds that entire group. This scope expansion is distinct from the fixed cache
misses. Literal ADR0019 whole-group prewarm currently causes this cost, not a
proven compiler loop. Any scope reduction must first prove ambient/global/module
augmentation coverage; excluding all external modules solely by import/export
syntax is unsafe. No such scope reduction is implemented here.

Official references checked after Context7 resolve failed with HTTP transport:
- https://www.typescriptlang.org/docs/handbook/2/modules.html : script globals
  differ from external module-local declarations.
- https://www.typescriptlang.org/docs/handbook/declaration-merging.html : modules
  can still augment other modules and global scope; external does not imply isolated.
- https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API :
  LS owns project state, DocumentRegistry shares compatible source ASTs; sharing
  does not remove root enumeration/type binding work. Installed ohos4.9.5-r10
  behavior must remain the final oracle, not assume upstream6.x identical.

A separate public302source case reproduces92duplicate cold physical identity
guards on46files, beyond Store's already guarded actual read. The new optional
internal readSnapshot transfers content plus that same descriptor-window identity
to LazySnapshots; legacy read-only ports retain old behavior. Bounds, actual
realpath/descriptor/byte guards and independent final/weak reuse checks remain.
Store shrinks1551to1541lines by extracting its regular-entry read responsibility;
it remains explicit over-limit migration debt, not permission to grow it.
RED/correctness evidence: cold-snapshot-proof-red.log, first post-fix failure
cold-snapshot-proof-green.log (duplicate guards0; unnotified-body recovery oracle
was too broad), then watched-source-admission focused11PASS in
cold-snapshot-proof-green-attempt2.log (25filtered cases, not36passed).
TypeScript check PASS. Unfiltered8file contract run is now active against its
1214source/test/script/Rust-input manifest; that manifest is not a full-repo or
full-check receipt. No new full fast or endurance acceptance claimed.


## Terminal expanded contract result and next repair dependency

Eight-file unfiltered suite finished exit1:97tests,92PASS/5FAIL/0skip. Full original
log and frozen input classification are cold-snapshot-contract-suite.log and
cold-snapshot-contract-classification.json. Runtime/product bytes did not change.
Four failures are a confirmed observer-driver error: lazy-source-read-counter
required the old exact generated read() statement and threw before Worker code
started. The supervisor's three bounded recoveries then stopped. This is not a
new product build loop. The observer now requires exactly one supported real read
entry, handles old read() and new readSnapshot(), and still measures actual bytes
and latency. Unfiltered retained-lazy rerun4PASS/0skip, including forced collection,
128/400/1024actual-root controls and zero unchanged body rereads. This is a separate
rerun, NOT a retroactive97PASS claim. Only that fixture changed after terminal;
all product/runtime frozen hashes remain identical.

The fifth failure is a newly exercised performance obligation, still OPEN: complete
unknown-symbol fallback performs full projectSourceNamespace final membership
refresh on every query. In the small complete catalog, actual directory opens
increase2to5over3queries. Responses correctly certify empty scope; this is not
truncation or a source-read regression. Earlier capacity-partial behavior refused
before this complete proof. Do not restore partial membership or remove the final
fence to pass the new complete-case assertion. Source read/concurrency/retarget
contracts and all explicit admission-limit tests in the expanded suite PASS.
The30003source complete-reference/export-rename regression alsoPASS, with
references34394.59ms/rename26285.74ms (instrumented fixture, not ordinary times).

Next ordered repair is prove a fast complete-membership final fence from actual
enumerated directory identities AND current known file identities, with unchanged
configuration/eligibility/managed-namespace/overlay ownership. Checking directory
stamps alone is insufficient for ordinary source body changes; checking old file
stats alone misses new names and symlink/ancestor changes. If any fact is unknown,
changed, overflowed or belongs to an injected/partial catalog, retain the original
full refresh. Preserve both load windows and independent publication checks.
No fast path has been implemented at this checkpoint; the failing public transcript
is the RED case. Further public body-only, create/remove, config/source-root,
managed-cache, symlink/ancestor-retarget and read-window counterexamples must pass.
This can remove re-enumeration, not prove full queries O(1) or omit necessary input
validation. Whole28K-root initial Program cost remains another OPEN dependency;
module-local files cannot be excluded without ambient/augmentation/import coverage.

Counter precision correction: diagnostic07 parsed values count official
createLanguageServiceSourceFile invocations, NOT deduplicated path counts or a
returned Program's sourceFiles count. Program never returned in that observation.
No unique-file count or binding/checker cost has been measured there. SDK shared
registry/cache reuse must not be inferred from those callback counts alone.

No full check:fast, current-source Windows/UI or new two-hour zero-gap endurance
has completed; historical IX22/Photos36 results are not current acceptance.
No source/SDK/timeout/V8/RSS-policy threshold was raised and no merge/deploy done.


### Complete-membership implementation and verified boundaries

The original complete-scope directory-open RED now observes2to2 instead of2to5.
A native complete catalog retains original namespace/file/configuration/managed
policy evidence and rechecks it before/after current known-file lstat; unsupported
or changed evidence falls back to full scan. Required actual input bytes still read
on every complete-answer publication fence. Stack probe disproved the test's
assumption that those96reads were redundant compiler loads:32inputs x3answers
are assertCurrentWorkspaceSources. Revised assertion requires exactly those reads
and zero extra compiler loads. Genuine partial prewarm still asserts0noise reads.
Body-only source edit control proves directory mtime unchanged, fresh definition
seen after safe admission, and restored empty result; unnotified directory delete
and new ambient declaration preserve first-stale-request refusal then exact recovery.

Initial38case run37PASS/1FAIL required diagnosis. The old probe now fired on a
failed retained old-proof check, earlier than the actual fresh catalog observation;
its mutation was safely admitted by the later real scan and returned fresh markerEnd.
Do not weaken the original -32803 assertion. Probe now targets actual safeLstat
sampling which mints the fresh catalog; added already-catalogued pre-after source
case explicitly requires retained-final-proof sampling and the same refusal.
Both controlled post-sample mutations reject; full39casesPASS/0skip in
complete-proof-contract-green-attempt2.log (source before lifetime-only correction).
The new timing-kind and full call stacks are in complete-proof-window-authority*.json.

Self-review found a real NEW implementation lifetime error before acceptance:
retained scope closure captured options.previous and linked all old catalog
generations. Public Store snapshot/control forced-GC RED retains8/8after8changes;
destructuring current ports/scalars instead removes the predecessor reference.
complete-proof-owner-red-attempt2.log and complete-proof-owner-green.log prove
8to0retained snapshots; all8read/identity/lifetime testsPASS unfiltered. First owner
probe had generated-script escaping failure and is retained separately. No product
GC/heap settings changed. Final rebuild/expanded tests/ordinary scale comparison
are pending on the corrected candidate; previous39PASS is not that final receipt.

### 2026-11-12 current complete-proof checkpoint (not final acceptance)

The revised candidate adds a conservative eligibility boundary: a complete
namespace witness is reusable only with actual positive BigInt directory inode
and nonnegative device identities. Zero/unknown IDs use ordinary full enumeration,
without marking the workspace partial or weakening source freshness. Public LSP
weak-ID RED observed2opens where5were required; current unfiltered combined
navigation/read-proof/read-window/retained-lazy regression:24PASS/0fail/0skip.
Logs: complete-proof-weak-identity-red.log, complete-proof-final-regression.log.
Current typecheck/build PASS. This supersedes pending descriptions above; the
previous full2466 gate is still historical, not a gate for these changes.

Same original unrelated30000 ordinary sequence:17operationsPASS, zero functional
limitations, normal close and database integrity PASS. One run per candidate,
not medians: refs25697.44->17955.61ms, rename15192.82->13451.07ms,
edit-first refs23755.88->22196.87ms. First definition2965.76->3450.86ms and
reopen completion3397.06->3577.28ms regressed; undo remains7010.49ms.
Independent sampled Node RSS peaks2210.96->2186.54MiB. OS cache uncontrolled;
these data do not prove all improvements are caused by one patch. Evidence:
unrelated-30000-complete-proof-ordinary.json and its result.json. Full SDK postflight
matches all3536sealed inputs; no SDK completeness or READY claim follows.

Real Photos role diagnostic10 used the ACTUAL installed compiler/options including
the sixth createSourceFile compiler-options argument, unlike raw-parser09.
29995eligible sources:29771clean external modules,7global scripts,217declared-node;
zero parse-uncertain classifications. Read20.264s + parse30.653s inside54.610s total,
172725345UTF16codeunits, Node sampled peak157.11MiB. Five ohosTest sources are
excluded by Node source eligibility but present in the Native30000source namespace.
This is classification evidence, NOT authority to remove roots: external modules
can import global augmentations, and full transitive dependencies remain necessary.
No classification-based product root reduction has been implemented. Source-role
manifest, source hashes, actual compiler options and resources remain in
photos-role-classifier-10; diagnostic09 grammar errors are NOT project errors.

Outstanding: actual Photos initial~28904root compiler cost, complete-query byte
proof and global rename costs, potential Native/Node namespace qualification
mismatch (hypothesis, not confirmed cause), full final checks, same-candidate
multi-trial scale and zero-gap endurance. Current protected Photos smoke11 records
its own run separately; it cannot inherit historical UI/endurance acceptance.

### Fixed-runtime follow-up

The24case focused regression was first run on shell Node26.3.0, then repeated
explicitly with /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node:
24PASS/0fail/0skip in complete-proof-node20-regression-attempt2.log. The first
Node20 command named a nonexistent retained-lazy-source-cache test and exited
without running tests; retained separately, not counted as product failure/PASS.
The actual test is retained-lazy-source-evidence.test.mjs.

Photos11 used shell Node26.3.0 and is marked ENVIRONMENT_DEVIATION_NOT_SAME_CONDITION.
Photos12 fixes Node20.19.5: initialization still lacks its semantic-preparation
terminal at the unchanged90s external observation boundary. Started16:47:47.278Z,
finished16:49:20.172Z; normal shutdown/exit0, no observedOOM. Sampled Node3861.53MiB,
Native64.03MiB, process-tree peak3924.52MiB. No first definition/refs/rename executed.
This is a real remaining candidate failure, not a timeout policy change, UI result,
or evidence that the earlier startup cost is fixed. Original sources and caches
preserved. Current expanded Node20 regression is serial and separately recorded.

### Expanded verification and remaining completion failure

Explicit Node20 serial13file suite finished47PASS/0fail/0skip in
complete-proof-expanded-node20.log. Public selected-body change, unnotified deletion,
config/source read windows, catalog eviction/order/cancellation, path aliases,
partial delivery and retained compiler snapshots are covered. This is not all tests.

The unfiltered completion-admission file still fails:2PASS/1FAIL,20004sources,
initialization has no semanticPreparation terminal inside its unchanged20s wait.
No completion action was reached in that case; do not attribute the failure to
completion execution itself. Native index became ready but semantic owner had
not completed; those are distinct states. Source cache promotion and unchanged
partial member completion controls PASS. The large fixture also has an untested
expectation that all noise files stay outside Program even during complete
initialization; this must be reconciled against real readiness coverage, without
weakening complete results or inventing successful partial scope.

Observer cost was a separate hypothesis: it captured/wrote an Error stack for
EVERY noise read. Stacks are now opt-in only for the32file publication-fence
attribution tests; every actual read and parse is still counted. Combined rerun
6PASS/1same initialization FAIL. Thus instrumentation reduction did NOT fix the
remaining product preparation cost and is not reported as its root cause.
Historical failed outputs remain. Complete-proof-verification-checkpoint.json
pins the unchanged production runtime and identifies the two test-only changes
following the47case receipt. Source/runtime remained frozen within each run.

Current stopping point is NOT acceptance: Photos fixed-Node20 preparation and
complete large-project initialization still fail; global query tails remain severe.
Next repair must address actual preparation/compiler scope and complete-query
cost with legal global/augmentation/dependency coverage, not remove publication
fences, reduce fixture cardinality, increase timeouts, or relabel gaps. Fresh full
check:fast and zero-gap endurance follow the corrected candidate, not historical
IX22. No external blocker is claimed; no merge/publish/deploy performed.

### Further actual duplicate-read fix, after the47case checkpoint

A new independent public302source measurement confirms another real repeated cost:
46cold lazy source reads are followed by46readiness reads of the SAME source bytes.
Call chain: guarded Store.readSnapshot -> TypeScriptLazySnapshots.loadRecord ->
actual registry acquire/observeCompilerSourceFile -> adoptCompilerSourceFile ->
OfficialReadinessState.prepare -> TypeScriptResidentReferenceState.observe -> safeRead.
The old weak lazy identity was not passed into the existing compiler read-facts store.

The adapter now hands that ORIGINAL guarded fact to the actual retained SourceFile
only after exact offered/actual snapshot, raw/generated text equality. Existing weak
read-facts owner stores original physicalPath/stamp; current identity/configuration/
coverage/root and final uncached union checks still run. No fullcacheclear, renewed
stamp, weakened final fence or extra strong AST/text store. Mismatch falls back.
Public RED46->0GREEN; exact definition and changed-input recovery assertions remain.
This is a separate product change after47PASS. Build/typecheckPASS; focused1PASS,
3name-filtered; expanded selected whole-file run underway, no whole-gate or real
Photos timing benefit claimed yet. Tests/logs and original failure retained.

Current provenance follow-up: five whole-file serial Node20 suite is terminal
26PASS/1FAIL/0skip (27tests,193.305s). The same20004file preparation20s failure
remains; all30003source exact references/rename and128/4608closure controls pass.
Instrumented30003case refs53469.97ms/rename38619.76ms are SLOWER than the earlier
instrumented sample; do not hide these or infer causality from differing runs.
No latency benefit is claimed from the proof-read count alone. The original strict
ordinary17op same-fixture/SDK/Node20 replay is now running to measure impact.

An additional controlled actual-registry-acquire/pre-provenance window changes
Dep299 after its original read. The initial preparation correctly refuses READY;
a real watched revision then permits READY and exact line1definition. Source/runtime
not changed, only the new regression added after expanded suite termination.
Focused characterization1PASS/4name-filtered; cold-source-provenance-window.log.
This verifies ORIGINAL facts cannot restamp the intervening disk edit as current.
It is fault-window testing, not spontaneous corruption or a UI reproduction.

### Ordinary17operation current result; performance not accepted

New source-provenance candidate ordinary30K replay:17operationsPASS,19requests,
0limitations/0findings, normal acknowledged shutdown/exit0, process closure and
SQLite integrity PASS, all runtime artifacts unchanged. Init28241.15ms; Node peak
2168.54MiB, Native57.14MiB, tree2223.09MiB. Baseline prior init26971.26ms/Node2186.54MiB.
First refs17955.61->25049.31ms; repeat18406.38->20428.09; rename13451.07->15301.52;
edit-first refs22196.87->24766.16; first def3450.86->3453.50; undo7010.49->7762.26.
These are one ordinary run each, same Node20/SDK/root/17op sequence but OS cache
uncontrolled: record a regression suspicion, not proof of causality or a speedup.
Exact table/source paths: source-provenance-first-comparison.json.

Private diagnostic control restores pre-handoff behavior in three actual Worker
bundles only, retaining all old guarded rereads/freshness fences, current rest of
runtime and Native. Its inert additional physicalPath metadata is unchanged; it is
NOT an installed old release or a product feature flag. Original library assets and
producer identity are pinned. First preparation failed because an unused copied
sdk-discovery-driver is older and lacks this block; preserved, no control session
started. Actual semantic/reference/diagnostic Workers contain the current block;
second preparation checks/reverses it exactly once per Worker. Current control
session is isolated/serial, results pending; source and production runtime frozen.

Controlled handoff-disabled diagnostic session completed17ops/zero-gapPASS,
normal shutdown/integrity and artifact checksPASS. New/control first refs
25049.31/23452.28ms; repeats20428.09/23702.80ms. The crossover does NOT establish
that provenance handoff caused the earlier apparent slowdown, nor a latency
benefit. This is still one trial per arm, OS cache uncontrolled. Immutable table:
source-provenance-diagnostic-control-comparison.json. Severe full-query tails remain.

Next independent SDK import slice public RED:60wrappers reexport one SDK module,
actual existsSync positive AND higher-priority negative probes122unconfigured,
244configured. Exact closed SDK definition is correct before the perf assertion.
This is a separate repeat-SDK-candidate problem, not the already-fixed relative
candidate LRU or whole-Program cardinality. Reuse is implemented only inside the
same synchronous query, in the SAME existing1MiB LRU budget; LocalPackageResolver
priority still runs, first SDK lookup records all actual positive/negative witnesses,
uncached final union still validates them. No cross-request SDK validity, new
threshold, unsafe whole-path case folding, or experimental verifier lease enabled.
SDK priority-creation/public guards and manifest regressions are running.

SDK cache first attempt only fixed LS lookup:122->62unconfigured,244->124configured;
this was still RED, not a pass. Remaining repeated calls come from the distinct
SDK-only auto-import Program builder (sdk-export-index.ts roots and resolveModuleNames),
which directly resolved each wrapper again. It now uses the same QueryModuleResolution
contract within its own synchronous build, and clears its local candidate metadata
on all exits. Original index.current/revoke, Registry release and physical admitted()
checks remain. The cache bound is1MiB PER compiler owner's active lookup; the SDK
export build now has its own transient owner-local cache. A cold nested auto-import
build may temporarily coexist with the LS cache; no claim of unchanged aggregate
metadata or lower RSS. No extra strong source/AST cache or product RSS policy added.

Second whole4file run9PASS/1FAIL: SDK candidates2/4positive AND2/4negative, higher
priority creation refusal PASS. Remaining manifest-only failure is an exact static
inventory: new test raises entries334->335 and bundle-e2e172->173. Both expected
inventories now updated, new assignment explicitly asserted; separate manifest
4PASS/0skip in sdk-candidate-manifest-green.log (do not sum overlapping runs).
Nine-file SDK/auto-import/Kit/runtime/global/selection regression is currently
serial on Node20; previous focused counts do not certify the new whole candidate.

SDK slice expanded final selected9file serial suite:74PASS/0fail/0skip,
103.632s, Node20.19.5. Includes SDK candidate and relative LRU/SDK input guards,
auto-import completeness, HMS/Kit resolution, ArkUI SDK symbols, runtime globals,
SDK selection and exact test manifest. sdk-candidate-expanded-node20.log.
Typecheck/buildPASS. This is not full check:fast, Photos/UI/endurance or a guarantee
of full default membership performance. Actual candidate identities pinned in
sdk-candidate-current-runtime.json; protected Photos14 ordinary run started after
suite terminal, no concurrent product tests or source/build mutation.

Architectural constraint for the next root-cost repair: existing
TypeScriptResidentReferenceState.inputsFor requires ALL membership paths plus
SDK/overlay/state paths, and covers() checks them against actual Program sources.
prepareOfficialReadiness also checks actual dependencies across its Program before
READY. Simply dropping external-module roots based on classification would violate
that contract, even with import/export syntax. Any scoped/partitioned preparation
must prove aggregate coverage and global/augmentation/transitive dependencies;
it cannot fake one complete Program certificate from a small Program. ADR0019
and existing full-query freshness contracts remain in force until explicit revision.

Photos14 actual ordinary Node20 remains FAIL90s: started17:38:47.601Z,
finished17:40:20.694Z. No semantic-preparation terminal; no frontend query reached.
No protection incident/OOM observed. Normal acknowledged shutdown/exit0, integrity
PASS; sampled Node3849.52MiB/Native62.10MiB/tree3877.12MiB. SDK candidate74PASS
is not a fix of the whole initial Program root cost. Full failure is retained.

Next confirmed hotspot: LocalPackageResolver.resolve re-loads physicalPackageRoot
for each declared dependency importer, despite existing original-path identity
cache. Old07counter common directory36620native realpath attempts (all callers,
not just this branch) is contextual; new small public60consumer fixture measures
122ACTUAL package-root value loads, separately excluding before/after/final guard
lookups. Exact closed-package definition is correct; countRED122vs1.

With configuration witnessing enabled, resolve now uses canonicalRoot(packageRoot):
existing8entry LRU, original observePath load provenance and per-query final current
proofs. No configuration witness means ordinary uncached realpath as before.
Eviction merely repeats guarded lookup. A positive physical-directory VALUE consumes
path identity, not sibling contents; manifest, entry physical containment/existence,
source byte/read-window and final checks remain. No whole path case folding or
missing-root fallback. Focused GREEN122->1; replacing whole package directory
refuses previous result -32803. Expanded local/installed package, group delta and
namespace recovery suite includes subsequent same-session recovery and is running.
This is not a claim to remove36619/all realpaths or fix Photos before measurement.

### Package-root candidate actual Photos16 and independent Worker18

Sixwhole-file package/local/installed/group-delta/namespace suite57PASS/0fail/0skip,
82.826s Node20, plus typecheck/buildPASS. The new replacement test proves first
old-proof refusal THEN same-session recovery to exact line1definition without
configuration notification/client restart. No-witness resolver behavior unchanged.

Actual Photos16 is still FAIL. First worker epoch1 initialization reports failed
at17:53:34.034Z after89486.56ms, generic Semantic worker unavailable. A replacement
worker thread2 is created17:53:34.287Z. Native30000catalog finishes17:57:55.509Z;
first definition is dispatched to epoch2 at17:57:55.620Z. Product30s execution
deadline at17:58:25.645Z interrupts it in PROGRAM:starts1/returns0/checker0,
synchronizationStarts1/returns0,activity174499. Public request2 returns -32603
Request textDocument/definition failed with message: Semantic worker unavailable
in30139.83ms. Request1initialize7.00ms, request3shutdown1271.56ms acknowledged/exit0.
Sampled Node4176.97MiB/Native80.94MiB/tree4240.14MiB, no external resource incident.
Normal closure and2DBintegrityPASS; this does not make the failed operations pass.

The original host error/exit handlers forward the cause but do not log it; the
supervisor wraps it as worker-unavailable. Original cause of epoch1 failure is
UNMEASURED, not OOM solely from high RSS. No claim of an infinite loop.

Independent diagnostic18 uses a parent-only Worker observer (original product
bundles/SDK/Node20 and all thresholds unchanged, no fault injection/CPU profile).
It samples actual shared program/checker counters and error/exit/terminate events.
It did NOT reproduce the epoch1 abnormal termination: no raw Worker error event.
External90s missing-terminal observation initiates normal shutdown; terminate is
called by shutdownSemanticWorker/FailureRecovery.settle/Engine.dispose at
00:24:03.411Z, then exit1 at00:24:03.814Z. Thus this exit1 is an intentional
termination, not proof of a crash. Stage at terminate remains program1/return0/
checker0,activity344490. ResourceLimits at constructor are unspecified(-1), requested
limitsnull; this is not a measured heap limit or a4GiBRSSpolicy. Observed18
started00:22:32.049Z/finished00:24:04.980Z, normal closure. Full raw events in
photos-worker-cause-18/worker-causes.ndjson, separate from original16 evidence.
Context7Node resolve failed transport; officialNode20Worker API consulted:
https://nodejs.org/docs/latest-v20.x/api/worker_threads.html . Error/exit/termination
are independent observables; no product fix claimed from this diagnostic.

Current root-scope preparation/first navigation and full global query tails remain
OPEN. A full same-candidate check:fast is next; original Photos36twohour/IX22gate
cannot substitute for new code. No merge/deploy/cache deletion orV8/timeout change.

### Fresh current full gate started

Full `pnpm check:fast` now RUNNING on fixedNodev20.19.5,
started2026-11-12T00:31:54.691932+00:00, exact2477tracked/untracked source inputs
sealed before execution. Source/runtime edits are frozen while it runs.
Controller and before/after hashes in functional-closure-20261111/
fresh-checkfast-source-provenance-sdk-package; raw stdout.log and execution.json.
The known20Kpreparation observation failure remains OPEN; a failed whole gate
will be diagnosed, not converted to an accepted baseline or skipped. Actual
Photos16 and distinct18 results above remain FAIL; no new zero-gap endurance/UI
acceptance or merge/deploy has occurred.
