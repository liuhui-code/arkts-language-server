# Saved input: independent catalog lineage and combined fact deltas

Status: implementation and targeted validation; NOT final acceptance. No merge,
push,deployment,Rust build or user-project edits. W=/private/tmp/arkts-saved-input-delta-20261120.
Parent1e3886df3c4d27755a53c073462f1456b0a3de7e. E=primary repository
.bench/repeated-query-proof-plan-20261117/implementation-20261118.

## NAV-SAVED-FACT-DELTA-001 and hypotheses

Prior frozen V=e975a3aa,1025source inputs,76runtime assets. Ordinary original30K
saved caller first8133.31ms,undo/save9261.21ms,hot2668.94ms median. These are V
figures,not W. A public400source control identifies unnecessary fact enumeration;
its counts do not explain all8seconds or establish the saved-update speedup.

Ranked hypotheses: combined overlay+catalog changes lose delta coverage; repeated
watch/save changes the resolver generation; or compiler/final work dominates even
with local facts. Actual public RED02 separates the first two. Overlay-only and
closed-disk-only each consume1fact; overlay/change/disk/watch/didSave consumes the
full404members. Resolver generation is unchanged in all three. The remaining
compiler/fence cost remains for coarse diagnosis and ordinary measurement.

Initial RED01 used a disk change while its file remained open,so its `disk-only`
label was inaccurate; evidence retained. RED02 uses independent sessions and
correct open/closed controls:2PASS1FAIL,zero skips. Exact definition is verified
before the cost assertion. First fact pass is local; the failing combined pass
has sameOverlay=false,sameCatalog=false,sameGeneration=true,contentRevision0→0.

## Actual cause and ownership

Public LSP didChange + disk write/watch + didSave → Worker mutation ordering →
DocumentStore.workspaceFilesChanged → watched-source classification and membership
admission-token replacement → public Store membership snapshot →
SemanticGroups.select → ProjectOperationScopes.ensure/updateFacts → graph.update
→ semantic query and independent final proofs.

Disk writes under an open overlay deliberately do not change the compiler's
content history: the overlay remains its authoritative bytes. The disk admission
catalog nevertheless changes. Existing scopes infer changed facts only from
one unchanged axis: same overlays permit diskFactDelta; same catalog permits
changedOverlayPaths. Saving changes both,and the hidden disk change has no closed
content delta. Choosing one history or accepting contentRevision0==0 is unsound.
It is not evidence that the Program rebuilt all30000files.

## Implementation

- project-membership-fact-delta.ts: producer-issued metadata lineage between exact
  immutable Store snapshots. Watched same-member regular source changes record
  paths even when an overlay hides their bytes. Completed refresh compares the
  actual complete catalogs/tokens and carries prior watched plus newly observed
  changes. No new filesystem scan or source read is added by this metadata owner.
- Snapshot publication commits a transition. History is bounded to32steps/512path
  entries as optional metadata; gap/uncertainty/overflow starts a new lineage and
  falls back to full facts. This is NOT a source-count/result/admission limit.
  WeakMap owners retain no AST,text,validity bit or chain of old snapshot arrays.
  A failed producer cannot use a later known event to repair uncertain history.
- finishWatchedSourceChanges extracts the existing proof-renew/content-advance
  responsibility. Its existing closed-disk compatibility rules remain; metadata
  lineage is separate. Known-source classification now includes open sources,
  while closed-only consumers retain their explicit !overlay guards. One existing
  known-path Set is reused,not another members×changes membership scan.
- ProjectOperationScopes merges independently complete catalog and overlay deltas.
  It still requires stable root/reset/config/resolver identity,complete unchanged
  membership and known source facts. Alias changes require original coverage;
  removal/reset/unknown lineage retains full fallback. Existing content history
  remains a compatibility route,not authority for hidden disk changes.
- SourceRolePool,original SourceReadOrigin,witness validation,current membership,
  graph consumer updates,and independent final raw proofs remain. No old active
  request is re-stamped or reset to make it pass. Compiler content versions are
  not advanced merely to encode hidden disk metadata.

No public LSP schema/capability/configuration changes. No proof,timeout,RSS/V8 or
SDK completeness thresholds changed. DocumentStore shrinks1520→1515lines through
the cohesive watcher-finalization extraction; remaining over-limit debt remains.
Other edited handwritten files are below500; test-layer manifest499lines.

## Evidence and contract correction

Public GREEN01:3/3PASS,zero skip/cancel/fail; all three fact passes now1source,
with exact declarations and fresh hover. lifetime01:17/17PASS; lifetime02:
19/19PASS,36.527s,including original6graph/cancellation/shared-owner cases,
5saved/cross-source cases,4lineage boundary contracts and4manifest checks.
TypeScript and builds PASS; later broader/whole checks are still required.
Contracts01 originally7PASS1FAIL from stale manifest layer counts; expected counts
were updated for the two actual added files,not by removing test entries.

Cross-source baseline RED01 uses the frozen V runtime and new fixture observer:
watched overlay+other disk source gives correct new class but enumerates100facts.
An unnotified source initially returns-32803 before any graph/fact update because
Scope.ensure discovers a catalog different from that request's captured stamp.
The original first-success assertion would have required rebasing that stale
capture. Independent diagnostic02 retains the original error and confirms a NEW
public request ID5 returns the exact CrossFact class and updates precisely the
two changed sources under W. No exception is swallowed inside the product.

The final regression explicitly checks old-capture refusal then separate-request
recovery; original failed expectations/logs remain. This does NOT claim improved
first-attempt availability for unnotified changes. That refusal remains observable
and is not counted as a normal successful first query or erased from measurements.
Actual full refs/rename SDKpartial limits likewise remain outside these local
checks. Baseline and W final-regression results must both be recorded.

## Remaining work

Run broader physical/byte/SDK/config/alias/final-race controls,freeze final W,
then ordinary original30K saved queries and low-frequency coarse stage diagnosis.
The earlier V whole check remains a baseline only; its previous waiting cost
controller was verified at0sessions and terminated143 before any child. No V
measurement is relabeled W. Final W full gate,scalar/dependency/density controls,
actualWindows/UI and endurance remain incomplete. Existing SQLite60s baseline
postflight failure is retained; separate28s successes do not erase it.
