# Document inspection preparation and actual read-set audit

Status: implemented synchronous handoff slice; A-plan IN_PROGRESS. No merge,
deployment, real UI or endurance acceptance. Parent1e3886df3c4d27755a53c073462f1456b0a3de7e.
Worktree `/private/tmp/arkts-binding-input-delta-20261119` preserves the main worktree.
E=`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.

## Public RED / GREEN

Legacy documentSymbols/documentHighlights/inlayHints did not lend their original
synchronous preparation facts to the existing leased query. Like hover and
signature help, each therefore repeated raw project membership observations.
The implementation uses existing withSynchronousInputPreparation around the
synchronous sync/prepare/query/map sequence. It spans no await, changes no
priority/cancellation deadline and retains the independent final raw union.

Public stdio fixture: SDKpartial,400 noise files plus actual global/augmentation
inputs. RED logs: `document-symbol-preparation-red01.log` and cleaned-param red02;
`document-highlight-preparation-red01.log`; `inlay-preparation-red02.log`.
Each cost RED has correct actual results before failing on4 raw member passes,
including1600 noise lstat calls, versus expected2passes. Inlay red01 was an oracle
mistake: compiler suppresses an obvious constructor type hint. Correct red02
requires the actual inferred `augmented: number` hint with exact position.
Do not count that earlier mistaken oracle as product failure evidence.

Final `document-inspection-preparation-expanded01.log`:43/43PASS,0skip/cancel,
covering real diagnostics/symbols/inlay/highlight cancellation, final-member
fences and diagnostic fairness. `document-inspection-types01.log` and build01
PASS. Frozen runtime `runtime-m4-document-inspection-preparation`, Worker
b02394a28981f42811b0631ea047d6be4de4c9d6be5156fb6b8bf5ee6193968c;
310 product source hashes and all runtime hashes in adjacent identity JSON.
Native remains800e6628. Full check NOT RUN on this candidate; prior0f whole
2681/2682FAIL remains, not replaced by43 focused tests.

Legacy619physical lines versus631parent: still over500 migration debt but no
net growth against parent; DocumentStore1520unchanged remains migration debt.
No Rust source change. The cost counter is an intermediate characterization,
not a permanent requirement that every syntax operation scan global membership.

## Ordinary timing calibration

First pair `document-inspection-preparation-photos-pair.json` stopped with a
harness failure: these three methods on closed files return the documented
fallback before Worker admission (`src/lsp/disk-source-request.ts`). The first
2.16ms empty documentSymbol response is NOT a semantic timing sample or a
product performance success. Exact class oracle rejected it; owned processes
closed. Raw evidence is preserved. No product admission change made to hide it.

Corrected independent pair02 opens the exact original picker file, waits for its
version-matching background diagnostic, measures three calls per method, then
closes it before the original edit/undo/reopen sequence. This adds an explicitly
recorded lifecycle step equally to control041bd03a and candidateb02394a2.
Same isolated Photos30000 files, warm closed Native catalog and API24/project20
SDKpartial; all source hashes checked before/after, original resource/deadline
and SQLite60s postflight retained. Protocol, not real UI. Results completed below.

## Deeper read-set finding: symbols need not consume the semantic project

Installed compiler4.9.5-r10 SHA
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`:
`typescript.js:getNavigationTree2` uses SyntaxTreeCache.getCurrentSourceFile,
not synchronizeHostData/getProgram. Product `typescript-language-service.ts`
documentSymbols currently prepares semantic input before calling that API.

Executed E`syntax-navigation-input-probe.mjs` and result JSON characterize the
actual compiler API: a host throws on root enumeration, project-version lookup,
stdlib access and non-target source snapshots. Navigation before/after a target
edit still returns Example/fresh correctly. Actual reads are target snapshot and
version plus package.json existence/content under NodeNext. This is dependency
characterization, NOT product LSP freshness acceptance.

Consequently the next source-only slice must avoid consuming global semantic
inputs at preparation, preserve real target disk/overlay/path and parse/package
configuration proofs, and invalidate syntax state when relevant configuration
changes even if target text version does not. It cannot simply ignore the
semantic engine's already-consumed historic witnesses, treat syntax as text-only,
change semantic roots/Program state accidentally, or remove final guards.
No source-only product path has been implemented here.

Official references preserved in the previous research manifest: TypeScript5.7.3
commit a5e123d9e0690fcea92878ea8a0a382922009fc9 services.ts navigation tree and
SyntaxTreeCache. Actual installed compiler probe takes precedence for this fork.
VSCode1.95.3 [server.ts](https://github.com/microsoft/vscode/blob/1.95.3/extensions/typescript-language-features/src/tsServer/server.ts)
routes navtree to its syntax server. This supports separating actual dependency
requirements, not copying a second Worker into this project. Context7 resolve
was attempted but failed transport; no fetched Context7 result is claimed.

## Remaining

Public watch registration gap/rejection expanded characterization,
source-only symbol input owner and final fences, remaining M4/M5, controlled
actual dependency growth, frozen final check, real Windows/UI/endurance remain.
Current syntax probe and43focused regressions do not prove those complete.

## Completed ordinary pair03 and calibration correction

Pair02 also stopped on a driver oracle mistake, preserved independently: original
position53:20 is getInstance, not ScreenManager. Its four actual highlights are
53:18-29,54:20-31,55:20-31,64:18-29. The oracle now checks the true original target,
without changing the product, request position or symbol. Pair03 is a separate
run, not a relabel of either failed calibration. First controller run and pair02
are not counted as successful paired experiments.

`document-inspection-preparation-photos-pair03.json` terminal
COMPLETE_FUNCTIONAL_SCOPE_WITH_LIMITATIONS. Summary, exact response hashes and
raw milliseconds in `document-inspection-preparation-photos-pair03-summary.json`;
reproduce controller with Node20.19.5 and Python3 using adjacent scripts.

| Method | Control median/max ms | Candidate median/max ms | Exact result count |
|---|---:|---:|---:|
|documentSymbol|7711.64 /8241.39|2656.28 /2901.00|16|
|documentHighlight|7593.24 /7602.11|2781.89 /3056.52|4|
|inlayHint|7548.57 /7621.33|2580.25 /2586.09|33|

For each method, all six full responses (three control, three candidate) compare
exactly equal. No empty successful response substituted for actual output.
One process per version and three within-session repetitions; no confidence
interval, UI claim or independent-start median. Source30000 combined hash stays
abbc3d8681ee75ddb8220f73d4bfeb4ebcd9db76998d60bc5c5a0b442a4eb393.

Initialization70591 ->71003ms; first definition4753.42 ->4745.43ms; hot definition
median2683.49 ->2644.79ms. These do not show an initialization/definition gain.
Opening and waiting for version-matching diagnosis3081.38 ->3079.12ms. Each run
also completed13original lifecycle/cross-module queries, Native30000READY,
SQLite integrity PASS and owned-process CLOSED, no recorded incident.

Sampled RSS peaks: Node2047.50 ->2035.52MiB (Worker threads included once),
Native140.72 ->140.27MiB, simultaneous owned tree2186.20 ->2173.82MiB. This is
external sampled RSS, not precise heap peaks, not evidence of a memory improvement
or leak closure. Existing Node2GiB test stop waiver retained, no product memory
or V8 changes. Semantic29995members SDKpartial remains and complete references/
rename qualification is not established. This is protocol, NOT UI/endurance.
