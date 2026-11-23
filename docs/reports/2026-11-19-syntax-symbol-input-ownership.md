# Syntax symbols: actual input ownership instead of semantic preparation

Status: implemented approved A-plan read-set slice; overall goal IN_PROGRESS.
No merge/deployment/UI/endurance acceptance. Parent main1e3886df3c4d27755a53c073462f1456b0a3de7e.
Implementation worktree `/private/tmp/arkts-binding-input-delta-20261119`;
E=`.bench/repeated-query-proof-plan-20261117/implementation-20261118/` in main repo.

## Cause and design boundary

TypeScriptLanguageServiceEngine.documentSymbols calls getNavigationTree, whose
installed4.9.5-r10 compiler SyntaxTreeCache does not synchronize the semantic
Program. Product preparation nevertheless consumed project membership, roles,
dependencies and semantic readiness before returning this syntax-derived result.
The preceding synchronous handoff reduced repeated observations but left two
full membership passes. Their necessity belongs to actual semantic consumers;
it must not be imposed on a query that never consumes those inputs.

The actual installed compiler SHA is
af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc.
Executed syntax-navigation-input-probe.mjs and syntactic-mode probe both refuse
root enumeration/project sync/other-source snapshots while returning correct
before/after symbols. NodeNext probe also observes package.json: syntax is not
universally text-only. Product options remain existing NodeJs/ESNext and official
ETS parser options, not newly configurable NodeNext.

Context7 resolve was retried and failed HTTP transport. Official existing pinned
TypeScript5.7.3 services.ts commit a5e123d9e0690fcea92878ea8a0a382922009fc9 and
[VSCode1.95.3 syntax routing](https://github.com/microsoft/vscode/blob/1.95.3/extensions/typescript-language-features/src/tsServer/server.ts)
support distinguishing navtree from semantic queries. Installed fork execution,
not a different upstream version, determines supported behavior here.

## Implementation and invariants

- `src/semantic/document-symbol-operation.ts`: one retained Syntactic-mode
  language service/current tree per workspace, bounded to four workspaces like
  existing project-model ownership. No second Worker, semantic Program, custom
  symbol resolver, global AST database or new RSS policy.
- Own LocalPackageResolver and LoadedConfigurationWitness retain the actual
  SDK discovery/target/ETS parser configuration; no ambient declaration scan or
  project-source catalog is needed. Preserve fallback parse lookups if invoked.
  First admission checks original proofs, then existing withRequestInputValidation
  starts an independent raw final union, including any late-loaded facts.
- Source bytes are the public open-document snapshot. Store sync still records
  the overlay and its queued deltas for FUTURE semantic work; syntax queries do
  not drain those deltas, change semantic roots or reset a semantic Program.
  Parent freshness and Worker generation/version checks remain unchanged.
- Root/target physical path proofs are REQUEST-owned, separate from the retained
  parser configuration. Do not accumulate historical target proofs or reject
  current-file syntax because a previously queried file changes/disappears.
  Existing original path observer retains its identity checks; no lowercase or
  freshness bypass. No newly broadened closed-file capability.
- A failed/cancelled query retires only its parser owner. A later request builds
  a fresh syntax owner/configuration, never restamps the failing request or an
  existing semantic Program. Other semantic owners keep their own SDK contracts;
  syntax success is not READY certification or complete references qualification.
- Close of the currently retained target, configuration change, explicit high
  pressure and engine dispose retire parser state. Other-file close preserves
  the current owner. Root LRU eviction disposes old services. No TTL/heartbeat.
- Existing shared-cell cancellation checkpoint and CooperativeWork mapping/sort
  boundaries are retained; synchronous parse has the compiler's existing limits
  and outer supervisor deadline. No timeout/budget/assertion changes.
- `typescript-document-symbols.ts` extracts existing mapping unchanged for both
  paths. Legacy627lines (<631parent), compiler engine2853 (<2980pre-extraction)
  remain over500 migration debt; new operation142lines and mapper127lines.

This refines ADR0037 actual input scope and preserves ADR0019 disk/overlay/final
freshness and ADR0044 fact ownership. A syntax query does not consume a whole
semantic project and is not allowed to certify one. No ADR status or review
history is changed; this is an implementation refinement, not watch-only planB.

## RED, characterization and regression

Cost RED `syntax-symbol-read-set-red01.log` and red02: exact correct symbols,
but two global member passes and800noise lstat for400noise files. A zero-global-
input expectation fails. Before mapping extraction, original characterization
GREEN; extraction expanded20/20PASS (`syntax-symbol-mapping-characterization01.log`).
Then syntax-only implementation GREEN selected1/10notselected: no member scans,
noise lstat/reads, roles, group discovery, graph traversals or influence builds.
This is a cost assertion with public exact-result oracle, not private API instead
of LSP. Parent revision above; actual commands retained in execution logs.

Public `syntax-document-symbol-inputs.test.mjs` covers partial/READY, mutations
immediately after symbols and at independent final entry. Unrelated source change
keeps exact full symbols; target replacement and actual SDK metadata changes
refuse -32803/no result; successor produces fresh exact output in same Worker.
File switch/delete/close/reopen checks historical target proof non-retention,
stable owner reuse and actual disposal. Controlled filesystem mutations prove
these specific stages, not all possible platform races.

Real LSP cancel test enters a private bounded mapping barrier, sends actual
$/cancelRequest, observes the parent's shared cell change, then executes mapping.
It returns -32800/no partial tree, full retry matches all400classes and children,
one Worker/no retirement. The barrier exists only in the test preload; no product
sleep or fabricated cancellation state. It does not claim interruptible parsing.

`syntax-symbol-expanded01.log`48/48PASS. Initial input-fences01 had12/13PASS;
last failure used nonexistent helper closeDocument (driver error), corrected to
actual framed didClose, evidence retained. Expanded02 had52/53PASS: new cancellation
oracle expected400 from the default flat response (actually400classes+400properties).
Corrected test explicitly negotiates hierarchical symbols and checks every child;
selected cancellation PASS, followed by final expanded03 **53/53PASS,0skip/cancel**,
65602.23ms. No product relaxation or skipped failing scenario.
TSC `syntax-symbol-types02.log`, build02 and diff whitespace check PASS.
Test manifest364entries/bundle189. New whole check pending on frozen candidate;
previous0f whole2681/2682FAIL remains, not replaced by these focused results.

## Ordinary real Photos30K pair

Frozen runtime `runtime-m4-syntax-symbol-inputs`, Worker
280effc4a19d613ad196ea0f6a80fbcd98618bc3cf83af16fe5b9e6041497663;
312source hashes and runtime hashes retained in adjacent identity JSON. Control
b02394a2 already includes the preceding synchronous handoff fix. Native800e6628.
Same30000files, original picker53:20/getInstance, SDK/API24/project20,
warm closed Native cache. Source hash before/after unchanged:
abbc3d8681ee75ddb8220f73d4bfeb4ebcd9db76998d60bc5c5a0b442a4eb393.

|Document symbols|Raw milliseconds|Median / max ms|
|---|---|---|
|Control|3004.75 /2599.82 /2681.03|2681.03 /3004.75|
|Candidate|37.43 /7.77 /7.33|7.77 /37.43|

All six complete16-symbol responses exactly equal; result SHA
 d73415758e507e8bad105c094a6c3a4c08a1a79c3210d41e2dffd92288233904.
One process/version, first syntax-owner call followed by two warm repeated calls,
not three independent cold starts. No claimed500ms guarantee or all-method speedup.

Initialization72177 ->72898ms; first definition4878.27 ->4806.40ms; hot definition
median2649.62 ->2621.21ms. Highlight median2677.21 ->2686.81ms;
inlay2628.34 ->2834.99ms. No initialization/definition/highlight/inlay improvement
claimed. Both complete13original lifecycle/cross-module checks and actual output.
Sampled Node RSS2031.29 ->2032.98MiB, Native138.43 ->138.35MiB; tree2169.09
->2171.07MiB. Not precise isolate heap peaks or evidence of memory improvement.

Candidate Native30000READY, SQLite integrity PASS, owned processes CLOSED, no
incident. Control whole FAIL original SQLite60s integrity deadline; evidence
preserved and paired series is COMPLETED_WITH_FAILURES. Do not call the entire
series green merely because semantic outputs match. Source identity unchanged.
Semantic29995member SDKpartial and complete reference/rename limitations remain.
This is protocol NOT actual UI or formal endurance. Summary/reproduction scripts:
E`syntax-symbol-photos-pair01.{py,json,log}`,
`syntax-symbol-photos-pair01-summary.json`, per-run requests/wire/logs/resources.

## Remaining

Whole-check log E`syntax-symbol-checkfast.log` (terminal not yet observed), initialization/hot semantic costs, actual dependency-growth
scale axes, remaining M4/M5 and real Windows/UI/endurance remain. This narrowly
proves actual-read-set reduction for document symbols, not scale-independent
semantic navigation or completion. Cached semantic results cannot borrow this
syntax owner's smaller proof set.
