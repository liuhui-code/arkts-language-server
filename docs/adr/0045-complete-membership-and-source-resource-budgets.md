# ADR0045: Complete project membership is separate from source resource budgets

- Date: 2026-11-11. Status: Proposed, implementation authorized; no independent review or Accepted claim.
- Issues: IDX-V1-FUNC-001, IDX-V1-SCALE-004; related ADR0019/0024/0030/0036/0043/0044.
- Scope update: user requires fixing remaining candidate functionality gaps and severe latency, not declaring known refusals out of scope.

## Evidence and conflict

Final format10 scale37 has129 cells:89PASS/24with gaps/16FAIL. Candidate65cells:
49PASS/16with gaps/0FAIL; baseline64cells:40PASS/8with gaps/16FAIL. These are repeated
observations, not40independent defects. All16baseline failures are large dependency
first-definition refusals from the old configuration-witness capacity; candidate
already has the ADR0044 repair, which still needs same-scenario revalidation after
new changes. Shared30K full-reference/rename gaps are NOT excused by baseline failures.
Photos36 has296full-scope gap records, not296independent defects.

DocumentStore truncates authoritative membership at20000paths or4MiB path metadata.
Both valid input sets become partial and cannot produce complete references/edits.
This is separate from source-byte delivery, compiler dependency closure and resident
Program lifecycle. Earlier ADR0043 plan excluded this limitation; this explicit user
scope update supersedes that deferral. Historical results and decisions remain.

## Decision

1. Default authoritative membership enumerates every eligible source. No replacement
   numeric default cap. The existing source-body chunk/delivery and residency policies
   keep ownership of their own memory and lifecycle. Metadata completeness cannot be
   inferred from how many source bodies currently fit in a cache.
2. Explicitly supplied admission limits remain validated and return true partial
   membership with the existing reason. Enumeration/identity/read failures remain
   incomplete. No unknown directory or file becomes a fabricated complete result.
3. Keep physical identity, symlink boundaries, unnotified change recovery, current
   content proofs, overlay authority, final fences, exact compiler result mapping and
   cancellation/supervision. Removing arbitrary metadata truncation is not permission
   to disable any of those checks or raise V8/timeout/RSS limits.
4. Compiler scopes and membership are distinct. Test full outputs beyond old bounds,
   retain scoped reference verification, measure actual large-project Program/heap
   behavior. Do not assume complete metadata alone proves safe/fast30K execution.
5. Failures from genuine unsupported inputs and explicitly constrained catalogs must
   retain their regression coverage. Tests that only manufactured partial membership
   using the former default cap must be migrated to real incomplete-input conditions
   or explicit-limit public-port coverage; no label-only green or assertion weakening.
6. Global reference/rename success is not established by nonempty output. Generated
   fixtures require exact complete locations/edits, closed late consumers, correct
   alias/export rename roles and fresh edit/undo states. Real Photos requires original
   input and request replays, resource evidence, and result-oracle strengthening.
7. Large latency remains open until ordinary/probe measurements isolate required
   validation from redundant work and show a measured improvement with all fences.
   Do not remove a final scan or cache valid=true merely to make the benchmark pass.

### Optional receipt admission must not starve actual observations (2026-11-16)

Same original30K input, SDK and closed isolated cache, frozen metadata-only control
has repeat definition11.17s and59504realpath calls; the pending-receipt candidate
has20.22s and211168calls. Instrumented figures are separate from ordinary timings.
Final query envelope is5.75s versus5.71s; preparation grows5.51s to14.66s.
This rejects blaming the additional cost on the final fence alone. The uninstrumented
candidate repeats23.57/19.64s cold and23.61/19.74s reopen. All return exact locations,
but this is a performance regression, not acceptance.

Pending native identities are optional speculation within the existing32MiB
request metadata budget. Long30K paths can fill it before actual configuration
observations, making later lookups repeat. A deterministic budget regression has
64configuration identities read117times within the same query. Required observation
admission now evicts unconsumed pending entries first, within the SAME budget.
Consumed identities, configuration observations and original load-owned proof facts
are not evicted. A discarded receipt falls back to its independent raw lookup.
No cross-request validity, new RSS limit, final scan removal or changed deadline.
The independent final union still reads all configuration and source facts fresh.

Tests cover starvation, consumed-entry protection, discarded raw fallback, failed
validators, cancellation cleanup and late same-length/mtime-preserving body edits.
This mechanism fix requires fresh public and real30K revalidation; a small budget
test alone does not prove the entire real-project tail fixed.

Matched real30K run39 confirms the mechanism: only request-input-validation.ts
changes from candidate35/37; same original input, SDK, closed cache and phase probe.
Initialization realpath818297to653952; repeat definition211168to59170,
20.22sto11.21s, exact location unchanged. First definition24.31sto14.76s.
Current final union remains5.75s, while preparation14.66sto5.55s. The added
regression is removed; the remaining11s tail is OPEN, not an acceptable-speed claim.
These are instrumented matched runs; do not present them as ordinary UI timings.

### Directory provenance also serves loaded regular-source metadata validation

The remaining run40 repeat has59170realpath calls,28460distinct paths;28056paths
occur exactly twice. Exact path counts show57103project-path calls and1612SDK-path
calls; sampled stacks identify LoadedConfigurationWitness.scan through lookupIdentity,
once during preparation and once in the independent final union. Samples identify
callsites, not exact per-caller totals. Actual source reads remain separate.

Extend the existing original-directory proof to this validation path. A successful
native membership owner can register its ORIGINAL directory-proof producer in the
synchronous request's existing32MiB metadata budget. This is not cached validity.
Observation reset before finalization discards all leaf/config/directory observations
but retains that original producer; finalization must recheck its directory identities
and newly lstat each leaf before/after. End/failure/cancellation clears the producer.
Native retains its independent raw file-token and namespace/configuration final fence.

Only previously loaded paths that the native proof identifies as regular project
sources are eligible. This includes an ordinary source-path fact of the package
resolver; its fact kind and recovery contract must remain ordinary. Exact original spelling,
physical parent, regular-file dev/inode and full mode/size/mtime/ctime are used to
reconstruct the SAME actual configuration identity and compare it to the old load.
No fact is restamped from expected values. Unknown/injected/unproven directories,
symbolic leaves, weak identities, configuration files outside those source names, unsupported/overflow
proofs and sources outside the native namespace keep raw lookupIdentity. Real source
loads keep all original descriptor/realpath/read-window guards. No new AST/text cache,
provider across requests, watcher authority, changed SDK qualification or relaxed fence.

RED: configuration-source-directory-red.log observes a per-source realpath where0
is expected despite proven original directory. GREEN safety24/24 after implementation
includes a later final owner changing a body after native finalization, same byte length
and restored mtime; it is still rejected by the independent source leaf guard.
Fresh native metadata also cannot authorize an older loaded source identity. An
unscoped later observation takes raw IO, proving producer lifetime ended. The first
cleanup oracle accidentally invoked validation twice outside a request; corrected to
one explicit capture/validation, with the failed driver evidence preserved.
Public LSP regressions and real30K counts/timing are required before acceptance.

Run41 experimentally limited the helper to regularSourceFacts (compiler namespace
classification); it passes152public/unit regressions but real30K repeat still59170
realpaths/11.24s. It therefore does NOT establish real-project improvement. Resolver
source-path proofs also use ordinary observePath. A separate RED uses that actual
port and observes1per-leaf realpath instead of0. The corrected applicability is native
regular-source membership, not changing ordinary facts into recoverable namespace facts.
The regression requires retained ordinary configuration factCount to remain1 even
when source namespace facts are excluded. Safety/lifetime33PASS follows the change;
fresh public and original30K validation still required. No adoption claim based on run41.

Corrected ordinary-path candidate has33safety/lifetime and102public-LSP regressions
PASS, zero skipped. Run42 confirms repeat realpath59170to3658; same source inputs,
SDK, isolated cache, Native and exact definition. The added witness probe captures
a stack for each independent owner and thus perturbs timing; its11.58s is NOT an
ordinary speedup claim. Witness snapshots identify many2-fact ordinary path owners
through ScopeDependencyGraph.currentNodes, preserving their non-namespace classification.
Run41's no-improvement result and run42's probe overhead remain evidence. Required
next: ordinary cold/reopen timing, full Native terminal/integrity and current full gate.

### Reuse composition traversal, never replace child or final proofs

The public projected-scope transcript measures three dependency-graph traversals
per unchanged navigation: preparation, the same query's enclosing scope proof, and
independent finalization. Child witnesses already register with the existing input
union. Repeating their traversal in the same synchronous query contributes no new
facts; adding a graph as another final owner would instead duplicate final scans.

memoizeRequestInputComposition shares only a SUCCESSFUL traversal keyed by graph
object plus its monotonically versioned graph/binding topology. This is existing
query-phase proof sharing, not cross-request or cross-await validity. All physical
child owners remain registered; the enclosing scope still performs its normal final
validation. Finalization never consults this memo and clears it before scanning.
No aggregate final owner is added. Failed traversals and changed topology versions
execute again. Budget exhaustion falls back to traversal under the same32MiB quota.
The graph checks cancellation even on a memo hit. Applicability is immutable child
fact sets between graph/binding revision changes; this API must not wrap arbitrary
mutable predicates or facts that append without advancing those versions.

Public LSP RED graph-composition-public-red.log observes3instead of2 actual Map
iterations and exact correct type definitions. GREEN whole12-case scope suite has
zero skips, iterations2and unchanged correctness across edit/undo, missing namespace,
ambient introducer and package cases. Additional lifetime/late-body/epoch tests and
expanded public regressions are running; no new real30K timing or full-gate claim yet.
Actual reads, raw native final leaf checks and independent final source checks remain.

### Reuse immutable source-role topology across body-only edits

ProjectOperationScopes previously replaced the ProjectSourceRole object after any
content-key change. ScopeDependencyGraph intentionally compares role identities;
this rebuilt the full graph even when its dependency metadata did not change.
Public hover RED records cumulative graph constructions2,3,4 over number→string→
number edit/undo. Do not confuse this with Program reuse or cache-result validity.

Retain the previous role only when its dependency digest AND ambient, opaque,
dependencyFree flags match the freshly parsed role. The digest includes import,
reference, global and export summaries; new role fields must be covered before
reuse. Still store the new content key and advance operation revision. Compiler
Host inputs and final current-document/source fences remain unchanged. Disk/path
proof changes still invalidate bindings; this decision does not authorize saved
file freshness reuse or validity across requests. No new AST/text cache is added.

GREEN whole public scope13/13, zero skipped, observes cumulative2,2,2 and actual
hover number/string/number. Existing import/global/augmentation/namespace/edit
cases remain required. Latest graph-composition candidate156/156 expandedPASS;
body-only edit candidate expanded157/157PASS, zero skipped. Original30K protocol46
edit9485.55ms and undo8907.18ms versus45's13622.57/13621.06ms (single matched
observation, not multi-round median). Exact results, no Worker replacement, full
Native30000/30000 and DB integrityPASS; stillSDK-partial. Repeated navigation
24189.75ms includes15442.23ms parent wait behind already executing diagnostics,
per body-role-repeat-tail-causality.json. ADR0027's no in-place preemption boundary
still applies; no priority claim or hidden change to that contract. Original20K
reference5s failure remains; new fullcheckfast is running, not yet passed. This ADR
remains Proposed, not a fabricated independent review/Accepted decision.

Ordinary cold43 reaches Native30000/30000 ready with a structurally valid1.70GiB
catalog; warm44 Native terminal about4.81s while Node semantic preparation94.71s.
Run45 edit/undo/close/reopen returns exact navigation but13s edits,24s completion
and one25s repeat remain failures of the experience target. SDK target20/24 mismatch
still blocks full semantic readiness; Native readiness does not override it.

### Rejected membership is an invalidation hint, not cached validity

A final native predicate could reject a late excluded-source edit without notifying
its cached snapshot. The next request captured revision2 before scope admission
refreshed to3 and was unnecessarily rejected again. A rejected native proof now
retires monotonically and cannot lend directory authority or rearm. Before either
open/disk preparation starts its document transaction, refresh a known retired
snapshot with actual enumeration. Absence of this hint never authorizes a read;
normal query/final checks remain. Cancellation throws before recording physical
failure; no watcher/timeout inference or Program eviction is introduced.

Native membership no longer depends on the entire package-resolver epoch. An
unrelated package lookup rebase invalidated a query's already observed member
proof despite unchanged eligibility. The actual immutable project-model identity,
original raw configuration capsule, managed-source generation, physical containers,
names and leaves still determine validity. Selection replaces the model; changed
configuration cannot pass its old capsule. No identity or final fence is removed.
Diagnostic four-package contrast and original whole26-case public suite PASS;
70-case membership/recovery/probe regressionPASS after cache accessor extraction.
SourceResetAdmissions and its configuration contract are unchanged. This is not
cross-request cached-valid=true or authority to restamp old load facts.

Historical whole gate2542/2527PASS15FAIL is retained. Above repairs are after that
freeze; catalog-window and original20K deadline failures plus fresh whole/real30K
validation remain open. ADR remains Proposed without invented independent review.

## Alternatives and verification

Raising20000 to another number only moves the failure. Keeping partial and relabeling
it success violates completeness. Disabling freshness or silently omitting edits is
rejected. Moving all bytes into an unbounded eager cache is also rejected: full path
metadata does not require eager source-body duplication.

First public regression:30003sources with long paths exceeding former metadata-byte
capacity. Initial old candidate returns-32803. Minimal membership/resource separation
returns all references and exact exported-declaration edits. First post-fix test had
an oracle error: renaming an imported local binding preserves the export via an alias;
querying the export declaration is necessary to test global export rename. That failed
attempt is preserved, not blamed on the product. Corrected testPASS, but instrumented
references36.31s/rename26.10s are not acceptable completion evidence for performance.

Required closure: explicit partial/read-error regressions, same20K/30K generated
scenarios with zero candidate gaps, real Photos full-scope replay and correctness,
severe-tail analysis/fix, necessary full checks and new same-candidate mixed endurance.
No merge, publication, deployment or cache deletion is authorized by this ADR.


## Measured initialization reuse extension (2026-11-11)

Current Photos full-catalog initialization still misses the unchanged90s external
observation after metadata repair. This is an OPEN failure, no evidence of OOM;
protected CPU run04 Node RSS4123.64MiB, Native64.67MiB. Ordinary run03 has no usable
resource samples because sandbox denied ps; do not claim its memory protection or
peak. Initial group Program construction dominates, not sampled checker execution.

Two measured repairs retain ADR0036/0039/0044 freshness contracts:
- Enter the existing synchronous module-resolution/validation scope for each
  initial leased Program build. Actual loads remain before/after witnessed, final
  union uncached, no cross-request negative cache. Public60reexport probe62to2,
  nine related public regressions GREEN, including later higher-priority creation.
- The relative-candidate cache previously stopped admitting new entries forever
  when full. Retain its existing1MiB accounting budget, but evict least recently
  used entries to admit later hot candidates. Key/SDK/compiler options/owner remain
  scope-owned; importer-specific physical boundaries still execute every time.
  Eviction removes reuse metadata only, never load-owned witness facts. Original
  failure: public genuine1600resolution prelude then60same imports causes122probes.
  First saturation fixture omitted project import ordering and passed; preserved
  as an unconfirmed probe, not retroactively called a reproduced failure.

No timeout, source admission, V8 or RSS policy is increased. This is not proof all
Photos Program/IO costs are solved. Re-run ordinary real input and final necessary
checks before acceptance.


## One admitted read owns its cold snapshot identity

A public302source fixture observes92extra realpath attempts from cold-snapshot
diskIdentity guards on46files, in addition to the actual descriptor-guarded Store
read. The same stable source load can supply both content and its read-owned
physical/stat identity. An optional internal ProjectFileAccessPort.readSnapshot
returns that pair; old read-only ports keep the existing independent guard path.
A failed proved read never silently falls back to a new differently timed read.

The Store still validates current catalog token, regular-file eligibility, physical
root/realpath before and after read, opened descriptor identity, actual byte count,
size/time/descriptor/named-entry equality, UTF8, cancellation and source-size limit.
Only then can it derive the same identity stamp used by later independent weak
snapshot validation. No source proof or validity is restamped from a cache hit.
Loaded SDK/configuration witness rules and final publication fences are unchanged.
This extends load-owned provenance from ADR0044, not a conflicting cached-validity
shortcut. Existing trusted ports implementing only read() remain compatible.

RED: cold-snapshot-proof-red.log. First post-fix attempt proves redundant guards0
but assumed unnotified ordinary body changes would automatically be admitted by
the very next request. That is distinct from namespace recovery: refusal cannot
authorize silently renewing an old source fact. The focused test retains refusal
of stale location, then delivers an actual watched revision and checks exact new
location. This does not claim missed-body-watch automatic recovery is solved.
Initial focused run11PASS/25name-filtered; broader unfiltered contract run pending.
No whole-program or real Photos90s improvement is claimed from this narrow repair.


## Complete-membership final fence without repeated directory enumeration

A complete native enumeration may retain its original directory observations, exact
ordered names and disk tokens, eligible-source configuration capsule, physical
source-container observations and managed-namespace generation/identities. Every
use independently verifies configuration/policy/domain, all observed directories,
every known regular file token, then directories and scope again. No directory
stamp alone authorizes unchanged file bodies. No stored token is a current validity
answer: file lstat is executed anew, realpath/directory identities rechecked and
configuration uses uncached immutable original facts. Actual source-byte publication
fences, descriptor read windows and compiler input checks still execute.

Only complete native catalogs with provable eligibility get this path. Injected
enumerators, partial or failed scans, container-proof overflow/unknown identity,
changed overlays/names/tokens/configuration/managed policy, errors and cancellation
fall back to the existing complete refresh. A failed proof cannot mint a new valid
epoch. This removes redundant directory entry enumeration; it remains O(known files
plus observed directories) metadata verification, not scale-independent queries.

This is Node semantic Store membership, not a change to ADR0034/0042 Native index
construction, publication or full-scan qualification. ADR0039's directory-content
LRU still does not cache cross-request file validity. The required original catalog
tokens here are baseline evidence and checked fresh, consistent with ADR0044.

Public RED directory opens2to5 across3complete unknown-symbol queries becomes2to2.
The subsequent body-read assertion had conflated compiler rereads with mandatory
publication reads. Actual stacks show assertCurrentWorkspaceSources; test now
requires exactly32actual input reads per answer, zero extra compiler-body reads,
with unchanged directory-body edit and namespace delete/restore correctness.
Do not remove those reads to advertise an improved latency.

Read-window controls now distinguish a rejected old-proof probe before a real scan
from the authoritative fresh catalog sampling. Original post-sample refusal stays
unchanged; an additional already-catalogued control requires the retained final
fence to execute and reject its own after-sample mutation. Full39case suitePASS
without skips before the subsequent lifetime correction.

Lifetime: a new proof must NOT capture scan options containing previous catalog.
Public snapshot WeakRef/control forced-GC regression demonstrates8old generations
retained before correction and0after. Destructure only current scalar limits/ports;
no previous-entry chain in the retained scope closure. Same-root catalog replacement
and Store disposal keep ownership bounded; RSS immediate decline is not the oracle.
Eight unfiltered Store read/lifetime regressionsPASS. Broader final candidate checks
and ordinary30K comparison remain required; no whole-goal acceptance claim.

Directory identity eligibility: complete-proof reuse requires positive native
BigInt inode and nonnegative device identities on every observed directory.
Weak/unknown IDs fall back to complete enumeration, preserving functionality
and all publication fences. Public weak-ID RED2vs5opens is GREEN in the
unfiltered24case final focused regression; no Windows实机 claim.

## Actual compiler SourceFile may consume its original admitted read provenance

A second public302source RED shows46actual lazy files each read AGAIN by
TypeScriptResidentReferenceState.observe during preparation despite already having
an admitted descriptor-guarded read. The LS registry observer can associate the
original identity with the actual returned SourceFile ONLY when the offered and
actual snapshot text, SourceFile text and original RAW source text match. It records
immutable read provenance in the existing weak CompilerSourceReadFacts store;
no new current stamp, semantic coverage or READY authority is invented. Unknown
ownership, transformed/mismatched text or missing guarded identity retains fallback.

Readiness still checks the current physical/full identity against that ORIGINAL
stamp, configuration, Program coverage and root equality; final independent union
and publication checks remain. A changed source does not become valid through the
handoff. Same-version registry adoption remains supported, with actual retained
snapshot ownership. No separate strong text/AST cache is added.

RED cold-source-provenance-red.log:46extra actual readiness reads. GREEN
cold-source-provenance-green.log:0; same302sources,46actual cold reads and exact
closed definition, unnotified edit refusal/current location plus real watched
revision recovery. This focused run has1PASS/3name-filtered, not4PASS.
Expanded verification and ordinary Photos impact pending; no timing claim.

A controlled source mutation after actual registry acquire but before provenance
handoff rejects initial readiness; real watched input revision recovers READY and
exact shifted definition. Expanded selected suite26PASS/1remaining20KinitFAIL,
new window characterization1PASS/4filtered. Ordinary performance still unqualified;
30003instrumented query timing worsened versus a previous sample and is retained.

## Query-local SDK module candidates share the existing bounded lookup cache

SDK module lookup previously re-ran identical Harmony candidate priority and
physical-boundary probes for every importer. Public60wrapper RED records122/244
positive and122/244negative candidate existence probes (unconfigured/configured).
A separate SDK key domain may share the EXISTING1MiB query-local candidate LRU;
no additional memory budget or indefinite cache is added. Local package overrides
retain priority on each importer. First SDK resolution still executes original
load guards, absence facts and physical SDK boundary checks; the full uncached
query-end union validates those originals before publication. Cache scope and
configuration belong to the same engine/query; finally clears it on all exits.

This is distinct from the32-call official TS fallback cache, whose original count
and32directory bounds remain unchanged (ADR0015), and from cross-job experimental
verifier SDK lookups, which are not enabled here. Relative and SDK namespaces are
separated by a NUL prefix impossible in physical filesystem path keys. Capacity
LRU eviction just repeats safe ordinary resolution, never drops proof facts.
New higher-priority SDK source creation must reject the previous negative proof;
SDK-partial remains a layered status, no incomplete result is promoted to success.
Verification/real Photos effect pending, not pre-certified by prior measurements.

Implementation boundary correction: the first SDK lookup repair left the separate
SDK export Program's direct lookups unchanged (measured62/124remaining), so that
attempt was RED. The SDK export owner now applies the same contract around its
synchronous build and existing current/revoke fence. Its transient cache is1MiB
per-owner; a nested cold export build can coexist with the LS cache. Thus earlier
wording about no additional budget applies to sharing LS relative/SDK entries,
NOT an unchanged aggregate metadata bound across two distinct compiler owners.
No RSS/V8/timeout/admission policy changed. SDK export sources/AST ownership and
Registry leases keep their existing lifecycle; only lookup metadata is transient.
Public repeated-priority probes now2/4 with later ETS creation refusing old results.

## Declared package physical-root values retain original identity, not directory contents

Local package resolution may reuse its existing canonicalRoot physical value for
packageRoot only when configuration witnessing is enabled. The existing8entry
LRU and original observePath facts own this value; final uncached resolver/config
validation still verifies original path identity. No-witness callers keep live
uncached resolution. LRU eviction repeats an ordinary guarded load. This consumes
physical path/containment, not an enumeration of sibling contents, consistent with
ADR0039; package manifest and actual entry/source validation remain separate.

Public60importers: actual value callback native realpath count122RED ->1GREEN,
with exact definition and unnotified whole-directory replacement refusal. Guard
calls are intentionally excluded from this value-load metric, NOT removed.
No new memory/admission/timeout/RSS policy or lowercased path identity. Expanded
same-session recovery and legacy/installed-package contracts remain required.

## Exact witnessed compiler fallback within one synchronous query

Missing SDK candidates still require the installed compiler's ordinary fallback:
SDK absence alone does not forbid packages under node_modules. After the official
32-call lookup cache stops admitting resolutions,60same-directory missing imports
performed660actual stat probes, compared with11for one importer. The already
witnessed negative answer can be reused during this same synchronous query.

Retain the exact native resolved-module object, including package identity and
extension flags, keyed by containing directory and module name within the compiler
owner/options. Reuse only when configuration/input witnesses exist; legacy hosts
keep ordinary resolution. Share the existing1MiB LRU with SDK/relative candidates,
cleared on exit. Do not retain failed-lookup arrays, alter lookup order or skip
Node package fallback. First actual positive/negative load witnesses and uncached
final union remain authoritative. Native same-package-version redirection and
different-directory/version resolution are characterized through public LSP.

RED: fallback-saturation-baseline-red.log (one11,sixty660); GREEN11/11 and
post-lookup creation rejection. Native frozen-pre-fix metadata control1PASS;
whole related SDK/input contracts10PASS/0skip; typecheckPASS. Evidence under
functional-closure-20261111/initialization-breakdown-20261112. This local reduction
does not establish Photos30K availability or settle the seven whole-gate failures.

## Known SDK refusal precedes project Program warmup (2026-11-12)

Status remains Proposed, authorized implementation, not independently Accepted.
Original30K cold01 records raw ERR_WORKER_OUT_OF_MEMORY at96.4s while constructing
the first entire module Program; the already selected SDK was target-unverified.
The root readiness predicate would return SDK-partial before asking for a Program,
but initialization had already eagerly warmed every semantic group. The order
therefore caused whole-project allocation before an already known refusal.

Extend ADR0024's SDK-only preparation boundary to **known SDK input coverage
refusal**, independently of membership completeness. Reuse exactly the existing
SDK predicate: identified/ready SDK, full ambient profile with supported component
root, compatible target when configured, and no component issue. This is not a
new qualification rule, cached valid flag, project-size gate or input waiver.

1. Prepare the original root owner with empty explicit project roots and no project
   raw documents; keep full membership metadata. Inspect its SDK condition without
   synchronizing an additional Program merely to check the condition.
2. For known SDK refusal or truly partial membership, synchronize this SDK/standard
   library context. Shared SDK Registry syntax/pins remain prepared, project anchor
   and unrelated source bodies are not introduced as compiler roots.
3. For complete membership and eligible SDK, retain existing full selected-group
   preparation and official root certification. Do not replace unknown project
   dependency failures by a synthetic SDK refusal or omit their validation.
4. The final report remains SDK-partial (no full coverage/readyCapabilities) for
   known SDK refusal. Same-session explicit project/SDK repair can use existing
   complete preparation to reach real READY. Initial pressure exemption consumption,
   ordinary recovery budget, cancellation, source and configuration fences unchanged.

This narrows0019's eager group warmup only when the existing SDK condition already
precludes its full READY result. It does NOT replace its all-group preparation for
qualified SDKs, or declare30K complete references/rename fixed. It does not solve
the separate first-query full-module scope; a pure shift of the same giant build
into navigation is expressly not acceptance of this repair.

RED public SDK-unverified configured98-source fixture parses96unrelated sources
before returning partial. GREEN parses0of them while retaining98namespace sources,
unused SDK syntax exactly once, real definition and post-configuration READY in
the same Worker. Compatible SDK control retains96prepared sources/full coverage.
Initial expansion caught an added unnecessary SDK-only synchronization (3/5actual
SDK probes vs original2/4 bounds). Fixed via pure preflight, not widened assertions.
Whole7files62PASS/0skip, tsc/buildPASS. Actual30K cold/first-query test is separate
and required; no new whole-gate green or UI acceptance inferred from these results.


### Candidate: syntax-backed local operation scopes under SDK refusal

Implementation experiment, still subject to the existing Proposed decision status
and acceptance evidence; no reviewed/Accepted history is fabricated. It extends
SDK-partial operation handling, not a replacement for ADR0019 complete qualified-SDK
initialization or ADR0024 honest incomplete-membership behavior.

Keep the actual module/dependency-unit identity and complete membership. Build
source-role metadata using the installed compiler parser, retaining no AST/binder
or full body. A local scope includes the query/open roots and legal global/module
augmentation contributors. Configuration, namespace and source/overlay authority
must remain current at the actual publication boundary. Background diagnosis and
completion/details must use the same selection, rather than accidentally resetting
the root owner to every project path. Incomplete auto-import coverage remains
explicitly incomplete; no truncated complete reference/rename result is allowed.

Native package-id canonical ownership is a correctness barrier: root removal can
change the compiler's first physical owner even with equal package versions. The
current conservative experiment retries the complete semantic unit when the actual
returned Program has native package entries, including cached resolutions. This
guard is not to be deleted simply for a faster benchmark. It is too conservative
for the inherited automatic @types/node entry in actual30K07/08 and currently makes
that first query fail the unchanged30s deadline. Acceptance requires a positive
proof of safe native-package ownership, or another complete design; merely ignoring
a baseline entry is not yet approved.

An unsaved-only source has no disk token by design. Source-role metadata must read
the Store's actual overlay authority before requiring disk identity, and publication
revalidates it. This does not authorize bypassing256document/8MiB raw delivery limits,
serializing every editor buffer, or reading a shadowed disk body as authoritative.
Boundary tests beyond raw delivery and recovery/configuration generations remain
necessary. Syntax-only direct classification is not asserted to prove every
transitive external effect; current positive controls preserve external augmentation
and canonicalization, with broader negative-scope proof still under review.

Alternatives rejected for now: blindly current-file-only (can lose globals and
augmentation); global threshold increases; deleting native identity validation;
pretending SDK-partial equals READY. Metadata work is proportional to the admitted
source namespace on cold preparation and still needs measured limits/lifecycle
proof; no scale-independent initialization claim is made.


Recovery invariant: operation-scope metadata is required semantic preparation,
not the lifetime of the initialization-only memory-policy exemption. A completed
SDK-partial root may reconstruct metadata after actual Worker replacement or
configuration change under ordinary policy. Parent preparation receipts bind the
actual supervisor object/configuration, before and after preparation; stale
generation results cannot mark a new Worker prepared. Store weak receipts rather
than retaining retired supervisors. All callers wait on one shared task, with
caller cancellation detached from its owner. Already compatible prepared root
proofs must remain unchanged under repeated explicit readiness requests. Public
RED100vs4 and proof-generation regressions preserved; final53PASS is targeted
evidence only. Existing ADR0020 recovery budgets, ADR0023 cancellation and
ADR0019 readiness qualification remain in force.


### 2026-11-15 refinement: positive native-package omission proof

Proposed refinement under implementation, not a new Accepted review. A public
configured SDK-partial fixture with one automatic ambient type package returns
correct definitions but builds101projectfiles instead of5. Evidence:
`operation-scope-automatic-types-real-root-red.log`. The preceding first probe
installed @types below the source folder rather than the project type-discovery
root and was an invalid setup; retained separately, not product evidence.

Do not whitelist @types or suppress the package guard. Capture the actual pinned
compiler package-owner table from the completed SDK-only baseline. An operation
may avoid full-unit fallback only if its returned table exactly matches that
baseline AND every omitted member has a current positive dependency-free syntax
proof. Imported/exported modules, import types, require/dynamic import, references,
decorators/ArkTS structs/JSX or helper-import options are not certified by this
first proof. Unknown compiler shape also falls back. Final source/config/overlay
fences still reject an omission that changes during construction.

This preserves canonical first-owner behavior: removing only dependency-free
external modules cannot introduce another package owner; all potentially relevant
roots remain in their existing order. New/changed native package identities still
use the complete semantic unit. Equal package names without physical-owner equality
are insufficient. This first refinement intentionally does not certify Photos'
import-heavy omitted modules; a resolved dependency-closure proof is a separate
required step before claiming its nested-path fallback cost fixed.

### Dependency influence graph refinement (implementation WIP, 2026-11-15)

The new cold public typeDefinition control returned an empty result for a global
introduced transitively through an unopened package. The earlier definition-only
control hid this through its complete-unit fallback. Evidence:
`scope-cold-transitive-type-red.log`. The95 predecessor is not sufficient acceptance
of dependency-aware local scopes, and no new READY claim follows from that suite.

Use the actual existing resolver for graph bindings, retaining each original
positive/negative lookup proof under its real lookup key. SDK-name lookups have
separate shared owners; pruning one importer must not lose another importer's
proof, and removed names must not remain permanent historical prerequisites.
Represent edges and source roles as primitive metadata, not retained Programs or
project ASTs. Recover global augmentation/opaque/native influence by reverse
propagation, cycle-safe O(V+E) for this graph operation; resolver and disk costs are
separate and must be measured. Preserve the relative order of all influencing
entry roots. SDK roots are appended after project roots by the actual Host. Do
not treat an SDK effect as already loaded before project roots: reverse global
and native influence propagation includes SDK nodes and retains every actual
importer chain. An unrelated module with no such influence can still be omitted.

Read external source roles with load-owned witnesses. Borrow a matching SDK pin
only when compilation bucket, exact name and freshly read text match; otherwise
parse transient syntax. This adds no SDK lease and retains no extra AST. Unknown
inputs authorize no omission: keep their importer chains and existing compiler
fences. Metadata is not permission to return truncated complete results.

Keep per-source roles and per-lookup owners across ordinary updates. Re-evaluate
changed bindings and source roles; prune unreachable external nodes and unused
SDK lookup owners. Input versions and graph/lookup revisions still invalidate old
request proofs; do not restamp an old cached answer as newly loaded. Windows graph
keys fold only the drive through existing path identity; actual names retain case.

The negative regression is strengthened from a harmless local Box import to an
actual native package import: the stronger graph may now prove the harmless
closure safe, but it must preserve full native-owner protection for a real package.
Existing same-version physical-owner a/c controls and full result assertions remain.

Context7 TypeScript resolve was attempted and failed at transport. ABI checks use
the actually installed pinned ohos-typescript4.9.5-r10 declarations/source, not an
assumed newer upstream API. This refinement still needs focused/full regressions,
scale/edit invalidation controls and the original nested30K replay before acceptance.

### Containing-file boundary and proof validation ownership

The graph's ordinary original-path30K replay20 still missed the product30s query
deadline before a project Program. Separate CPU-profile replay21 measured25.9s
inside query graph update, including13.8s in relativeModuleBoundary (inclusive,
overlapping samples). Repeated imports recomputed the containing file's physical
boundary before even checking a shared lookup cache. This is not compiler OOM.

Share one load-owned physical file/root boundary witness per containing file.
Do not substitute a parent-directory proof for arbitrary sibling source files:
an individual source can be a symlink. A changed witness rebuilds the boundary;
replacement/pruning advances lookup revision so an old request cannot adopt a
new owner's proof. Unused boundary owners are pruned with the graph's bindings.
Use existing request-local identity sharing for graph proof validation, followed
by the unchanged uncached final union. Do not bypass actual-load windows or share
validation observations across requests. The public framed-LSP three-import
regression measured3 boundary computations before repair and1 afterward; exact
type targets, unsaved import removal/undo and native ownership remain asserted.

This focused repair is not original30K acceptance: ordinary replay22 entered the
project Program but still hit the unchanged30s deadline. Record the selected
influence roots next; never remove global/native protection merely to pass time.

### Narrow proof for independent, already loaded SDK global declarations

Diagnostic23 observed21825/28902 legal roots selected solely by reverse global
influence, with no direct ambient or opaque role among those21825. Example:
UiUtil -> @ohos.window -> UIContext -> observer -> component/navigation.d.ts.
This SDK script contains global declarations and is already present in the
completed SDK Program. Blanket ignoring SDK globals remains unsafe: merging
declarations and overload priority can depend on file order.

Permit omission only for a plain SDK declaration script actually present in that
SDK Program, with fully known top-level global binding names disjoint from every
other file in the legal-root/SDK closure and the actual baseline libraries/types.
Collect global augmentations and UMD namespace exports as possible collisions.
Do not infer this from file names or an SDK whitelist. Unknown reachable effects,
unmodelled project imports or incomplete syntax summaries block this exception.
Merged or ambiguous domains retain their importer roots and original order.

The exception also requires the original complete SDK load/probe proof, including
source, type/lib lookup and negative namespace inputs, to remain current. Capture
that proof from actual loads without restamping it after parsing; retain primitive
facts, not a compiler/Program. Current graph reads include baseline libraries and
automatic types. Check this original proof again before publication. A changed
SDK input disables the exception; a later baseline must come from real SDK
synchronization. The broader project configuration proof continues to allow
ordinary project edits. Native package-owner protection is independent and stays.

The public regression is RED100!=4 before this exception. Adding a project
interface that merges the SDK global name must restore100; removing the merge
permits4 again. No foreign global or result is truncated. This refinement remains
under verification, including the original30K and real SDK, not accepted by the
focused counter test alone.

### Preparation fence handoff and complete baseline-source matching

Profile27 disproved the original-SDK-capsule hotspot hypothesis:182 retained facts
took11ms, while graph update took23.3s, mostly physical identity scans. The graph
was opening an early uncached union inside synchronous navigation preparation,
then the actual query necessarily ran its final union again. Use the existing
preparation scope to collect nested lookup owners and hand them to that query.
Standalone initialization without such a query still keeps its own union.
Do not carry observations across requests or remove the final fresh scan.

Public framed-LSP instrumentation reproduced early union scans for Augment/Main/
Unused0; after handoff there are none during graph preparation, including a new
lookup after an edit. Exact results and compiler-time mutation refusal remain.
Seven-file64/64 targeted suite is not original30K acceptance: ordinary28 still
missed30s after Program and checker returned. Profile the complete navigation
chain next, including identity-sharing capacity; do not infer the remaining cost.

The SDK configuration witness and Registry source leases have different ownership.
Its182 facts alone must not be described as all baseline AST source contents.
Additionally compare every actual baseline SourceFile.text SHA with a fresh,
load-owned graph source read before granting independent-global permission; all
these source witnesses are checked again at final publication. A mismatched or
unavailable baseline source disables the exception. This adds only primitive
hashes, no AST ownership, and does not restamp an old baseline after loading.


### Request identity memo and finalization (2026-11-16 continuation)

Keep the existing32MiB per-request metadata bound. Retain identity plus regular-file
eligibility, rather than duplicate the entire load-guard/path DTO and prefixed keys.
Reuse witness-owned equal identity strings; account changed identities normally.
Regular files share equivalent directory/full observations; symlink/directory modes
remain distinct. No load-before/after guards or publication checks are removed.

Explicit finalizing state prevents a composite validator from opening a nested
union and clearing the outer memo. During finalization active/preparation are absent,
so owner validators run freshly; nested wrappers join this final pass rather than
restarting it. Public8351-source long-path regression measured384 then4 then2 target
identity validations, retaining both before-use and final checks plus exact answers.
Ordinary30K31 now returns local definitions19.07s/13.99s, still severely slow; not
fullREADY, full Native integrity or complete references/rename acceptance.

### Source-export metadata as default completion root planning

When qualified Native export discovery is unavailable, operation-scoped completion
must not silently omit unopened project exports. Existing full immutable syntax-role
capture may carry primitive export names, export-star requests and an unknown flag.
Select a superset with the existing fuzzy matcher and reverse star-export propagation;
unknown syntax/JS/unresolved stars remain conservative candidates. The actual compiler
alone determines suggestions and resolves details. No AST ownership or second semantic
index is introduced. A receipt binds owner, role revision and resolver generation;
check it across every batch and publication. Original input/final freshness proofs
remain mandatory. Candidate roots use the existing128 limit; mandatory global/native
influence roots are additional, never truncated to meet that candidate budget.

Alternatives: waiting for full Native ready blocks local functionality; loading every
project root recreates the30K failure; trusting syntax names as semantic answers breaks
aliases/reexports. The metadata is root selection only. Explicit qualified discovery
continues to own its route. Preserve actual compiler/SDK incomplete flags. A prefix
shorter than the existing two-code-point auto-import minimum does not acquire an
incomplete flag merely for the disabled module search.

Completion list and details retain the same batch roots in their recipes. Each item
owns its JSON array: sharing one array between items violates the existing canonical
Worker protocol and triggers recovery. Do not relax the protocol to accommodate it.
Public tests cover140 exports across batches, unopened edit/undo, default names,
aliases/cyclic barrels and details before Native readiness. Full gate remains pending;
this refinement is Proposed, not an invented approval or replacement for ADR0030/0044.

### Membership origin versus overlay-projected view

Store-owned workspace views intentionally exclude physical paths shadowed by an
open lexical symlink alias. Preserve a symbol-keyed, immutable receipt pairing that
specific view snapshot with its original full catalog snapshot. Range admission checks
the refreshed complete catalog against the original full snapshot (root, revision,
all paths); it requires the projected snapshot to be that exact captured view. Existing
overlay content/version, physical path, package containment and final publication
checks remain. Do not compare a filtered view directly to an unfiltered catalog or
accept arbitrary subset containment. Unknown adapters retain exact original equality.
This receipt stays local, carries existing immutable snapshots rather than source/AST,
and never becomes cross-process authority. Public package-escape regression first
failed with same-revision26-versus25-path mismatch; verification is in progress.


### Consume a captured reset epoch once per context

A single Store view can prepare an SDK owner and the subsequent query owner. Its
resetTypeEngine flag is a captured event, not authority to repeatedly destroy a
context which has already applied that same reset epoch. Compare the context's
applied resetEpoch before consuming a versioned reset. A genuinely new epoch still
resets every retained consumer; canonical-owner, content-delta and resolution guards
remain independent. Legacy views with no epoch remain conservative. This preserves
historical reset semantics while avoiding duplicate cold reconstruction after an
SDK configuration change. Original public lifecycle assertions remain unchanged:
reset-epoch-once-regression.log21/21PASS, including100 disk edits, configuration,
pressure, unknown/deleted dependency and source-reset admission controls.


### Share proven regular-source parent resolution within each request phase

The20K whole-Program diagnostic measures about40K realpath calls per ordinary
completion/details; source bodies are not reread. A public98-source completeProgram
regression reproduces192 physical resolutions for96 unchanged leaves per request.
The SDK-partial projected-scope control already avoids these omitted leaves and is
not evidence for this separate full-Program hotspot.

For an actual previously load-proven regular source, reuse only its captured
physical spelling. Borrow its parent and exact source-entry spelling from the original Store-owned
complete native enumeration receipt, within the existing32MiB request metadata budget.
Do not enumerate directories again in a query. The receipt owns an O(N) directory/name
index derived once from the existing admitted paths; it retires with that catalog,
not with an independent global cache. Validate the leaf twice with
fresh lstat identities, including dev/inode/size/mtime/ctime, and require exact entry
spelling plus the expected physical parent. Keep raw full native validation for
symlink leaves, missing/weak identities, unknown spelling, unprovable directories
and exhausted capacity. Actual source reads keep their original full physical
before/after guards; no old byte evidence is renewed by a metadata observation.

Parent evidence includes the original directory's full stat/physical identity,
bracketed around the original native membership enumeration. No later stat can
renew that epoch; a changed/unavailable receipt falls back to the original full
per-file physical validation. Check all such evidence after query work,
then discard it before the independent final union. Revalidate the original parents freshly in that
union and check them again after ALL owners have been validated. This closes the
case where a later owner renames a leaf already checked by an earlier owner.
A changed namespace rejects that request; no directory validity persists into the
next request. Validation checks cancellation; query validation opens no directory handles.
An over-budget receipt disables new sharing for that phase, so a large nameset
cannot be repeatedly materialized per source. Unknown adapters, partial/injected
catalogs and nonmember SDK/library paths retain raw physical checks.

Alternatives rejected: infer canonical leaf spelling by concatenating parent and
lexical basename (wrong on case-insensitive volumes); omit final realpath/identity
checks (stale symlink/rename authority); globally cache directories by age/watch
(violates disk authority); re-enumerate each parent in each query (caught by the
existing complete20K no-re-enumeration regression); raise the32MiB bound (does not remove repeated work).
This is validation-only metadata, never member admission, source-read authority,
semantic readiness or a disk/AST/result cache. Raw compiler/SDK proof and final
freshness contracts from ADR0034/0044 remain. Generic filesystem safety tests are
supplemental to the public LSP regression, not a replacement for it. Windows real
filesystem verification is pending; weak identities conservatively use raw checks.


### Borrow closed disk-source byte evidence inside complete-input admission

After directory receipt sharing, the20K interaction assertions finish49.49s,
but references still exceed the existing5s client wait in semanticReadiness.
A public98-source complete-query regression proves96 unchanged sources are
reopened in each of two complete-input observations, although the root Program
already owns actual source bytes and their independently fresh read facts.

An optional source-namespace visitor runs inside the same existing root-context
lease and request/module validation union. Only a genuinely READY, admitted
Program can lend a per-file SHA of its exact SourceFile text, and only when its
existing compiler read fact matches that text. Check admission again after the
namespace digest is constructed, then retain the independent uncached final
input union. No new Program, SourceFile/text cache, answer cache, watch-only
freshness rule or metadata-only byte authority is introduced. Keep the existing
Native CompleteScanInputs-v2 byte layout and canonical URI spelling unchanged.

Open/dirty overlays and every physical alias fall back to actual disk bytes;
Native disk qualification must never hash unsaved overlay text. Missing facts,
unknown/missing Programs, incomplete/partial qualification and unsupported
adapters also retain raw capture. SDK-partial cache-mode capture remains names
only as before. A visitor failure cannot silently retry or rebase the same
request; early no-owner/budget cases preserve raw namespace behavior without
granting readiness. Hashes are ephemeral primitives, not persistent authority.

Alternatives: retaining full body reads repeats already proven I/O; trusting only
mtime/identity has no actual byte provenance; hashing overlay AST as disk corrupts
Native qualification; copying a full manifest/body cache increases ownership and
invalidation complexity. Program/AST reuse and a reference-result cache hit are
separate, and both still require their original freshness and completeness fences.
Public staleness, unnotified changes, aliases/overlays, source mutation during
admission, cancelled/failed owners and final qualification regressions are mandatory.
This remains Proposed and does not broaden the SDK's completeness guarantees.


#### Compiler-owned snapshot validation must consume the same directory receipt

A public2050-source overlay-completion counterexample showed3332 extra physical
leaf resolutions in TypeScriptLazySnapshots.compilerOwned, although resident
Program admission already consumed native enumeration receipts. Pass the captured
workspace receipt to that existing owner at prepare; validate the exact guarded
snapshot stamp with the shared observedSourceIdentity helper. Retain admission
tokens, strong file identities, original directory spelling/currentness and the
uncached final union. Clear that reference with the owner. Unknown/expired proofs
fall back to the original raw identity path. Do not dynamically rebind or renew
catalog proofs. The bounded raw workspace preload and its final content fence
remain; the test separates those254 leaves from unbounded redundant resolutions.

The source-namespace visitor is a terminal boundary: after visitation starts,
its failure or final admission failure must not be converted into an ordinary
cache miss and retried under new inputs within the old request. Same-session
later recovery remains allowed. Actual guarded byte facts require regular,
strong dev/inode identities; overlay/alias text is never Native disk authority.
This refinement remains Proposed; no review or acceptance is fabricated.


#### Reuse lexical normalization only for immutable path lists

CPU samples of the independent20K full-input qualification identified repeated
normalizedPaths/path.resolve/temporary-set work in addition to fresh lstat calls.
A WeakMap may retain normalized, deduplicated, sorted path metadata **only** when
the input list is Object.freeze'd and contains primitive strings. Return a frozen
result. Mutable arrays must be recomputed after every change, and a replacement
catalog/list gets a different key. This memo grants no membership, file identity,
currentness or readiness certificate. Required-path union members already
normalized in the same inputsFor call need not be normalized a second time.
Do not retain Program/AST/text or add a strong root-owner cache. Physical/case/
symlink behavior, byte provenance and independent final union remain unchanged.
Existing public lease/current-input regressions characterize the refactor;
new immutable/mutable-list tests establish its narrower lifetime contract.


#### Native observation confirmation and synchronous preparation handoff

A native complete-membership validator may provisionally retain the exact regular
file metadata it actually observed, using the original directory physical path
and exact basename spelling. Only strong dev/inode observations qualify. Pending
metadata shares the existing32MiB accounting budget; it is not another cache.
A consumer may promote it only after the originating owner successfully confirms
its complete directory/configuration/eligibility/token predicate with matching
epoch and revision in this same synchronous phase. Unconfirmed or failed owners,
cancellation, revision mismatch, unknown paths and overflow fall back to raw reads.
Never establish actual source-byte provenance from this metadata alone.

Use the existing synchronous-preparation scope for project readiness and for the
synchronous prepare/status portion of reference dispatch. The final union stays
inside the original leased compiler query; no receipt crosses await. No-owner and
admission-failure raw namespace branches retain an explicit final frame. Native
membership joins that union and performs its own fresh raw final leaf scan; final
Program observations remain fresh, and pending records are cleared before that
phase. Do not substitute earlier metadata into the final Native scan. Tests
include a later owner changing an already checked body with unchanged length and
mtime and unchanged directory identity, and native finalization without a compiler.

The first two intermediate experiments did not improve I/O (576 then672lstats)
and are retained as failures. Correct preparation handoff gives384 versus576 in
the same98-source public admission, exact references unchanged. No source bodies
are reopened, and no timeout or source limit changes. This proves that mechanism,
not large-project latency or whole acceptance.

#### Host-owned immutable root metadata

The Host may keep a frozen normalized metadata snapshot until its root-list
producer invalidates membership, semantic roots or inferred entries. Preserve the
compiler's existing ordered Host API; proof metadata must not sort or freeze SDK
inputs. The actual pinned r10 synchronizeHostData already takes its own slice
(lib/typescript.js:124369), so do not add a redundant second copy. Internal admission can reuse the frozen metadata and normalization output
must be idempotent. Clear metadata with the Host owner. This is lexical work only;
full native membership, actual dependencies, config/source identities and the final
freshness union remain authoritative. Weak normalization keys do not retain an old
Program or Host. No claim of scale-independent complete-query disk validation.


#### SDK installation is distinct from target qualification

The real Photos input requests compile/compatible API20 while the fixed SDK is
API24. A read-only preflight using the actual adapter proves targetQualification
mismatch before any Program; this is not evidence of missing declarations or OOM.
Do not relax the existing compile-target match, alter test inputs or claim READY.
Expose the already computed target status/APIs/message in sdk.selected alongside
installation readiness. A public mismatch case must retain partial state and
correct local definition, without advertising full-reference capabilities.
Matching an SDK is only a prerequisite; later qualification remains to be verified.


#### Reuse lexical encoding and observed Program coverage, not disk validity

The source namespace encoder may retain canonical URI bytes, u64 length prefixes,
sorted traversal and the name-only digest under a frozen membership list and exact
lexical/canonical roots. Use weak ownership; mutable lists recompute, and replacing
membership or either root cannot reuse another namespace's encoding. Continue to
read every current admission token, respect overlay authority, derive content from
an admitted actual read fact (or the original guarded disk read), and refresh/check
the complete membership revision before returning. No disk fingerprint or valid
boolean is cached by this encoder. SQLite's exact source digest spelling/order is
unchanged; drive-only folding and symbolic-link boundaries remain unchanged.

An actual SourceFile read-evidence object may weakly own the SHA-256 of its exact
text. Check that the admitted SourceFile still has that exact text before borrowing;
this content fact never proves current disk state or authorizes a Program. Keep
all existing independent query/final Native, configuration and source observations.
The already-observed Program also owns a normalized set of its actual source names.
Admission still checks every required path against that set, exact signatures,
documents, configuration and disk inputs. New Program observations reconstruct the
set; reset/dispose drops it with the existing observation. This is compiler metadata,
not a persistent full-project validity cache.

An isolated reference query may refresh an existing explicit root session only when
its existing refresh predicate requires it; do not compute/discard an unchanged
full Program report merely to prepare a verifier job. Its synchronous workspace
preparation retains an explicit fresh final input union before any await, and
before/after namespace proofs, verifier and final candidate fences remain unchanged.
The 20K original 5s transcript remains the regression oracle; diagnostic extended
windows do not count as passing it. Current implementation/validation is tracked in
[the final-gate report](../reports/2026-11-16-final-gate-closure.md).

Context7 resolution was attempted again and failed at transport. Official reference:
[TypeScript language-service design](https://github.com/microsoft/typescript/wiki/using-the-language-service-api)
describes on-demand minimum work and DocumentRegistry reuse, not permission to
cache freshness. The actual pinned r10 source/Program owner and repository public
input-boundary regressions remain the compatibility authority.


#### Metadata resolution load windows use the admitted physical namespace

CPU50 measured actual dependency-graph construction rather than assuming repeated
work from a call count: 58,662 binding owners,164 SDK bindings,19,811 containing-file
boundaries; realpath self time26.26s overall/22.76s inside graph update (CPU samples,
not independently additive wall phases). Explicit source/target observePath load
windows and installedSourcePath dominate those sampled stacks.

Add observeResolutionPath solely for resolution metadata. For an active confirmed
Native directory/name and fresh strong regular leaves, construct the same full
physical identity as the original lookup, checking both before and after the
metadata operation. Keep the original independent final union. Source/configuration
byte reads still use observe/observePath with their original raw load guards.
Unknown names, weak identities, symlink leaves, directories and over-budget/no-owner
cases use the original raw fallback. Installed-source lookup may consume that same
fresh physical path but must still perform its original physical-root/overlay/
installed-package ownership checks. No filename case folding or skipped guard.
Public RED400sources/800metadata realpaths→GREEN0; a second cyclic-import RED has
800 installed-source realpaths→GREEN0. Same-size restored-mtime edits inside the
new actual metadata window must fail before the later Native fence.68 focused
cases pass zero skipped; see final-gate report for the single real30K comparison.

#### Interrupted initial scope construction retains unpublished metadata only

A didOpen mutation during actual syntax-role preparation cancels initialization
through its real shared cancellation cell. Previously ProjectOperationScopes.create
kept its index only in a local variable until ensure completed: a cancellation
lost already loaded syntax facts and binding owners. The400source public transcript
observes450parses/first file twice. This is separate from failed compiler Registry
leases inADR0020; these drafts contain no Program/AST/Registry lease or byte cache.

SemanticGroups retains at most one unpublished scope draft per canonical root.
The active operationScopes map remains unchanged until ensure, dependency update
and membership checks all finish. Retry may reuse a draft only for the same lexical
root, resolver, compiler options, SDK/boundary/root/source-hash metadata profile,
and still-current original configuration/SDK-input capsules. The profile hash is a
compatibility filter, never a currentness certificate. ensure still obtains fresh
membership and compares every source's current disk admission token or overlay
version/content key; changed facts are reparsed and removed facts retired.

A dependency rebuild sets an explicit dirty flag before mutating nodes/bindings,
cleared only after edges/effects/receipt and role ownership commit successfully.
An interrupted graph cannot use its unchanged-role shortcut or certify an older
scope proof. Retry rebuilds that graph from all current roles; it may reuse only
independently load-proven current binding owners. SDK/project configuration clears
both active/draft maps; successful publication removes the draft; dispose clears
all as before. Cancellation does not become a successful semantic preparation,
renew recovery budgets, publish partial exclusions or create another Worker.

Reject alternatives: restart everything after each edit (observed repeated work),
global path-keyed role caches (cross-SDK/freshness hazards), or publishing a partial
role graph (could omit ambient/import effects). This slice does not make an early
cold foreground query independent of complete role preparation. Preserve that
unresolved responsiveness limitation and original45s diagnostic failure.

Validation: real didOpen cancellation in roles and bindings each400unique/400calls;
SDK replacement discards the old owner (450calls/first twice); changing one completed
source reparses that fact (401calls), retains another unchanged fact, and correctly
finds a newly introduced global declaration. Eight focused cases including manifest
classification pass. Real30K late-phase cancellation baseline/candidate comparison
is recorded separately; no UI or full-checkfast claim follows from this slice.

### Same-owner refresh intent after input reconciliation (implementation continuation)

The current original managed-cache public transcript exposes a resetEpoch0→1 and
resolver1→2 during Native/source namespace reconciliation. The original same-owner
Root had query refresh intent; replacement dropped it because only content-revision
resets transferred that intent. The replacement stayed unprepared and no reference
answer was stored, even before the internal cache watcher event. This is distinct
from an answer being invalidated by that event.

Refresh selection must include pending reset-epoch and resolution-generation
changes, and a rejected/retired observation even when the Host generation matches.
A successfully prepared replacement for the same canonical owner may inherit the
existing query-refresh intent across these resets. Canonical-owner changes do not
inherit it. This boolean authorizes only an ordinary query's recertification; no
Program, observation, READY report or old input identity crosses the replacement.
Existing source-reset admission and final currentness checks remain mandatory.
Status-only operations still do not build a Program; SDK failures remain partial.
This supplements, rather than replaces, ADR0044 load-owned input lifetimes and
ADR0020 failed-build/lifetime boundaries. No new approval status is claimed.

Current four original public files pass23/23, zero skips, with unchanged cache-hit,
silent-source recovery, final byte mutation and cancellation-count assertions.
Expanded lifecycle/configuration and final whole-candidate gate remain required.


2026-11-16 final same-owner refresh slice: original4files23/23 and expanded8files68/68
PASS, then complete pnpm check:fast2550/2550PASS0skip/cancel/todo. Frozenadad28ac,
2525inputs/runtime hashes unchanged through postflight. Actual30K coldNative56
single401.577s protocol session: semanticpartial95.582s, exact first/hot definitions
12.044/8.461s before Native publication, Native30000/30000ready0skip, all SQLite
integrity/foreign-key checksPASS, oneWorker orderlyshutdown and ownprocessesCLOSED.
Original55/independent60s integrity timeouts remainFAIL; sameSQL separate26sPASS
and56postflight37.644sPASS do not establish their fluctuation cause. Original/clone
30000source hashes unchanged. User confirms noAPI20SDK; actual24/target20partial,
severequerylatency/earliest47/UI/Windows/new2h/fullrefsrename remainOPEN.
No accepted-review history, merge, deployment or product-threshold change claimed.
See report2026-11-16-final-gate-closure and readiness-refresh-final-checkfast/summary.


### 2026-11-17: cancellation-only port and derived influence reuse

The actual30K hot definition CPU sample shows3.946s in a callback that calls
Store.overlayFor(root) solely to reach cancellation. This is path/Map work without
a consumer. ProjectFileAccessPort now optionally exposes checkpoint; production
uses the same operationControl directly at the same checkpoints, legacy adapters
retain their old cancellation fallback. No check or supervisor limit is removed.
Public400sourceRED17630rootlookups→GREEN0, with17630directchecks; actual client
cancellation still delivers-32800 and recovers in the sameWorker.

A second slice reuses derived influence roots/sets under the same graph revision,
allowed path sequence and current SDK baseline capsule. Owner-local weak keys do
not retain dead semantic groups. Relative/mutated inputs and dirty graphs cannot
hit an incompatible entry; current input validation and the independent final
union remain required. This is a cache of pure graph mathematics, not a READY,
filesystem or AST validity cache, and does not weaken ADR0044 load-owned proofs.
No TTL/watch-only admission, new memory pressure budget or stale-success fallback.

Before/after ordinary same-condition one-session3repeat medians:8.896s→5.172s for
the first slice only. Both fullruns retain SQLite postflightFAIL. Second slice
focused56/56PASS; same-condition ordinary60 median4.223s/max4.373s, exactresults,
Nativequalification/SQLitePASS and oneWorker orderlyclosed. Still slow; fullcurrentgate pending. See
../reports/2026-11-17-repeated-definition-checkpoint-cost.md; Proposed status and
prior decision/review history remain unchanged.


### 2026-11-17: format optional native observations on consumption

The native source validator still performs every original raw leaf/namespace check.
Only its optional request-local identity DTO changes: retain references to the original
physical parent and five-field stat token, materialize full leaf spelling and JSON stamp
only when a consumer needs them after the same owner/epoch/revision has validated.
The original32MiB metadata budget, raw-read fallback and independent final owners remain.
Do not borrow a later physical observation to repair an earlier receipt, retain Stats/AST,
collapse native/configuration first/final guards, or cache filesystem validity across requests.
Unit24/24 and expanded public/unit60/60PASS; ordinary61 median3.893s/max4.239s,
exactresults/SQLitePASS/oneWorkerclosed. Final gate pending.
An experiment violating the existing independent leaf-observation assertion was rejected
and excluded rather than weakening the assertion. This refines representation/cost only,
not ADR0044's authority or the native completeness contract. Proposed status unchanged.


Further representation-only slice compares the two original raw configuration
leaf stat tuples by JSON-equivalent numeric fields, then creates the unchanged
identity/loadGuard string once. Both raw reads/checkpoints remain; all six field
mutation regressions reject. Unit31/31 and expanded67/67PASS; ordinary63 hot median
3.795s/max4.122s, still severe latency. No validity contract or authority transfer.
Independent CPU62 and pending64 counters distinguish repeated validation callers
from proven full scans; no unmeasured scan count or full gate is claimed.


### 2026-11-18: reuse the representation of original configuration receipts

A public400-source cyclic-import hot query performs800 full identity JSON encodes,
zero source-byte rereads and2800 leaf stats. Reuse immutable decoding of the original
load-owned identity in its LoadedConfigurationWitness, not a cached validity boolean.
Cached fields are lexical/physical spelling and original numerical stamps only.
Each request still rechecks the original Native directory namespace and both raw
configuration leaves; final validation starts its independent observations as before.
A changed stamp/physical parent returns the freshly formatted observation for the
existing rejection/recovery path. Links, missing ancestors, weak/non-finite/unsupported
receipts keep the original raw fallback. Never use current observations to restamp
an older receipt, fold full paths, or bypass source load guards.

Cache keys are existing original receipt strings. Reset clears all entries;
namespace retirement removes retired receipts; authoritative source replacement
removes its prior representation. Retained facts-only reset capsules acquire no
witness/Program/cache pointer. Storage follows the active read set/owner lifetime,
with no global historical cache or new pressure budget. The existing32MiB request
memo budget is a distinct phase-local mechanism and remains unchanged.

PublicRED800encodes→GREEN0; hot decodes0, leaf stats2800unchanged, exact result and
one Worker. Unit/lifetime53/53 and expanded public57/57PASS, zero skipped/cancelled.
Actual30K matched main/candidate/main/candidate ordinary sessions are pending;
no constant-time/500ms/whole-feature/UI claim. Native3passes and all deadlines stay.
This refines representation under ADR0044 decisions2/4/6; Proposed status and prior
review history remain unchanged. Scope is NAV-REPEAT-001, not a new freshness contract.

### 2026-11-18 Follow-up: compare raw scalar fields without temporary tuples

The unchanged-source validation still performs the same before/after lstat and
checkpoints, comparing dev/inode/mode/size/mtime/ctime directly. It materializes
stamp arrays only to publish a newly observed identity after an actual mismatch
or an unsupported original representation. Original non-finite equivalence and
all strong-file/path/directory guards remain unchanged. This does not revise the
independent query/final ownership decision above or borrow Native validity.
The public RED observes1612 tuple comparisons; GREEN0 with the same2800 leaf
checks and exact location. Six separate raw-field drift regressions remain
fail-closed. First-slice real30K median improves3991.93to3632.70ms, not a resolution
of the remaining tail. This follow-up requires its own matched ordinary timing.
Status remains Proposed; implementation authorization is not an independent review.

### 2026-11-19 M1 implementation: reuse lexical and role-derived metadata

Authorized A-plan implementation preserves every physical/load/final fence.
SemanticGroups.discover normalizes each captured member/root once, retaining
original spelling/order, dependency closures, overlapping roots and declarations.
The public three-group transcript changes1200normalizations to400 with the same
1200leaf observations. This is pure lexical metadata, not Rejected0039 directory trust.
ProjectOperationScopes keeps an immutable role-catalog snapshot until a role or
member actually changes. Dirty state is set before fact mutation and survives
cancellation; changed compiler inputs still advance through existing versions.
Graph reference equality only skips catalog comparison; currentNodes and final
input owners still execute. Actual cancellation after a new global fact, before
catalog publication, recovers its exact location in the same Worker.
Ordinary M1-a30K has not shown a speedup and retains SQLite60sFAIL; an unchanged
control later fails180s preparation and30s query deadlines. Neither is OOM evidence.
Implementation/focused GREEN is not overall performance acceptance. Status remains
Proposed. See the 2026-11-19 navigation implementation report and raw I receipts.

### 2026-11-19 M1-c: content-addressed pure syntax metadata

Within one immutable ProjectOperationScopes syntax-profile owner, share frozen
role summaries keyed by authoritative text SHA256 and conservative filename
suffix mode. No AST, text, resolved binding or input proof is shared. Every
containing file retains its independent admission, namespace and relative-module
resolution. Source facts acquire/release summary keys; zero references removes
the entry, avoiding a historical content cache. Owner retirement follows existing
owner lifetime, not a new pressure policy. Config/SDK retirement cannot transfer
this pool to a new profile. Public RED400parses becomes1; independent-directory
binding/edit/undo and actual cancellation recover exact results. Expanded33/33
PASS is not large-project speed acceptance; ordinary30K is pending. This refines
metadata representation under0044/0045, preserves all physical/final fences and
does not change Proposed status or claim independent ADR review.

### 2026-11-19 M1-d/e: handoff and live-overlay evidence

Partial SDK preparation may construct a pure group catalog after successful scope
preparation; this creates no project Program and grants no READY capability.
Report initialization plus first-query latency, not just shifted first-query work.
A store-owned live-overlay lifecycle receipt can authorize skipping repeated
overlay lookups only after an entire successful scope-facts pass observed that
same lifecycle. Capture the receipt in that operation proof. Any overlay record
replacement, close, rollback or disposal revokes it; disk cache operations alone
do not. Reopened version numbers cannot resurrect the old receipt. Changed or
unsupported receipts use the original full overlay comparison. This is not a
filesystem/current-input proof: all original membership, load/configuration and
independent final observers remain. Public RED800lookups becomes0 with original
2800leaf checks; expanded99/99PASS, real30K timing pending. Proposed status and
prior review history remain unchanged.

### 2026-11-19 M2-a: typed first-phase observations

Refine the 2026-11-18 requirement for two newly issued configuration-validation
leaf calls: for a known regular source only, its first comparison stamp may be
the actual successful same-phase Native observation, now including mode plus the
original five metadata fields. Producer owner/epoch/revision must be registered
successfully, and its physical parent must match a currently witnessed directory.
The consumer compares its original load-owned identity, never restamps that fact.
The later configuration observation stays raw. This explicitly changes only the
first-phase observation source, not the two-sided comparison or final contract.
Unknown/weak/incomplete/failed/cancelled/over-budget evidence keeps the original
two-raw-observation fallback. Byte-load guards never borrow it; finalization clears
pending observations and executes both raw configuration leaves as before. The
source metadata remains optional and request-local under the same32MiB accounting
budget, not a product RSS threshold. Native pending records account for the extra
mode field. Public RED query800 becomes400 while preparation400 and final1600
remain. Six-field drift tests separately protect borrowing and full raw fallback;
late-body/configuration/namespace regressions remain mandatory. This implements
A-plan M2 without adopting B consistency changes or changing Proposed status.

### 2026-11-19 M2-b / M3: retained comparisons and required final consumption

Final fact comparison may be reused only when every physical observation is
retained in that same final phase. Owner/epoch/read-set, cancellation and terminal
directory guards remain live. Unretained/budget/unknown dependencies keep the
original traversal; no prepared observation or whole-owner validity is borrowed.

For a native membership owner explicitly consumed by a successful operation-scope
proof, omit only the duplicate top-level final callback. Keep the scope's full
raw membership observation at its original point before the scope's post-member
SDK/configuration guards. Every declared consumer must reconsume the exact owner
and epoch/revision; unmet obligations reject before publication. Replacement
proofs with equal member revision are not the old authority. Unknown, mixed or
standalone registrations keep their original final order. Do not defer all native
observers to the end or enable generic final memoization. Physical load guards,
final metadata reset, directory end fence and request terminal/lease remain.

This refines the earlier temporary three-pass implementation, not0019's current
input/final independence decision. Source and SDK/namespace races must retain
refusal and same-session recovery. Public400-source native final2becomes1; total
leaf2400becomes2000 with both configuration final observations intact. Expanded
142/142 plus namespace46/46PASS; real30K M3 timing/full gate/Windows/UI pending.
Status remains Proposed; implementation authorization is not independent review.
See the 2026-11-19 final-membership observation-order report for order, alternatives
and original/proposed counters.

### 2026-11-19 completed role-facts receipt (Proposed implementation refinement)

After actual complete-member and configuration validation, an unchanged successful
role-facts pass may be reused only with the exact Store-owned immutable catalog
producer, matching ordered view/aliases/generation and live overlay lifecycle.
Catalog revisions cover disk identities as well as names, but numeric equality or
Object.freeze alone is insufficient. Unknown projections retain the original loop.
Revoke completion before any new facts writes; capture only after successful end
checks and only for the same producer across the pass. A private WeakSet recognizes
producer identity without serializable authority or strongly retained history.

This removes repeated token polling/temporary role bookkeeping, not physical source
validation: dependency proofs, compiler versions, original raw byte guards and
independent final member/configuration/directory/overlay checks remain. No cached
valid=true, watcher-only contract or readiness promotion. See the completed-role
receipt report for producer audit, public RED/GREEN and remaining acceptance.

### 2026-11-19 M4-a implementation refinement (status remains Proposed)

A qualified regular-source read now carries actual descriptor mode alongside the original
physical identity; the descriptor/read/name window rejects mode disagreement. Legacy
producers without this field retain the original path. No admission token format changes.
For project relative-import boundaries, retain only the actual read's metadata (no text/AST),
validate strong six-field provenance and its original physical-root mapping, then classify
the lexical/physical roots as a pure function. The derived value does not certify freshness:
its original full identity is retained in LoadedConfigurationWitness and checked in query/final.
The existing membership/root/configuration and target/negative resolution witnesses remain.
Unknown producers, overlays, external SDK sources and weak/mismatched identities use the
original live path capture. Never reconstruct provenance by statting a cache hit.

Public RED: existing admitted source still realpathed at boundary derivation (1 vs 0).
GREEN: exact navigation with zero such repeated physical derivations; existing full input
guards and final race refusals continue. Characterization covers aliases, escapes, overlapping
SDK/workspace and missing overlay leaves. Controlled descriptor fault is not a Windows incident.
This is a source-derived boundary optimization, not completion of changed-node graph updates
or an assertion that initialization improved; paired ordinary timing is still required.

### 2026-11-19 M4-b retained graph owners and distinct versions (Proposed)

Retain an unchanged topology node only while its original boundary/source/lookup
proofs remain valid and each binding is the exact current cache owner. Mark its
SDK/boundary dependencies used so normal pruning does not retire live owners.
Current/final input validation remains independent; this is not a result cache.

Separate metadata input-owner revision from derived topology revision. Advance
input revision before node replacement/deletion; old proofs may not acquire new
owners. Compare the complete syntax-role dependency summary (including globals,
exports and reference kinds), flags and ordered edges to decide topology changes.
This is not inferred type/API equality: actual compiler/document versions advance
even when topology remains unchanged. Avoid full graph digest/effects on body-only
edits. Real topology changes still use the conservative complete effects pass.

Pending topology dirtiness must outlive cancellation/exception and be set before
mutation. Clear it only after successful effects; rebuilding cannot certify a
scope. A local per-call dirty variable is rejected: retry can reuse already-new
nodes and otherwise publish an old mandatory-root selection. The public cancel
regression retains the same Graph and Worker; a controlled lost-dirty mutant
returns a wrong empty definition and must fail. Input version, Host version,
Program/checker observation and Worker generation are distinct concepts.

This implements part of M4 without changing0019/0037 input/final freshness or the
0043 store. It does not claim complete O(delta) updates or no full proof traversal.
See the 2026-11-19 dependency-node/topology report for alternatives, rollback,
normal/fault evidence and remaining acceptance. Status remains Proposed.

### 2026-11-19 M4-c contiguous disk deltas for derived role facts (Proposed)

Reuse the existing bounded contentDeltas with a separate role-facts consumer cursor,
not current Program-filtered changedPaths. Accept only contiguous root-matching
monotonic spans over the successful prior receipt, with genuine current Store
catalog, same complete names, canonical owner/reset epoch, aliases, resolver
generation and unchanged overlay lifecycle. New/deleted paths, history gaps,
unknown producers, reset or uncertainty retain the original full facts refresh.
A disk proof must still establish actual current membership before this decision;
delta is a dispatch optimization, never proof of unchanged external disk state.

Revoke completed receipt before mutation and recapture only after graph success and
independent end member proof. Keep compiler/source clocks, original byte guards and
final publication checks. Do not add another watcher journal or retain old Programs.
Public RED401 polls→GREEN2 for one saved source, with identical raw proof counts;
paired elapsed timing and expanded/final acceptance are separate requirements.
See [implementation evidence](../reports/2026-11-19-saved-role-facts-delta.md).
This is partial M4, not complete delta graph maintenance. Status remains Proposed.

### 2026-11-19 known-body membership proof generations (Proposed)

Known accepted existing closed-source body changes may construct a distinct member
proof instead of rediscovering the entire unchanged member namespace. Require
complete identical paths/token keys and original unchanged tokens outside the
explicit admitted change set. Partial, missing, removed, alias/uncertain or already
invalid inputs and legacy producers retain full discovery.

Retire the original proof before handing out its replacement; undo cannot revive
an old request. Retain original namespace/configuration and unchanged file facts;
only actual newly admitted changed-source tokens enter the new generation. New
owner runs all original current/final raw file and namespace fences. A watch event
is not validity, and renewal must not re-stamp an old load proof or bypass0044.
A token Map copy is preferred to introducing another persistence framework.

Public RED observes actual generator1; focused GREEN0 with exact changed and
multi-file undo results. Full/ordinary/endurance acceptance remains independent.
See [proof renewal evidence](../reports/2026-11-19-membership-proof-renewal.md).
Status remains Proposed; no new watch-only consistency contract or resource cap.

### 2026-11-19 live overlay role-facts dispatch (Proposed)

Use genuine same-producer frozen overlay observations with private opaque per-path
versions to locate unsaved changes, removals and same-number reopen. Cache one
observation for an unchanged lifecycle; retain no source bytes/ASTs or historical
journal. Cross-producer/cloned/stale observations cannot lend a dispatch delta.

Require the successful original role receipt, exact owned current catalog, complete
names/root/reset/generation and original physical/configuration checks. Only known
changed facts update. Alias presentation transitions qualify solely when every
changed alias is covered by the observed overlay delta and equals original canonical
root plus its logical root-relative path. Nested/retargeted/unknown mappings retain
full refresh; preserve filename case and existing Windows volume-letter rules.
This is derived metadata dispatch, not proof of disk validity or resurrection of an
old input epoch. All original current/end/load/final guards continue.

Public edit/undo400→1 token polls, close401→2/reopen400→1; unknown frozen producers
retain full polling, physical noise leaves800 remain. Final expanded117/117PASS;
full/ordinary/Windows/endurance acceptance remains separate. See
[overlay dispatch evidence](../reports/2026-11-19-overlay-role-facts-delta.md).
Module binding alias invalidation and true reverse influence are not declared done.
Status remains Proposed; no watch-only consistency decision or review fabricated.

### Whole-group freshness coverage (2026-11-19, Proposed implementation refinement)

NAV-FRESH-002 proves that READY whole groups cannot rely on projected operation-scope
checks that they do not own. Before query snapshot capture, the existing DocumentStore
must observe its original complete membership proof and contribute it to the existing
independent final union, including open/disk inputs. Newly discovered changes reject the
old request; later recovery may reconcile revoked input generations. Keep projected-scope
admission/recovery unchanged. This implements existing disk-authority constraints rather
than approving watch-only consistency. No historical ADR status or review is rewritten.

Public82/82 regression is recorded in
[whole-group evidence](../reports/2026-11-19-full-sdk-membership-proof.md). Previous READY
scale timings without this proof are not strict-freshness acceptance; re-measure necessary
proof costs. Full plan, full check and broader cache-lifecycle acceptance remain open.

### Original whole-group proof travels with its consumer (2026-11-19, Proposed refinement)

NAV-FRESH-002 follow-up covers original proof absence after catalog eviction, weak enumeration,
query methods lacking an outer preparation scope, resolver admission order and known structural
member updates. Carry the original Worker-local proof capsule on the workspace view into the
actual leased query and final union; no serialized valid flag or rebasing expected facts.
Weak/unretainable native enumeration falls back to fresh full authority scans. Reuse immutable
primitive metadata per admitted generation, never validity. Revocation is entry AND revision;
an old proof failure cannot poison a newer revision. Reconcile already admitted catalog changes
before capture; silently changed disk input still rejects the old request. Metadata matching is
not filesystem validation. Preserve SDK/configuration/source/namespace and single-terminal guards.

M4 binding reuse separately records actual positive/negative overlay reads, rather than clearing
all entries for a global alias string; publish current metadata before graph reuse. Source names/
configuration/resolver changes retain conservative invalidation. No new AST/history cache.

These refine existing0019/0037/0044 constraints; no watch-only contract, review or Accepted status
is fabricated. See [whole-group lifetime](../reports/2026-11-19-whole-group-proof-lifetime.md) and
[binding dependencies](../reports/2026-11-19-binding-input-dependencies.md). Original0a fullcheck
FAIL2657/2661 is retained; latest52/52 focused PASS is not final acceptance.


### M4 reverse adjacency implementation refinement (2026-11-19, Proposed)

Maintain reverse edges and global/native seed membership with the existing graph
node commit, rather than reconstructing the index on each topology propagation.
Normalize/check cancellation before the synchronous index+node commit; preserve
pending topology on interrupted publication, and all existing current/final input
proofs. Duplicate importer-target edges are one reachability relation. Remove dead
outgoing edges/seeds, retain incoming edges while their live importer owns them.
This trades O(N+E) graph-owned metadata for avoiding repeated adjacency rebuilding;
actual reachability, catalog traversal and disk-authority checks remain.
This refines the approved A-plan's derived-state maintenance; it does not accept
watch-only B, alter historical ADR status, or introduce a second semantic engine.
Evidence/alternatives/limits: [reverse-edge implementation](../reports/2026-11-19-incremental-reverse-edge-index.md).
