# ADR 0005: Index proof and fallback boundary

Status: **Accepted; resynchronization recovery implemented**.

## Default-off source-local literal roots (2026-09-29)

The [next consumed slice](../tdd/references-constructor-literal-roots.md) adds
one closed external-module grammar: export-const/simple identifiers/scalar
literal values, parsed by the same pinned frontend without Program/checker.
Imports/re-exports, type annotations, identifier values, directives/JSDoc,
parse errors and unknown grammar cannot prove exclusion. Ordinary comments
are harmless. Source-local facts do not depend on the target class/name.

After actual same-Program original-cursor constructor verification, safe pending
roots may be omitted while original complete membership, dependency availability,
all overlays and unknown roots remain. This is not a smaller legal search
universe. Worker and owner read original-token text; all consumed exclusions
are rechecked before publication. A failed read discards work and restores
the original plan, with exclusion disabled through recursive fallback.

Public cost RED10->GREEN6 batches preserves exact legacy sets including an
unopened inherited caller; a dependency-seam strengthening verifies that an
omitted literal root can still be loaded through that caller's import. Focus
38/38 and the strengthening1/1 pass; fresh frozen-input whole-fast is
**1133/1133 PASS, exit0**, zero failures/cancellations/skips/todos. Runtime,
SDK/oracle and unchanged source/test/build pins also pass postflight.
[Fixed Settings](../reports/2026-09-29-settings-constructor-literal-roots.md)
is11x267 exact/valid, normal diagnostics/exit0, **0 rule hits** and14+14 complete
batches at61.205/61.528s. This does not graduate general constructor scope or
latency. `ARKTS_REFERENCES_CONSTRUCTOR_SCOPE` stays default-off; fullSDK,
closure, budget, diagnostic and transient Worker defaults are unchanged.

## Default-off empty-module constructor admission (2026-09-29)

The [first consumed exclusion slice](../tdd/references-constructor-empty-scope.md)
uses an existing successful same-Program search and a unique **raw constructor**
definition. If all original membership/query/overlay paths are searched except
one disk member, that member may be excluded only when Worker and accepting
owner both actually read its old-token current text and it is strictly ASCII
whitespace + `export {}` + optional semicolon. The closed grammar has no caller
or binding-affecting declaration/import/directive; the recognizer is linear.
The evidence is separate from searched paths, and never derives from class
export identity or unions of partial searches. Unknown remains complete fallback.

Real stdio cost RED6→GREEN2 completed batches for both declaration policies
preserves exact legacy Locations. Nine public safety/behavior cases plus four
manifest tests pass. `ARKTS_REFERENCES_CONSTRUCTOR_SCOPE=1` is experimental;
default off. This is the first admitted narrow rule, **not** general inherited
constructor candidate completeness, Settings acceleration or R-07 graduation.
The [fixed Settings/API24 replay](../reports/2026-09-29-settings-constructor-empty-scope.md)
is 11 × 267 exact/valid, with normal diagnostics and exit0, but zero exclusion
hits. Cold/edit still require 14 complete batches each at 57.375/58.082s;
nine existing cache hits are 25–42ms. The first whole-fast is1124/1125 PASS,
1 FAIL on R-09 unchanged automatic-types admission. Controlled sibling mutation
reproduces a needless miss, repaired with actual-load guards preserved;
combined focus is31/31 PASS. Final-artifact Settings is also11×267 exact/valid,
diagnostics/exit0 but0 exclusions/14+14 batches at57.394/58.108s. The replacement
complete whole-fast passes **1126/1126, exit 0**, zero failures/cancellations/
skips/todos at unchanged deadlines and frozen source/test/build inputs. The
first failed gate remains recorded; neither whole-fast nor exact Settings
results graduate general constructor scope or cold/edit latency.

## Current constructor scope-admission rule (2026-09-29)

The [fresh complete regression gate](../reports/2026-09-29-awake-regression-gate-recovery.md)
is1093/1093 PASS at unchanged deadlines. This closes the immediate regression
recovery, not constructor candidate completeness. Existing real-LSP coverage
already protects inherited aliases, static factory `new this()`, `super()` and
own-constructor barriers through complete fallback; repeating these GREEN
assertions is not a new defect RED.

A smaller constructor scope requires evidence for **every original legal
source not searched by that compiler Program**. The evidence must establish
why it cannot introduce a caller of the exact compiler-resolved constructor,
including transitive inherited aliases and factory calls; own constructors
must not be treated as automatically inheriting the base constructor identity.
All authoritative open overlays, including diskless sources, belong to the
captured universe. Current configuration/source/revision checks remain required.
One supplied bounded binding list is not enumeration of that whole universe.

Unknown facts, unsupported syntax, incomplete reverse relations or unmatched
snapshot cannot justify exclusion. Matching anchor path/start is necessary,
not a completeness certificate. A class-export identity, resolved base binding
or ready generation alone is insufficient. The existing completed-search
fast-path remains safe only when one compiler search covers all original
membership, query and overlays; unions of partial searches do not substitute.

Reuse evidence produced by the existing verification operation. Do not add
an unused certification port, an idle `class-bindings/resolve` RPC or a second
full compiler query merely to issue a certificate. No new production narrowing
rule was accepted at that prior checkpoint: an actual real-LSP vertical slice must
first establish an applicable exclusion proof with exact legacy Location sets
for both declaration policies, edits and cancellation. The fixed Settings
scope must not be edited to manufacture that proof.

## Current R-20 catalog recovery and identity SQL checkpoint (2026-09-28)

The [unchanged-artifact recovery](../reports/2026-09-28-settings-catalog-recovery-identity-sql.md)
restores the fixed Settings/API24 mode-C workload using the previous native
binary: catalog ready in **9.638 s**, committed insertion total **8.601 s**,
all **11 responses exact at 267 Locations** each, normal version-2 diagnostics
and exit 0. Cold/edit requests remain **67.053/77.261 s**; nine same-snapshot
hits are **31–60 ms**. Both misses still reject the constructor seed and verify
the complete 14-batch scope. The original public constructor characterization
also recovers **1 PASS/0 FAIL** under its unchanged **30 s** RPC deadline.
Earlier readiness, constructor and whole-fast failures below remain evidence;
these recoveries do not establish their sole cause or graduate R-20.

The subsequent [public cost RED/GREEN](../tdd/references-identity-sql-reuse.md)
lazily retains one full **256-row identity SQL String per insert operation**;
different-size tails use the existing construction and the String is dropped
when the operation returns. SQL shape/order, rows, cross-document buffering,
schema and durability stay characterized. Exact public MemoryStore candidate/
proof parity and reopen comparisons pass before the allocation budget check:
RED **5,341 > 4,598**, GREEN **4,289**, a **19.7%** reduction in current-thread
Rust allocation requests. This is not RSS, CPU or latency proof; the recovered
real replay predates this native change. Index trust, constructor scope,
`identity` default and Worker lifecycle are unchanged.

Final Rust workspace validation is **182 PASS/0 FAIL/1 existing ignored**;
strict Clippy and default-feature release pass. The pinned new-native Settings
mode-C replay is **11 × 267 exact/valid**, with normal diagnostics/exit 0,
but cold/edit remain **65.491/79.556 s**, hot hits **31–41 ms**. Sampled product
peak **1,225,367,552 bytes** is 14.3% above the preceding single baseline,
not a memory or causal performance win. **Current full `check:fast` is FAIL:
1,090/1,093 PASS, 3 response-2 timeouts, exit 1; zero cancelled/skipped/todo.**
The two definition failures do not identify warm versus fresh processes;
the third passes cancellation but times out during the unchanged 30 s recovery.
Original-deadline isolated rechecks are **2 PASS/1 FAIL**; the recovery also
times out with the archived old native requested. These separate observations
cannot replace the failed whole gate or prove no performance regression. No phase,
constructor admission, cold/edit 500 ms, original >3 GB/final 50% memory,
PSS/DevEco or native Windows gate is promoted by this checkpoint.

## Prior current-source availability consumer checkpoint (2026-09-28)

The [standalone public consumer](../tdd/references-source-availability-consumer.md)
now uses explicitly supplied availability. Required current text replaces
persisted metadata even at the same generation, with authoritative overlays,
confined 2 MiB/file and 8 MiB total reads. Explicit empty/partial/unknown cannot
revive old facts; each extensionless/re-export alternative needs evidence.
Omitted availability retains historical lexical behavior, not a freshness
certificate. Supplied absence remains caller-owned; missing-parent capture
is still unknown, without a manufactured Base directory.

Rust workspace is 171 PASS/0 FAIL/1 existing ignored, release/typecheck/build
GREEN; public Node capture/port/Worker focus is 96/96 and framed-LSP focus
17/17 GREEN. The [current Settings replay](../reports/2026-09-28-settings-source-availability-consumer.md)
retains 267 exact Locations, diagnostics and exit 0 but takes **144.399 s**;
seed rejection and 14 complete batches remain. Sampled Node/tree RSS peaks
are 696,737,792/700,014,592 bytes; actual sampling median is 212 ms, not the
nominal 50 ms. A restricted sampler attempt is separately blocked before LSP IO.
The retained whole-fast is FAIL/exit 1: 1,078/1,093 PASS, 15 failures.
Post-failed-run public preflight matches frozen source/lock/project/SDK/runtime,
not a passing gate. The serial unchanged-artifact 15-case recheck finishes
12 PASS/3 FAIL: installed-package initialize at 5 s, constructor references
at 30 s and scheduling trace lifecycle. Installed-package initialize then
passes three isolated reruns under its unchanged 5 s deadline; constructor
references still times out waiting for response 6 at 30 s, without a semantic
diff verdict.

Further unchanged-artifact constructor recheck fails at final trace-off
response 7; two external read-only log-retention controls fail at indexed
response 6 with and without RSS sampling. Full logs show ready catalog and a
compiler-rejected class seed followed by complete 15-batch fallback, not
stale-index legacy. Completed Programs contain only 2–5 project files, 52
standard-library files and no SDK declarations. Startup receipt and preparation
dominate observed wall fields, not candidate discovery. This is diagnosis,
not a fix or authority to accept lexical constructor proof; original deadlines
and the open regression/production-admission gates remain unchanged.

The minimal [scheduling test correction](../tdd/references-scheduling.md)
requires exactly `["define", "hover"]` with queue wait <250 ms while references is
active, then audits current definition through `request.completed` after
settlement. All public bypass, ContentModified (-32801), edited exact-result
assertions and deadlines remain. Three independent reruns are GREEN; the
related five-file focus is **51/51 GREEN**, exit 0, zero failures/cancellations/
skips/todos, **55,935.865402 ms** total. No fresh whole-fast has run after
this test correction, so the preceding 1,092 PASS or isolated GREEN cannot
certify the new test source or advance constructor/narrowing work.
This is not latency/500 ms or memory graduation. No constructor exclusion or
production references consumer/default change follows. Full caller enumeration,
freshness fences and compiler-backed constructor coverage remain necessary.

The [catalog phase/native diagnosis](../reports/2026-09-28-settings-catalog-activation-native-profile.md)
retains two180 s ready-gate FAILs before any reference query. Indexed1846
is a parsed-file count, not committed readiness or compiler scope proof.
One owned-sidecar sample reaches reference insertion/cache-spill writes;
it does not prove final commit failure. Readiness and the original regression
gates remain required before admission; no partial generation is trusted.

The [live catalog observer](../reports/2026-09-28-settings-catalog-live-stage-trace.md)
adds default-off, best-effort numeric stage/input observation, not new semantic
trust. Public activation/reopen/rollback/live-flush tests and177 Rust tests pass;
real Settings still fails the original180 s ready gate before didOpen/references.
1846 inputs and637203/3662/20516 occurrence/alias/binding rows match history.
Only replacement/reference-insertion starts are observed, not successful
index/commit/ready. No partial generation, low pre-query RSS, or focused GREEN
advances production binding/constructor admission or the retained whole-fast gate.

The [bounded insertion progress slice](../reports/2026-09-28-settings-catalog-insert-progress.md)
adds default-off observation, not semantic trust: public RED/GREEN,181 Rust PASS
and1 existing ignored. Real Settings still fails the unchanged180s ready gate
before didOpen/references. Completed1344/1846 input prefix spends64.302s on
occurrences and21.397s on identity work (66.32%/22.07% of completed work).
Executed rows/buffered identities are distinct and uncommitted; no ready/commit
or full-run/5GB/500ms proof. R-20 and original regression/whole-fast recovery
still block constructor/narrowing promotion; no SQL/default/deadline change.

## Prior caller-owned availability capture checkpoint (2026-09-28)

The [public capture slice](../tdd/references-source-availability-capture.md)
adds `ReferenceInputState.captureClassBindingInput` without a references RPC.
It owns copies of the supplied bounded query, project/SDK configuration and
authoritative overlays before discovery awaits. First capture registers its
managed root revision. `assertCurrent` must run before IO and result acceptance:
it combines managed revisions with best-effort physical stat witnesses, not
an atomic/content-hash filesystem snapshot or index generation proof.

Existing physical parents can prove leaf ENOENT; missing `Base/index.*`
parents remain unknown. An admitted diskless overlay is present. Canonical
and client aliases are associated by safe physical identity; a relevant foreign
owner or competing overlay is rejected rather than silently becoming absence.
The caller still owns complete relevant document enumeration and semantic
scope. `present` does not certify disk readability or constructor completeness.

Public capture/port/Worker focus is 95/95 GREEN; existing framed-LSP freshness
and complete-search controls are 17/17 GREEN. One fresh fixed
[Settings/API24 replay](../reports/2026-09-28-settings-source-availability-capture.md)
retains 267 exact Locations and diagnostics, exit 0, at 60.533 s; sampled
Node/tree peaks are 763,441,152/766,730,240 bytes. Seed rejection and 14 complete
batches remain. Fresh controlled whole-fast is **1,092/1,092 GREEN**, exit 0,
zero failures/cancellations/skips/todos; post-gate public preflight matches the
project, SDK, oracle, runtime and frozen source fingerprints without server
launch or output creation. No previous gate or default-host SDK certification
is reused. This is not latency/500 ms or memory graduation.

Presence does not admit stale persisted source contents. The Rust resolver
still does not consume availability. Only a separately gated
resolver slice may do so; compiler-backed constructor coverage and exact
differential remain mandatory before any exclusion. Defaults are unchanged.

## Source-availability transport checkpoint (2026-09-28)

[Public transport RED/GREEN](../tdd/references-source-availability-transport.md)
adds optional `sourceAvailability` to bounded binding discovery. Entries are
strict objects with a URI and `present`/`absent`/`unknown` string state. Node
rebases and copies entries before IO; both boundaries reject duplicate,
unrequested, malformed, over-budget and absent/open-overlay contradictions.
Omission, empty and partial arrays give no evidence for missing candidates;
unknown remains unknown, including supplied overlay overlap. Serde's accepted
object-form enum and tuple-form struct each have a real NDJSON RED, closed by
strict object/string admission. Input errors preserve the usable session.

This is **format and bounded transport admission, not filesystem proof**.
The resolver deliberately does not consume the new field; existing explicit
binding behavior stays unchanged even when non-overlay availability is unknown
or absent. Such a binding is not a current-presence certificate. Complete eight-
candidate/diskless controls still return unknown for extensionless imports.
No references/planner consumer, constructor exclusion, schema, defaults, SDK,
Worker lifetime or memory policy changes follow from this slice.

Final Rust protocol 13/13, workspace 159 PASS/1 existing ignored, release build
and combined Node protocol regression 98/98 pass. One fresh
[Settings/API24 replay](../reports/2026-09-28-settings-source-availability-transport.md)
returns 267 exact Locations, normal diagnostics and exit 0 in 58.759 s;
sampled Node/tree peaks are 738,242,560/741,486,592 bytes. Rejected constructor
seed and 14 complete batches remain. Fresh controlled whole-fast completes
**1,081/1,081 PASS**, exit 0, with zero failures/cancellations/skips/todos.
Post-gate public preflight revalidates the fixed project, SDK, oracle and all
runtime fingerprints without launching a server or writing an output file.
This is not inherited from the previous source, default-host SDK certification
or performance graduation.
Physical/captured availability, revision fences and compiler-backed constructor
search completeness remain separate prerequisites before candidate exclusion.

## Captured open-source presence checkpoint (2026-09-28)

[Actual public RED/GREEN](../tdd/references-open-source-presence.md) proves a
candidate-stage source-resolution mismatch: a target existing only in an open
buffer is correctly resolved by the real semantic Worker, but Node previously
omitted its source proof. Conservative verification already protected all five
final Locations. Capture the open-path mapping before asynchronous discovery;
pass the existing resolver overlay callbacks, not a second source-text owner.
Use strict physical identity, or confirmed ENOENT with an existing physical
parent; preserve the resolver's source-root, package and symlink containment.
Unknown identity or multiple aliases cannot authorize new source proof.

A separate retargeted-alias RED proves the generic resolver may swallow an
identity exception and continue with disk fallback. Keep a sticky observed
failure and check it outside resolver catch blocks before issuing proof. This
does not change generic module resolution or prove complete source availability.
No unconditional lowercasing, Map-order alias selection or absence inference
is introduced. SDK terminal proof retains its identified-SDK/physical-file
checks and does not use overlay presence as an SDK certificate.

Final public 13/13, focused 95/95 and fresh controlled whole-fast **1,062/1,062**
regressions pass, exit 0, with unchanged replay runtime hashes. This is not
inherited from the previous source or default-host SDK certification. One fixed
[Settings/API24 replay](../reports/2026-09-28-settings-open-source-presence.md)
returns 267 exact Locations with diagnostics and exit 0, but takes 60.696 s
after seed rejection and 14 complete batches. Full extensionless availability,
overlay/absence admission and compiler-backed constructor scope remain open.
Neither binding-RPC candidate exclusion nor defaults/Worker/memory graduation
follows from this presence/fail-conservative slice.

## Owned project configuration checkpoint (2026-09-28)

The [unchanged-source controlled gate](../reports/2026-09-28-regression-gate-recovery.md)
has recovered 1,058/1,058 without source/deadline changes; preceding timeout
failures remain recorded. The separate default-host environment is not certified.

Project ownership now has its own
[public RED/GREEN](../tdd/references-project-configuration-ownership.md): holding
candidate status and mutating only the caller's nested target reproduces Node
desktop source proof against the Worker's tablet selection twice. The five
final Locations remain exact through conservative verification; this is not a
missing-reference reproduction. `configureProject` now clones before changing
revision/cache and stores, resolves and sends the same owned selection, just
as the SDK entry point does. No normalization or catch-to-default is added.
The public port uses a real Worker/compiler and an external protocol fixture,
not a new framed-LSP alias transport or real Rust completeness certificate.

Characterization passes 11/11 and final focus 61/61, including framed-LSP tests;
fresh final-source controlled whole-fast passes 1,060/1,060 with zero failures,
cancellations/skips/todos and unchanged replay runtime hashes. This does not
certify the default-host SDK environment. One fixed Settings/API24 replay
returns 267 exact Locations with diagnostics, but 58.636 s RPC and rejection of
the constructor seed remain. Source availability, complete overlay admission
and compiler-backed constructor search scope still need separate proof. This
repair does not admit a binding-RPC consumer, narrower scope, `identity` default,
long-lived verifier or any 500 ms/memory graduation.

## Candidate-stage production freshness (2026-09-27)

[Actual public RED/GREEN](../tdd/references-candidate-snapshot.md) closes a
production race before semantic dispatch: candidate/status IO can outlive a
document edit or SDK/project reconfiguration even when the index remains ready
at the same generation. Continuing with the old input could resynchronize an
older buffer and fatally break the semantic Worker.

Freeze the entrance document, position and query values; keep the cancellation
signal live. Capture managed root/configuration revisions and the selected
project/SDK inputs, then recheck freshness before anchor verification, candidate
acceptance, semantic dispatch and final cache/result publication. Superseded
inputs reject as ContentModified, never as a new conservative query over mixed
snapshots. An already-aborted request cannot synchronize old text.

Root revision and cache invalidation include known canonical physical aliases
and overlapping parent/child roots, matching existing overlay authority.
Unknown physical identity fails conservative; proven disjoint siblings remain
independent. This is a managed-mutation fence, not authoritative enumeration of
every dependency, a disk-change-before-watcher proof or a binding RPC consumer.
All relevant overlay/source-availability capture and compiler-backed constructor
search coverage remain prerequisites before constructor candidate exclusion.

Caller-owned SDK configuration has now received
[actual public RED/GREEN](../tdd/references-sdk-configuration-ownership.md).
Holding candidate status and mutating only the original SDK object reproduced
split ownership twice: Node lost the original SDK terminal proof while the
Worker retained its copied selection. Conservative verification still returned
five correct Locations; this was not a false-negative reproduction.

`configureSdk` now clones before changing revisions/caches, and stores/sends
the same owned selection. No parsing normalization or catch-to-fallback is
added. Preserve distinct omitted/undefined, null, empty and invalid explicit
values; arbitrary non-JSON object compatibility is not certified by this test.
At this checkpoint `configureProject` still retained caller references and
needed its own public self-package/target-mutation RED; the 2026-09-28 slice
above supplies it. SDK proof alone could not test project ownership.

The SDK mutation/control pass, but the post-extraction port suite is **6/9**
and the combined public regression is **15/43**, with timeout failures retained.
Independent SDK-owner replay passes; that does not close the broader gate or
prove all timeouts environmental. No next-stage narrowing/default promotion
follows. Full current-source validation and the separate default-host timeout
investigation remain open; see the linked TDD/report for raw evidence.

The same-build fixed Settings/API24 compatibility replay also **FAILS**: the
original180s references and diagnostics waiters expire. Only three of14
conservative batches complete; no partial Locations are published. Empty
normalized harness output means no response, not a compiler-proved empty set.
Coarse external RSS sampling and the incomplete operation cannot graduate
memory or latency. This does not authorize narrower constructor semantics,
longer deadlines, reduced SDK/diagnostics or treating machine pressure as a
proven sole cause. See [the current report](../reports/2026-09-27-settings-sdk-configuration-ownership.md).

The [subsequent unchanged-source revalidation](../reports/2026-09-27-settings-timeout-revalidation.md)
passes the original43-case focus and one fixed Settings/API24 constructor
replay with267 exact Locations and normal diagnostics. It does not erase
the original timeouts:98.039s still fails500ms, and fresh whole-fast completes
RED:1,015/1,058 PASS,43 FAIL,exit1. A bounded independent recheck is also RED:
1/6 PASS,5 FAIL. Its catalog case returns five exact Locations but exceeds the
whole-request wall budget; it does not quantify index-only waiting.
No new semantic trust, candidate exclusion or default
promotion followed this run; project-object ownership at that point still
required its own public RED.

## R-10 bounded binding-discovery transport (2026-09-27)

Protocol-v1 `class-bindings/resolve` now exposes the captured binding resolver
through the existing workspace sidecar, with an editor-neutral Node port.
[Public protocol/adapter TDD](../tdd/references-class-binding-protocol.md)
defines input budgets, session identity, generation/readiness and URI/overlay
admission. Known lexical binding requires ready runtime state and matching
runtime, snapshot and expected generations; stale reopen cannot revive old
success. Invalid input is rejected, not truncated; overlays are not persisted.

Node retains the existing canonical workspace URI boundary and validates both
requested support and returned declaration/support URIs. Foreign/malformed
output poisons that session; invalid caller input does not. The sidecar binds
its database/session identity and bounded requested set, not physical project
membership. No new index table, schema or semantic authority is introduced.

This is a **transport prerequisite**, not production snapshot admission or
constructor coverage. No unused per-references RPC or planner consumer is
added. All relevant open overlays and project/SDK/workspace revisions still
require capture before asynchronous work and final freshness checks by a
future production caller. Extensionless source hops remain unknown without
authoritative source availability. `NoBase`/`Resolved` never certify complete
constructor search or permit candidate exclusion. Defaults, SDK profile,
Worker lifetime and memory policy remain unchanged.

## Decision

Rust/SQLite may discover candidate occurrences and provide bounded identity
proof for planning. It does not decide final ArkTS symbol equality or produce
final reference Locations; `ohos-typescript` verifies them. Narrowing requires
a committed ready generation compatible with the current workspace, project,
SDK and overlay snapshot, unique declaration identity, complete alias/binding
resolution and no candidate truncation. Unknown or ambiguous proof cannot
exclude files. Never lowercase workspace paths unconditionally to mask case
differences.

Post-mutation recovery requires `ready` and `committedGeneration` strictly
greater than `max(accepted, committed, building)` captured at each watched edit.
A catalog already building can contain pre-edit bytes: its commit cannot certify
the edit. Native optional `buildingGeneration` is only a freshness fence, not
semantic proof. Failed status capture keeps the root dirty; otherwise remain
on complete legacy until a later catalog commits.

Initial catalog warming is not post-mutation recovery. A global request may
observe generation 0 before the first committed catalog and fall back to
complete-scope verification. The [real Settings first-click replay](../reports/2026-09-21-settings-immediate-catalog-replay.md)
shows that this can plan many batches and remain on that plan after catalog
readiness. An [opt-in bounded-wait experiment](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md)
now covers both initial generation-zero warming and the pre-open window. It
keeps the request snapshot/cancellation signal, rechecks the existing
candidate-eligibility proof, and uses complete compiler fallback on timeout.
This is **not a default policy**: three exact Settings runs still took
39.8–50.5 seconds and postponed diagnostics. Defaulting the wait,
mid-request replanning or switching initial warming to legacy still require
responsiveness, diagnostic and completed-memory gates. Stale candidates must
never exclude files or become final Locations.

## Gate

Stale, partial, ambiguous, re-export, SDK-import and unsaved-overlay cases
must fail conservative. On verifier failure, discard all partial Locations
before retrying or failing. Mutation → safe fallback → committed generation →
indexed recovery has a real LSP transcript covering indexed → mutation →
legacy fallback → generation advance → indexed recovery with exact Location
equality. See [the TDD record](../tdd/references-index-resync.md).
If the sidecar moves from ready to warming after it served candidates, matching
the old committed generation is insufficient: both anchor paths must reject
the candidate set and use complete semantics. The
[state-race transcript](../tdd/references-index-state-race.md) covers this case.

The [Settings candidate-phase profile](../reports/2026-09-26-settings-candidate-phases.md)
separates ProjectGraph admission, usage/declaration index-port RPC and source
proof wall time under the existing default-off trace. Source proof includes
its repeated index request; RPC time includes queueing/transport, not only
SQLite. All 33 real responses and 40 focused tests remain exact/fail-safe.
Measured cost does not authorize skipping binding proof, generation checks or
compiler anchoring. The 500 ms and final memory gates remain open.

The [local-export seed experiment](../reports/2026-09-26-settings-local-export-anchor-seed.md)
does not transfer anchor authority to index. Lexical/export discovery supplies
only a pending candidate, bounded to one same-file exported class, ready and
matching export/reference generations with complete support proof. Original
cursor definition resolution in **each final compiler batch** must equal the
candidate file/start; a same-name parameter is rejected and all work discarded
before compiler-anchor fallback. Transport requires an immutable admitted
anchor URI/position with complete identity metadata. Stale/ambiguous or
unsupported seed proof uses the existing conservative route. Default remains
off; alias/overlay/cancel tests and 66 exact Settings responses are smoke
evidence, not index-produced final semantics or graduation.

The [constructor-position Settings probe](../reports/2026-09-26-settings-constructor-anchor-boundary.md)
shows why this boundary cannot be relaxed: class-export discovery does not
prove a constructor-query anchor. The unaccepted proof takes conservative
verification, matching fresh legacy's 267 Locations but failing latency and
diagnostic gates. A class-declaration oracle (247) is not interchangeable.
Constructor/class normalization requires its own compiler-backed public
transcript; identical spelling is not identity evidence.

The [follow-up](../reports/2026-09-26-settings-constructor-conservative-units.md)
characterizes constructor/class/alias/super identities and traces rejection
without weakening proof. Default-off full-scope semantic-unit grouping uses
all legal candidates only with a ready complete graph; this is not index
exclusion. Real Settings graph is unavailable on omitted root targets with
default/ohosTest; file batching retains exact results but fails latency.
Repair selection through its own public regression and refresh the oracle if
membership changes; never delete modules or declare an incomplete graph ready.

The subsequent public RED/GREEN repairs implicit target selection: exclude
ohosTest, require one production target, keep explicit/ambiguous safety.
Settings native/network are now ready and membership restores 30 files.
Graph still has `complete=false` because phone depends on existing local
feature/suggestion outside root-declared modules. This is not authorization to
invent a module or skip the dependency: full-scope fallback remains mandatory.

The [local-package closure slice](../reports/2026-09-27-settings-local-package-closure.md)
now supplies bounded metadata proof for that edge: matching package manifest,
entry and physical containment, cycle-safe traversal and transitive declared
module edges. Packages get separate discovery roots, not module identities.
Settings remains 32 units/1,496 members, graph ready/complete. Missing/unsafe
metadata still fails conservative. General references in non-module package
sources are not graduated: the existing incomplete-snapshot error is retained,
never a partial success. Each final result still requires compiler proof.

Constructor narrowing remains unproven. The pinned compiler's constructor
search follows `super` calls and recursively inherited constructors, which
can introduce references spelled with a derived class name rather than the
base name. Substituting the class-export proof for constructor-position proof
is therefore not admitted as a shortcut. Existing separate compiler oracles
and complete-scope fallback remain authoritative; lexical name/span equality
cannot justify dropping those files.

The expanded [constructor transcript](../tdd/references-worker-startup-trace.md)
now demonstrates a two-level implicit inheritance chain ending at aliased
`new Leaf()`, without the base-class lexeme at that reference site. Legacy,
indexed-batched and conservative grouping agree for both declaration policies.
This is a correctness guard for future candidate modeling, not proof that
current class-export identity already covers constructor search.

The [direct-import RED/GREEN](../tdd/references-direct-import-anchor-proof.md)
now exposes and repairs an actual false negative: a direct import at `new
Maker()` previously accepted the exported class's candidate scope even though
the compiler resolved its constructor, omitting transitive `new Leaf()`.
Ready export metadata must supply the exact declaration position; each final
compiler batch proves the original cursor's definition equals that position.
Mismatch discards all partial work and retries without the discovery seed.
Missing/ambiguous/truncated or different-generation metadata cannot narrow.
Recheck index readiness after the metadata RPC: an old committed generation
while warming is insufficient. This safety check is mandatory; experimental
local-export seeding and identity dependency profile remain default-off.
The [real Settings class/import control](../reports/2026-09-27-settings-direct-import-anchor-proof.md)
returns 12 exact responses with normal diagnostics. It does not graduate
constructor candidate completeness or the 500 ms cold/edit gate.

The [complete-retry slice](../reports/2026-09-27-settings-seed-complete-retry.md)
removes redundant re-anchoring after rejection. Discard all candidate/support
scope and partial Locations, remove the rejected expected anchor, then verify
all legal membership in the same immutable snapshot. The failed transient
Worker terminates first; no compiler symbols/definitions are reused. Checkpoints
and final revision validation still reject cancelled/changed work. This is
complete fallback, not acceptance of constructor class proof. Settings returns
267 exact constructor Locations but still takes 52.121 s over 14 batches;
constructor narrowing and latency/memory graduation remain open.

The [rejected-verifier observation slice](../reports/2026-09-27-settings-rejected-batch-trace.md)
now retains existing Program/query/startup/memory observations for discarded
discovery attempts, separately from successful batches. It does not change
proof acceptance or scope. Settings still returns exact 267 constructor
Locations; all 15 attempts spend 43.934 s in Program readiness of a 52.584 s
request. Trace is default-off; no extra compiler query is performed. Do not
confuse this attribution with constructor completeness or a passed latency gate.

[Constructor search-boundary characterization](../tdd/references-constructor-search-boundaries.md)
also protects static factory `new this()` references without the base lexeme,
and the explicit-derived-constructor barrier to implicit inheritance. Four
public LSP profiles and both declaration policies agree with each query's
legacy oracle. This adds proof requirements for future candidate modeling;
it does not make the current class-export candidate proof complete or change
index/compiler ownership, SDK rules or fallback.
Final authorized regression gate: `pnpm check:fast` 996/996 PASS, zero
failures/cancellations/skips/todos. Constructor candidate proof and performance
graduation remain open; a passing whole-suite regression is not permission to
substitute class identity or enable experimental narrowing.

## Single completed compiler search coverage

[The full-search coverage slice](../tdd/references-full-search-coverage.md)
permits ending remaining closure batches only when one completed compiler
search, with a unique raw definition and unchanged Program, includes every
original membership file, query path and open overlay. Source counts, loaded
files, candidate subsets and unions across Programs do not prove completeness.
Missing/mapping/cancellation failures withhold evidence; tolerated unadmitted
dependencies disable it. Rejected anchors still discard discovery scope and
partial Locations. This is ephemeral compiler proof, not constructor index
completeness, hot-context residency, cache authority or identity promotion.

Implementation regression gate: **1,000/1,000 PASS**, exit 0, zero failures,
cancellations/skips/todos. Fixed Settings remains 267 exact with normal
diagnostics, but no full-Program proof fires (max 1,348/1,496 members) and
the cold request remains 54.306 s. No narrowing/performance graduation follows.

## Class-heritage lexical prerequisite

[The public Rust metadata slice](../tdd/references-class-heritage-facts.md)
records top-level named class/base spelling and source ranges, not resolved
inheritance or constructor identity. Its `lexically_complete` flag covers only
a supported lexical subset, never complete candidate/reference scope. Dynamic,
qualified/generic heritage, implements, nested/anonymous classes, templates,
decorators and uncertain scanning withhold completeness. Legacy index scanning
remains characterized and unchanged. The API is standalone: no SQLite field,
sidecar protocol or planner narrowing consumes it yet. Generation/reopen and
compiler proof are required before integration; class-export identity still
cannot stand in for constructor identity. Four real Settings files all withhold
completeness; [read-only observations](../reports/2026-09-27-settings-class-heritage-facts.md)
do not close semantic E2E, cold ≤500 ms or memory gates.

## Class-heritage persistence prerequisite

[Generation/storage TDD](../tdd/references-class-heritage-storage.md) closes
lossless MemoryStore/SQLite persistence through the existing generation
transactions. Production 9→10 and experimental 109→110 remain isolated.
Migrated absence is unknown (`None`), not complete-empty; partial lexical
facts cannot exclude files. Reads pair facts with a single committed snapshot;
replacement, rejection, deletion and rollback cannot retain stale heritage.
Concurrent migration checks occur under the write transaction.

This is a storage contract only. No new sidecar protocol or planner consumes
heritage as a constructor proof. Unique binding/alias/re-export and compiler
coverage remain open. Compiler authority, production defaults, Worker lifetime,
SDK and memory gates are unchanged. Subsequent narrowing must treat missing
old facts as unknown even when the old catalog's committed generation is ready.

## Fresh-source class-base discovery boundary

[Public discovery TDD](../tdd/references-class-base-bindings.md) resolves a
supported unique local base or named import/explicit re-export alias chain
from immutable source input. It returns declaration/span/support provenance,
not constructor identity or permission to exclude references. `NoBase` only
means no explicit supported base spelling; it is not a constructor coverage
certificate. Duplicate URI snapshots, local collisions, partial syntax,
unsupported imports/exports and alias cycle/budget exhaustion return `Unknown`.

Persisted legacy bindings lose type/lazy and raw-header syntax; old scanner
tokens can erase numeric syntax or confuse quoted export modifiers. Fresh
source validation is therefore required by this API. It is not yet a SQLite
generation-bound binding query or a sidecar/planner consumer. That integration
must preserve validated provenance and open-overlay authority before compiler
confirmation can establish constructor search coverage. Settings source probes
remain unknown; no narrowed constructor results or latency graduation follows.

## Validated binding snapshot storage boundary

[The storage prerequisite](../tdd/references-class-binding-snapshot.md) now
persists source-validation provenance with existing bindings/heritage and reads
them in one generation-bound transaction. Schema 11/111 supersedes 10/110;
old rows remain unknown, never a validated empty binding set. Unsupported
source suppresses new snapshot bindings without changing old search APIs.
Snapshot resolution fields are cleared: only lexical spelling is persisted.

Structural validation rejects noncanonical/duplicate exported ranges and URI
mismatches before activating a generation. This protects roundtrip integrity,
not compiler validity. Bounded URI reads do not authorize candidate exclusion.
The snapshot is not yet admitted with current open overlays or consumed by
the planner. Compiler-backed inherited/factory/own-constructor search remains
mandatory, as does fixed Settings/API24 exact differential before narrowing.
Defaults, SDK, Worker lifetime and memory gates remain unchanged.

## Captured source-overlay binding discovery boundary

[Snapshot/overlay TDD](../tdd/references-class-binding-overlay.md) now consumes
the validated storage snapshot in a standalone public Rust discovery adapter.
Unique requested-URI overlays replace persisted facts without writing the DB;
invalid current source on a traversed chain must not revive disk success.
Generation mismatch, malformed public metadata, duplicate/foreign overlays,
ambiguity and cycle/budget exhaustion return `Unknown`. Transient resolution
fields are recomputed, never trusted as input authority.

The caller must provide every relevant active overlay from one captured
workspace/configuration/index/document revision. Generation equality alone
cannot establish freshness, workspace identity or detect omitted buffers.
Production DocumentAuthority/sidecar/planner admission remains separate.

A bounded snapshot cannot prove absence of competing extensionless sources:
missing rows may also be legacy/rejected/unknown facts. Every extensionless
import/re-export hop therefore remains unknown until authoritative source-
availability evidence exists. The fresh-source API's supplied-universe
contract is preserved; both entry points share one binding kernel.

This closes standalone snapshot/overlay discovery, not constructor coverage
or candidate exclusion. Compiler-backed inheritance/factory/own-constructor
proof and fixed Settings/API24 exact public differential remain mandatory.
No second TypeChecker, schema/default/SDK/Worker/memory-policy change.
