# P1 cross-root module invalidation

Date: 2026-09-06

Parent revision: `90e871e60b33554ea1c33f2df0db5c0435bb03b7`

Delete/change follow-up parent revision:
`8ed16a3711ed3202c14129019eb4826996f92bdb`

## Contract

An advertised `textDocument/definition` request must observe a watched source
creation on the immediately following request, even when the created file is
owned by a nested workspace but changes module resolution for a document in an
outer workspace. The warm server must agree with a fresh server over the same
disk state.

Invalidation must stay precise. A source creation resets only cached dependency
closures whose relative-module candidate order can select that path. An
unrelated workspace keeps its closure, content revision, and type engine.

## RED

The stdio test configured nested workspace folders. `outer/Main.ets` imported
`./nested/Target`; only `Target.ts` initially existed, so the first definition
warmed the outer closure on that file. The test then created the higher-priority
`Target.ets`, sent `workspace/didChangeWatchedFiles` with `Created`, and compared
the warm result with a new server.

```text
node --test --test-name-pattern="nested workspace" tests/lsp-workspace-file-changes.test.mjs
not ok 2 - a watched create in a nested workspace invalidates a warm outer-root definition
expected: file:///.../outer/nested/Target.ets
actual:   file:///.../outer/nested/Target.ts
tests 3; pass 0; fail 1; skipped 2
```

The public `SemanticDocumentStore` characterization reproduced the same fault
and also held a warm unrelated sibling closure. Before the fix the affected
outer view returned `resetTypeEngine: false`:

```text
node --test --test-name-pattern="nested watched create" tests/project-file-set-cache.test.mjs
not ok 8 - a nested watched create invalidates only dependency closures that can select it
expected: true
actual:   false
tests 25; pass 0; fail 1; skipped 24
```

## GREEN design

Each reusable dependency closure now records:

- its canonical owner workspace root;
- only absent candidates which precede the selected relative module in ArkTS
  resolution order (`.ets`, `.ts`, `index.ets`, `index.ts`);
- whether candidate tracking covered the whole bounded closure.

Created events scan the already bounded closure cache, canonicalize the created
paths, and evict only matching closures. Every affected owner root advances its
content revision and receives a one-shot type-engine reset. The filesystem-owning
root still receives its normal membership and revision update. If closure byte,
document, or candidate limits prevent exact tracking, the closure is marked
incomplete and safely invalidates on the next source creation instead of risking
a stale answer. Stored candidate paths are hard-capped at 1,024 per closure; a
persistent directory-level reverse index remains unnecessary for this slice.

The collection path preserves the cancellation transaction introduced at the
parent revision: candidate metadata is published only with the closure after
the final checkpoint, and cancellation restores the previous closure object.

## Delete/change follow-up

The symmetric delete case started with both candidates, warmed the outer root
on `Target.ets`, deleted it through the nested workspace, and compared the next
definition with a fresh server. Before owner propagation, the warm result still
returned the deleted URI:

```text
node --test --test-name-pattern="watched delete in a nested" tests/lsp-workspace-file-changes.test.mjs
not ok 3 - a watched delete in a nested workspace invalidates a warm outer-root definition
expected: file:///.../outer/nested/Target.ts
actual:   file:///.../outer/nested/Target.ets
tests 4; pass 0; fail 1; skipped 3
```

The low-level delete tracer expected the affected outer root to receive a
one-shot reset, content revision, and exact removal. It first failed on the
missing reset. A separate changed-file tracer observed the same missing owner
propagation while preserving the established rule that a same-root content
change uses its exact delta without rebuilding that root's type engine:

```text
node --test --test-name-pattern="nested watched delete" tests/project-file-set-cache.test.mjs
not ok 9 - a nested watched delete propagates the exact removal only to closure owners
expected resetTypeEngine: true
actual resetTypeEngine:   false

node --test --test-name-pattern="nested watched change" tests/project-file-set-cache.test.mjs
not ok 10 - a nested watched change propagates the exact delta only to closure owners
expected resetTypeEngine: true
actual resetTypeEngine:   false
```

Exact disk invalidation now returns a bounded map from affected closure-owner
roots to the matching paths while scanning each closure once. Watched deletes
and changes queue the matching removal/change for every owner, advance each
owner's content revision, and reset cross-root owners. A same-root content
change remains incremental; a selected-dependency deletion resets because its
module resolution can fall back. Deltas are queued before reset flags, so the
transactional final checkpoint continues to protect one-shot consumption.
Unrelated roots remain untouched; no whole-root cache flush was introduced.

The first exact-path implementation invoked that closure scan once per watched
path. A two-path batch exposed the large-workspace multiplier before commit:

```text
node --test --test-name-pattern="batches watched exact" tests/project-file-set-cache.test.mjs
not ok 6 - batches watched exact invalidation across dependency closures
expected closure scans: 3
actual closure scans:   6
```

GREEN normalizes the bounded watched batch first, invalidates all exact paths
in one closure pass, and then routes each returned path to its affected roots.
The cost is therefore proportional to one bounded closure scan plus the small
set of affected workspace roots, rather than changes multiplied by closures.

## GREEN evidence

```text
node --test tests/lsp-workspace-file-changes.test.mjs
tests 4; pass 4; fail 0

node --test tests/document-store-cancellation.test.mjs \
  tests/project-file-set-cache.test.mjs \
  tests/workspace-file-change-coordinator.test.mjs
tests 48; pass 48; fail 0

node --test tests/lsp-call-hierarchy.test.mjs
tests 34; pass 34; fail 0

pnpm check
tsc --noEmit -p tsconfig.json: PASS

pnpm build
dist/server.cjs: PASS
```
