# ADR 0047: Query-qualified reference result cache

- Date: 2026-11-22
- Status: **Proposed; implementation validated in stated domains; independent review/acceptance pending.**
- Issue: `REF-CACHE-QUAL-001` (local feature ledger).
- Scope: exact in-memory reference answers; no product changes in this document.
- [Executable design and acceptance](../plans/2026-11-22-query-qualified-reference-cache.md).

## Context and evidence

`reference-cache-admission.ts:diskReferenceProof` currently requires global
semanticState READY, semanticGeneration, inputIdentity, dependenciesComplete
and references capability. SDK-partial reports cannot satisfy this predicate.
The cache is configured but never stores those answers; this is not a disabled
cache option. Reusable ASTs/Programs are different from reusable final answers.

Current six serial protocol sessions (20K/30K x3, 228 requests) show zero result
cache hits. Saved first references median/max:20K14037/17357ms,
30K22383/22794ms; repeated30K max30611ms. These controlled P16 definition
fixtures are not real Photos topology or UI/endurance acceptance.
In one ordinary20K request, first readiness-dispatch→cache-miss5410ms and last
readiness-dispatch→response4633ms account for boundary intervals10043/13301ms.
These include transport/parent work, not exclusive CPU or disk timings.
See [ordinary evidence and qualification repair](../reports/2026-11-22-reference-qualification-revocation.md).

Real Photos has project API20/selected SDK24 mismatch. This global refusal is
not itself proof that every local symbol answer is invalid, nor proof that any
particular partial answer is complete. Merely removing the READY predicate is
unsafe. Existing `status: complete` and a ready Native head alone do not export
all evidence necessary for cross-request semantic-answer reuse.

## Decision proposed

Separate workspace readiness, per-query reference completeness, and current
cache-reuse admission. Keep the existing global report truthful; a cache entry
must never promote partial to READY or advertise new capabilities.

The query producer may issue an immutable, versioned internal
`ReferenceQueryProof` only after the original complete result's final fences
succeed. It binds these distinct obligations:

1. **Query/anchor**: canonical root, cursor, authoritative document version/text
   hash, includeDeclaration, exact compiler-verified declaration identity and
   search semantics. Open/nested overlays participate in authority.
2. **Coverage including absence**: complete search universe plus every verified
   batch, or current complete Native candidate qualification plus sound
   exclusion proofs for all omitted paths. Include globals, augmentation,
   re-exports, aliases and cross-root sources as applicable. Positive read sets
   and returned Locations alone are insufficient.
3. **Semantic dependencies**: actual compiler-loaded source/SDK/standard-library
   inputs, module/negative lookup and directory proofs, configuration, target,
   selected SDK components, compiler/producer identity. Unknown input that can
   affect this query is a refusal. Optional missing SDK content unrelated to a
   provably closed query does not automatically refuse it.
4. **Snapshot/final validation**: original input and owner generations, source
   namespace+content, overlays and original leases' independent final union.
   All batches/exclusions must refer to one compatible input. Cancellation,
   disposal, replacement or a changed snapshot forbids publishing the receipt.

`ReferenceQueryProof` is evidence for the exact answer under the explicitly
selected inputs, not a declaration that API24 implements API20. Store both
project target and selected SDK identity. For a mismatch, the producer must
prove no unresolved/unknown SDK domain can change this symbol or its coverage;
otherwise return the ordinary result under its existing contract without
caching it. Do not silently redefine SDK compatibility or answer completeness.

The parent validates an internal typed receipt and stores it with copied exact
Locations in the existing bounded LRU. A hit obtains a fresh request admission
and an independent final freshness fence before publication. It performs no
candidate search, reference verifier dispatch or Program construction. The
old Native snapshot is provenance, not a forever-live DB reader: retain a
self-contained validated coverage receipt, not a SQLite transaction/Worker/AST.
If its evidence cannot be validated without that owner, refuse reuse instead
of keeping disposed owners alive or inventing current validity.

No receipt = cache-ineligible, not a functional error and not partial data
success. A cached answer never gains stronger coverage than its producer.
Freshness refusal or actual input failure remains terminal for the old request;
ordinary cache absence/eviction can take the normal computation path. These
outcomes must be distinct, not one catch-all cache miss.

## First implementation boundary

Retain ADR0004 root-wide invalidation for source/configuration/SDK/overlay
changes, physical aliases and overlapping roots. Retain current full namespace
observation, disk authority and independent final checks for cache admission.
Do not introduce fine-grained cross-request invalidation, persistence, watcher-
only authority, TTL validity or a new RSS budget. The proof dependency set is
for correctness/eligibility; it is not permission to invalidate only that set.

Reuse observations within the existing synchronous phase only when their
original owners and validation obligations are preserved. Any relocation or
elimination of existing final observations requires a separate equivalence
regression; an undefined cache proof is not permission to skip a final fence.
Current cache entry/byte limits include proof metadata. Eviction/dispose drops
proof references; oversized proof means no cache, without truncating answers.

## Historical decisions and explicit transition

| ADR | Existing constraint | Relationship |
|---|---|---|
| [0004](0004-reference-result-cache-validity.md), Decision/Gate | Complete compiler-verified answers, exact keys, root invalidation, bounded storage; hits avoid verifier/Program | Preserved; per-query receipt supplies explicit evidence. No accepted history rewritten. |
| [0005](0005-index-proof-trust-boundary.md) | Index candidates are not authoritative semantic answers | Preserved; Native readiness alone cannot issue receipt. |
| [0019](0019-stable-programs-and-request-inputs.md), root READY migration and final admission addenda | Root READY/control/cache paths remain until equivalent consumer migration; actual disk and final publication checks | This proposes that consumer migration. Legacy global-READY admission remains in production until its replacement is proven. |
| [0037](0037-navigation-work-and-input-validation.md), A–C and refinements | Request coalescing is not a new navigation result cache; original proof/final ownership retained | New scope is existing references cache only; no definition cache or watcher-only authority. |
| [0038](0038-sdk-component-environment.md) | Selected SDK/target/component and load-owned identity | Preserve all identities/refusals; readiness is not rewritten. |
| [0043](0043-versioned-file-index-maintenance.md), identity and qualification | Native publication/full input qualification are not semantic READY | Preserve exact source/exclusion provenance and cross-store/head/domain isolation. |
| [0044](0044-load-owned-input-proof-lifetime.md), [0045](0045-complete-membership-and-source-resource-budgets.md) | Original loads, membership and owner/final obligations | Receipt is not a global valid bit or a way to renew disposed leases. |

This is a proposed refinement, not an already accepted exception. During
migration use explicit proof versions/variants; do not synthesize global
semanticGeneration or accept a boolean `cacheable` from an arbitrary result.

## Alternatives and consequences

- Delete READY check / use partial or complete boolean: rejected, loses coverage
  and current-input obligations.
- Cache only if globally READY forever: correct but unnecessarily broad refusal;
  retain as legacy path until new evidence is qualified.
- Watcher/mtime/TTL-only or cache only returned files: rejected; silent changes,
  new references and negative lookup resolution can invalidate the answer.
- Fine-grained dependency invalidation immediately: deferred; changes the
  accepted root-invalidating contract and has a larger proof/repair surface.
- New database or persistent cache: unnecessary for this feature.

The design avoids semantic replay on a proven hit, but initial implementation
can still scan the full namespace. No constant-time or500ms claim. Actual Photos
may retain ineligible queries when closure/SDK proof is incomplete. Its global
SDK mismatch and initialization latency remain independent open issues.

## Validation and review

Test-first, public child-process framed LSP. Show a correct SDK-partial closed
query can store and hit without new reference batches/Programs, and an
SDK-affected/unresolved/ambiguous query cannot. Preserve exact URI/range oracles,
zero/incomplete/cancelled distinctions, independent waiters, all mutation types,
unknown watch changes, nested aliases and final source replacement tests.
The detailed plan defines phases, rollback, observability and real30K checks.
No new tests were executed for this documentation-only proposal. Prior64
focused/6ordinary sessions validate the preceding qualification repair only.

## First implementation refinement (2026-11-22, not full qualification)

The first explicit coverage producer is `lexical-block`: one direct let/const
identifier declaration in a function body, exact compiler-resolved declaration,
unchanged untransformed text, no parser errors or shorthand property linkage.
This finite binding scope proves other files cannot bind the local name; it is
not a candidate-count heuristic. The actual installed4.9.5-r10 compiler's
`getSymbolScope` in `typescript.js` supports the scope rationale; our code uses
public AST/checker APIs, not that private function. Other binding kinds remain
unproved in this producer, including exported classes and SDK-linked searches.

A validated first-batch receipt plus exact original source/compiler/range checks
can discharge all remaining files for this binding. Final namespace/configuration
and original lease checks remain; other query kinds keep their original batches.
Cache reuse binds the current resolver's existing namespaceIdentity owner/epoch
as well as actual namespace bytes. It is emitted only from the matching original
workspace generation, rechecked during capture, and strictly decoded. It is
not semanticGeneration, READY or a replacement for physical checks. Legacy
reports without it retain legacy global-READY admission; new partial admission
refuses missing environment evidence. A unique cache-entry identity also prevents
clear/reinsert ABA during an asynchronous admission.

SDK-independent lexical coverage needs no SDK-declaration semantic closure;
configuration/SDK-setting events still invalidate roots, and silent target
changes are partitioned by the freshly admitted resolver environment. No claim
that all SDK-partial answers, unresolved imports or arbitrary returned files
are complete. Generic full/indexed coverage receipts and real Photos symbols
still need qualification. Do not describe this first producer as full ADR completion.

[Implementation, RED/GREEN and pending gates](../reports/2026-11-22-query-qualified-reference-cache.md).
The original proposal and accepted historical ADRs are not retroactively accepted
or rewritten by these implementation receipts.

## 2026-11-22 implementation refinement: complete Program scope (in progress)

A second conservative producer supports a single exported project class,
interface, function or enum declaration in an external module. It requires an
identified selected SDK, full ambient profile, and mismatch/unverified target
qualification; it does not run an extra all-Program diagnostic pass on the
legacy global-READY path. The compiler's syntactic, global and semantic
checks must have no diagnostics. Unknown dependencies, declaration merging,
shorthand/property linkage and incomplete distribution identity decline this
producer. This is a sufficient admission rule, not a claim that every declined
answer is wrong or that target API compatibility has been established.

The `full-program` receipt carries exact compiler anchor, actual searched
paths and immutable original lookup/read facts. The executor currently admits
it only when that one completed Program covers the entire workspace membership
and authoritative overlays; Native candidate completeness alone is insufficient.
Multiple different Program receipts and qualified-index narrowing still decline
cache reuse pending explicit aggregation/coverage evidence.

Configuration evidence includes compiler, project model, resolver and the
verifier's shared SDK positive/negative lookup lease. Issuance additionally
brackets actual byte reads and compares their text with the actual SourceFiles
(including ArkTS source transformation); this is not a current stat stamped onto
an old AST. Those facts join the original query witness and its independent final
fence. Authoritative overlay text is compared directly and bound by the namespace
and original version fences. Confirmed mismatches fail the old request rather
than quietly becoming an ineligible cache entry. Hits recheck the retained data
with raw identity IO and retain the namespace/final fences; no AST, live owner,
closure, Worker or SQLite reader is retained by the answer cache.

All nested receipt values count against existing Worker wire and cache budgets.
Oversized optional evidence is omitted without truncating primary Locations.
These refinements preserve ADR0004/0005/0019/0043–0045; global partial remains
partial. Status remains Proposed with implementation authorized; no review or
acceptance is implied by local tests.

## 2026-11-22 next candidate: aggregated and index-qualified coverage

This replaces the prior implementation-checkpoint limitation, not an accepted
historical ADR. A receipt first records actual Program scope, not whole-project
coverage. Only the executor, after every required batch and final/exclusion fence,
may qualify it as workspace coverage or candidate coverage. Distinct Programs may
combine original facts only for the identical query/compiler/source/policy/anchor.
Missing or incompatible eligibility remains a sticky refusal. Conflicting actual
identities for the same lookup constitute confirmed input change and fail the old
request; they are not silently converted into an ordinary cache miss.

Candidate scope additionally requires the parent-side admitted Native certificate:
complete scan/rejected0, workspace/store/facts domain/head, qualification/input,
complete source fingerprint, declaration identity, anchored candidate URI set and
binding-result digest. This is copied from the already accepted current index and
binding/support proof, not reconstructed from `identityComplete=true`. The compiler
must independently complete all required candidates/support with the checked anchor.
The complete source fingerprint must match the actual before/after namespace.
The old SQLite reader need not survive: the immutable historical certificate plus
fresh identical authoritative inputs is the reuse evidence. It is not permission
to read an unqualified current index or to treat Native facts as semantic answers.

Hits reject stale retained facts before any cached answer is returned. After
computation, a confirmed retained-input failure fails the request even if namespace
or cache eligibility is absent; do not publish the computed answer as “not cached”.
Original request/version/final fences and one-terminal lifecycle remain unchanged.

The sufficient semantic-input guard cannot rely on empty diagnostics alone:
`skipLibCheck` suppresses declaration checking. The installed compiler can return
a transient Symbol with no declaration for an unresolved type. Issuance therefore
also verifies module/type/heritage/import/export binding inputs through the actual
public checker, resolving aliases to declarations. Unknown/synthetic-unprovable
bindings decline caching; they do not degrade the whole server. Bundled default
libraries remain the compiler environment, with actual bytes bound by source facts
and independent final fences. This guard is conservative, not a new SDK type
checker or a claim that selected API24 fulfills requested API20.

Sources: [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API),
[skipLibCheck contract](https://www.typescriptlang.org/tsconfig/skipLibCheck.html),
and installed4.9.5-r10 primary implementation/API declarations identified in the
report. Context7 resolution was attempted and transport failed; it was not used
as if successfully fetched. No timeout, memory, scale or result limits are raised.

## Binding dependency refinement after scale calibration

The blanket “all loaded declaration type references must resolve” checkpoint was
too broad. A controlled2048/P16 run auto-loaded ancestor Node typings; an unused
Node request alias had an unresolved `undici-types` import and blocked an otherwise
independent project declaration. We keep this actual environment and its failure,
not add `types: []`, stub the SDK, or suppress the guard to manufacture acceptance.

The semantic eligibility proof is now rooted in every project source actually
searched by the verifier. It follows actual identifier/type/module/heritage and
alias bindings into their SDK declarations, transitively. Unknown bindings in
that closure still refuse reuse; unused ambient declarations do not poison the
query. Complete source membership/candidate coverage, original configuration and
positive/negative lookup facts, all actual Program byte facts and independent
final fences remain broader and unchanged. The dependency closure determines
semantic eligibility, not permission to stop observing authoritative inputs.

A source-less Symbol is not automatically unknown: public `getSymbolsInScope`
identity confirms compiler-owned intrinsic bindings. Type/value/namespace meaning
is checked and the temporary per-Program membership memo dies with issuance.
There is no name allowlist, private `resolveName` dependency, or retained checker.
Module containers establish lookup identity while selected imports/aliases lead
to declarations; namespace-valued dependencies remain conservatively broader.
Unresolved SDK types reached through the queried base still refuse caching;
unknown unused SDK imports now have a separate positive regression.

The index-qualified path additionally requires observed compiler anchor validation
in every required batch. A boolean Native identity claim cannot promote an
unanchored candidate search. Complete workspace coverage remains independently
sufficient without Native narrowing.

## Final implementation verification boundary

Final frozen candidate202 related and2787 actual full checks PASS; generated
2048/20K/30K each3processes PASS117queries/63actual hits. Actual Photos29995
first references externally stopped at45s before proof production (FAIL).
Global partial remains truthful;3万 hot result hits still~8.66s. These limits
are not bypassed, and this ADR remains Proposed rather than fabricated Accepted.


## Proposed refinement: discover finite lexical coverage before broad verification

Diagnostic88 in the hot-query evidence demonstrated that a local binding's
strict completeness proof was discovered only after a1025-root Program build.
Keep the conservative1024 soft target for genuinely project-wide symbols.
For syntax-hinted direct block-scoped function-body bindings, allow one
query-root verifier attempt with the same full SDK and dependency closure.
Syntax never authorizes an answer: the existing compiler lexical proof and
coverage consumer must both succeed. Otherwise discard all probe Locations
and use the original complete plan. Exceptions/invalidated requests do not
become cache misses. Admit the extra attempt through the existing verifier
budget; do not attempt it if maximum batch allowance lacks room for fallback.
Retain disk authority, complete membership admission and final input fences.
Do not reuse a narrow full-Program proof as project-wide completeness.
This is an implementation-order refinement to this Proposed ADR, not an
Accepted review record, new capability, narrowed correctness contract or a
batch-size policy change. W6 public regressions and default-policy Photos
validation are tracked in the hot-query report.


Review refinement: a query's property/key/declaration name must not be mistaken
for a same-spelled local binding expression. Public counterexample118/121
showed unnecessary extra verification, without wrong Locations. The syntax
hint excludes those roles; object-variable references remain eligible. This
is cost selection only, not completeness or freshness proof. The compiler
proof additionally refuses local variable statements with invalid modifiers
(e.g. body-local `export let` has no parser diagnostic). Computed-key escape
controls are compared with complete-Program results; unsupported semantic
links still require conservative fallback. Review status remains Proposed.


2026-11-23 W7 validation: [final slice report](../reports/2026-11-23-hot-query-acceptance.md).
Focused120 and actual `pnpm check:fast`2801/2801,0skips. Source1068 and all
production artifacts/Native unchanged. Extra all-dist guard134 failed on an
old copied test-only SDK fixture being rebuilt; original record retained and
independent SDK12test/reproducible-hash adjudication145 explains that exception.
Final generated2048/20K/30K9sessions72exactqueries27hits(P16 in both operations),
real Photos3sessions12queries9hits plus one8-query overlay lifecycle all pass.
Real first local refs median7.97s/hot1.02s; edit/save/close/reopen first4.6–4.8s
remain slow; initialization84s, namespace-size growth, SDK partial/full-index
qualification and global references/rename/UI/endurance remain open.
These results validate the stated mechanism, not all performance targets.
Status remains Proposed pending independent review; no merge/deployment.
