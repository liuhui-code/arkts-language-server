# R-10: unaliased re-export anchor seed — public LSP TDD

Status: **default-off experiment, not graduated**. Parent HEAD
`911ae43c274175614559b63f0311504747d8393d`; existing dirty worktree is
preserved. The real-project evidence is in the [Settings report](../reports/2026-10-03-settings-reexport-anchor-seed.md).

## RED

The public child-process `textDocument/references` test in
`tests/semantic/references-direct-proof-trace.test.mjs` first required a
trace-only explanation for a named re-export cursor. Against the old bundle,
`node --test tests/semantic/references-direct-proof-trace.test.mjs` failed at
`trace must explain why a separate compiler anchor was needed`. The next RED
required an opt-in unaliased seed, no standalone anchor and final-batch
`anchorVerified=true`; it failed at `a unique export may be used only as a seed`.

## GREEN and safety boundary

`ARKTS_REFERENCES_REEXPORT_ANCHOR_SEED=1` recognizes only a one-line,
unaliased named `export { Name } from "./relative"` cursor. A unique indexed
class export of that name supplies a **candidate**, not a semantic result.
The normal declaration candidate query must still prove complete identity,
generation and support; every final transient verifier resolves the **original
cursor** and compares its compiler definition to the seed. Any mismatch drops
all partial work and retries complete scope. Default remains `0`.

The same public test covers: trace-on/off equality; aliased re-export rejection;
the accepted seed's exact consumer Location and absent anchor Worker; and a
wrong same-name class seed for a function re-export, which must be rejected by
the compiler and return the unchanged complete set. Focused command after the
implementation: `node --test tests/semantic/references-direct-proof-trace.test.mjs
tests/test-layer-manifest.test.mjs` → **6/6 PASS**. No private engine mock is
used; each case speaks Content-Length LSP to a real server child process.

The first whole `pnpm check:fast` found a TypeScript implicit-`any` declaration
in the new seed helper, so it is a recorded **FAIL**, not a passing gate. The
declaration was typed, `pnpm check` passed, and the rebuilt runtime SHA stayed
`74d195ba73b06b4fe2ab0efcc3ea7d6aab072958f50cc3aa804fd769d3bb9562`,
identical to the six Settings replay inputs. Final whole-fast status is recorded
in the [Settings report](../reports/2026-10-03-settings-reexport-anchor-seed.md):
the single complete rerun is **1,204/1,204 PASS, exit 0** (zero
fail/cancel/skip/todo). The earlier type-check failure remains part of RED.

This experiment does not implement a positional Rust re-export proof. Its
one-line lexical recognition is only a discovery filter. Aliases, multiline
exports, ambiguous indexed exports, stale generations, overlays that change
meaning, and non-class declarations retain compiler anchoring/fallback. The
three-run Settings A/B is not a 500 ms, P95, PSS, original >3 GB, or default
promotion gate.

## 2026-10-03 safety follow-up

The same real-child-process LSP suite now checks `includeDeclaration=true`
against the compiler-anchor control and verifies the target declaration range.
With a delayed transient batch, a `didChange` to the open query document must
return `ContentModified` (`-32801`) without partial Locations; a second unsaved
edit in the importing document adds a new reference, which the next query must
return exactly. Explicit `$/cancelRequest` must return `RequestCancelled`
(`-32800`) without partial Locations, and a fresh retry must remain exact.
Both interrupted cases compare seed-on and seed-off results; the seed-on trace
must show the discovery seed was actually accepted before interruption.

The first overlay test was invalid: `export { Thing } from "./Target"` does not
create a local `Thing` binding in the barrel, so a `new Thing()` there is not a
valid expected reference. The test was corrected to add the reference in the
importing `Use.ets` overlay; no production change was made. The focused suite
now passes **6/6** (`node --test
tests/semantic/references-direct-proof-trace.test.mjs`), and `pnpm check`
passes. These are safety characterizations, not a new strategy or default.
The complete `/usr/bin/caffeinate -i pnpm check:fast` after these tests passes
**1,207/1,207**, exit 0, zero fail/cancel/skip/todo. It includes the three new
cases, but does not upgrade the narrow experiment to a product gate.

## 2026-10-03 next-stage preparation trace

The `includeDeclaration=true` control also passed on the clean real Settings
checkout with API24: seed off/on each returned the same ten exact Locations,
including the declaration; raw reports and the one-pair timing/memory limits
are in the Settings report. The restricted first attempt failed `spawn EPERM`
before LSP startup and is not counted as a semantic result.

To separate pre-verifier document preparation from the final compiler Program,
the next public LSP RED required `references.search.document-prepare.complete`
on a traced re-export request. At parent
`911ae43c274175614559b63f0311504747d8393d`, command
`node --test --test-name-pattern='opt-in unaliased re-export seed' tests/semantic/references-direct-proof-trace.test.mjs`
failed at `the seeded path must expose workspace preparation separately`
(0/1 PASS). The minimal GREEN wraps the existing `documents.prepare(position,
true)` without changing its inputs or output; event fields are elapsed
milliseconds and prepared-document count. The untraced public LSP control
asserts no such event. After `pnpm build`, the same targeted test passed 1/1,
the full six-case fixture file passed 6/6, and `pnpm check` passed. The trace
is off by default; its timing is an attribution aid, not proof that any
preloaded file can safely be excluded.

The newly pinned real Settings/API24 mode-A replay passed 10/10 exact
Locations with normal diagnostics and the trace event reported 1,139.25 ms
for 256 prepared documents. Final compiler verification still took
2,990.71 ms (674 SourceFiles), so no preparation shortcut or default change
is justified by this one sample. The raw report is linked from the Settings
report; its first restricted sampler attempt failed `spawn EPERM` before LSP.
The broader public child-process regression command
`node --test tests/semantic/references-batch-search-coverage.test.mjs
tests/semantic/references-direct-proof-trace.test.mjs
tests/semantic/semantic-global-scope-restoration.test.mjs` passes **25/25**
with zero fail/cancel/skip/todo. `git diff --check` passes. The touched
`legacy-semantic-engine.ts` remains 1,075 physical lines, unchanged from its
existing migration debt; the new helper is 53 and the public test is 238.

## Preparation subphase tracer bullet

On parent HEAD `911ae43c274175614559b63f0311504747d8393d` with the prior
dirty worktree preserved, the next public child-process `textDocument/references`
test requires six ordered trace-only preparation phases: current load, overlay
authority, dependency closure, project membership, workspace preload and
finalization. It also requires the untraced LSP request not to emit them.
The targeted RED command
`node --test --test-name-pattern='opt-in unaliased re-export seed' tests/semantic/references-direct-proof-trace.test.mjs`
returned **0/1 PASS, exit 1**: actual phase list `[]`, expected six phases.
No workspace membership, overlay authority or preload change is authorized by
this test; it only makes the existing 1.139 s total observable by subphase.

GREEN: a per-call, best-effort observer now reports the six phases to the
trace-only references logger. It does not alter the `prepare(position, true)`
work or emit on the default trace-off path. The overlay-authority projection
and merge were extracted as one cohesive helper to keep the existing over-limit
`document-store.ts` from growing (2,057 → 2,056 physical lines; new helper
81 lines). `pnpm build`, `pnpm check`, the targeted public LSP test 1/1, the
full re-export public LSP file 6/6, alias-overlay LSP 2/2 and store alias
characterization 2/2 passed. The prior full `check:fast` 1,207/1,207 applies
to the preceding build, not this trace-only extraction.

Two separately pinned real Settings/API24 replays then passed the same exact
ten-Location oracle and normal diagnostics. Cold mode A showed membership
987.46 ms versus preload 54.13 ms; mode C showed membership 1,010.47 ms on
the first query and 0.05 ms after an unsaved comment edit, while the final
compiler `createProgram` still took 2,156.54 ms on that edit miss. Their raw
reports and limits are in the Settings report. This is attribution, not a
safe preload/membership reduction or a 500 ms result.
The broader `node --test` run over `references-batch-search-coverage`,
`references-direct-proof-trace`, `semantic-global-scope-restoration` and
`project-file-set-cache` passes **76/76** (zero fail/cancel/skip/todo),
protecting the extracted overlay authority and existing reference boundaries.
`git diff --check` passes; current handwritten line counts are 2,056 for the
pre-existing over-limit store (one fewer than before this slice), 81 for the
new cohesive helper, 59 for the reference trace adapter and 247 for the LSP
test. The full `check:fast` is not claimed for this new bundle.
