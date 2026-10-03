# R-07: consumed empty-module constructor exclusion

Parent `911ae43c274175614559b63f0311504747d8393d`, branch
`codex/references-resident-fast-path`. Preserve the existing R-09 implementation
and user-owned AGENTS.md edits. This is one default-off scope-admission slice,
not completion of R-07 or the whole latency plan.

## Public cost RED → GREEN

Use the production child process, Content-Length framed stdio, normal automatic
diagnostics and the native sidecar through the existing `LspSession`.
No private server test or alternate protocol stack is introduced.

```sh
/usr/bin/caffeinate -i node --test \
  tests/semantic/references-constructor-scope-exclusion.test.mjs
```

The first test compares exact legacy/control/enabled URI+UTF-16 range sets for
both declaration policies. Target imports the other caller files; an unrelated
`ZEmpty.ets` contains only ASCII whitespace, `export {}` and one optional
semicolon. Consumer has an authoritative unsaved reference; a static factory
`new this()`, implicit inherited construction and a same-name collision are
present. With batchRoots=1 and R-09 off, cost RED is **6 completed batches != 2**,
after exactness has passed. GREEN executes **2 instead of 6** batches across
the two policies: each original-cursor compiler search excludes exactly one
empty external module and skips two otherwise redundant transient verifiers.
The synthetic regression fixture is not the Settings performance benchmark.

## Proof ownership

`queryTypeScriptReferences` supplies a constructor target only after an existing
successful same-Program, unique raw definition, nonempty-symbol search; the raw
definition kind must be `constructor`, not a mapped class-export seed.
The Worker checks complete original membership, actual query/target coverage
and every authoritative overlay. Only **one** missing disk member is eligible.
It reads the current text using the original admission token and the existing
bounded/confined file-access port. The accepting owner performs a second actual
old-token read before the executor consumes the evidence, then checkpoints.
Negative evidence is separate from `searchedProjectPaths`; it is never described
as a compiler-searched source or unioned with partial Programs.

The grammar accepts no comments/directives, imports, declarations, expressions,
aliases, constructor callers or non-ASCII trivia. Any unknown, failed read,
token mismatch, unsearched overlay, multiple missing members or non-constructor
query keeps complete fallback. Existing rejected-anchor discard/retry and
snapshot/cancellation fences remain. No class-binding RPC, second compiler,
persisted certificate, AST cache or index-schema change is added.

`ARKTS_REFERENCES_CONSTRUCTOR_SCOPE=1` enables this experiment. It is off by
default; strategy/closure/full SDK, context disposal, 1024 MiB memory budget,
Worker ownership/concurrency and diagnostic capability are unchanged. The
metadata is removed by executor/public mapping and cannot leak into LSP or the
exact-result cache.

## Long unsupported text RED → GREEN

Review identified overlapping whitespace stars around an optional semicolon.
The real public regression uses 262,144 ASCII spaces followed by an unsupported
trailing comment. The initial recognizer causes a **30 s response-2 timeout**
(test duration 30,918.046953 ms), while the legacy control completes.
This is a defect in the new experimental recognizer, not an invented old-main
constructor failure. Replace the tail with `W*(?:;W*)?$`, separating the stars
by a required semicolon. The same unchanged-deadline test becomes GREEN
(3,776.20235 ms for both fresh processes and both declaration policies).
Syntax admission does not expand and no request deadline is relaxed.

## Safety characterization and current verification

The new public nine-case file additionally covers class-query rejection,
unsupported text, a hidden inherited alias call, an edited unsaved caller,
physical token changes, watched-source invalidation, cancellation/recovery and
trace-off exactness. The last focused run is **13/13 PASS**, zero failure/
cancel/skip/todo, including the four existing manifest tests, 30,962.963246 ms.
The manifest explicitly assigns this test to bundle-e2e; its real missing-entry
RED is corrected by registration and exact 124-entry/49-bundle-file assertions.

An initial physical-edit test incorrectly expected RequestFailed for an
**unnotified** disk mutation. Existing DocumentAuthority instead answers its
complete captured text without advancing revision. The final characterization
requires exact pre-edit legacy results, all planned batches and **no exclusion**;
a fresh process must find the new caller. This is not a change in disk snapshot
semantics or a claimed source freshness repair. The separate watched-file case
advances the managed revision and requires ContentModified (-32801), no result;
the explicit cancellation case requires -32800 and exact subsequent recovery.

Typecheck/build and narrow independent review pass. The fixed
[Settings/API24 replay](../reports/2026-09-29-settings-constructor-empty-scope.md)
is 11 × 267 exact/valid, with normal version2 diagnostics and exit0. The rule
has zero hits: cold/edit still need 14 batches each at 57.375/58.082s. Nine
existing cache hits take 25–42ms; this is not a new Settings acceleration.
The first whole-fast is **1124/1125 PASS, 1 FAIL, exit1**, zero cancelled/
skipped/todo, duration1,044,903.943181ms. The failure is the R-09 unchanged
automatic-types control: resident hits0 instead of2, not a reference-set diff
or timeout. Raw `check-fast.log` SHA256 is
`ee0d316e5e68cbbaab1470d0d6115db3537676c9f75b50c3c72b276054a3e063`.
An isolated unchanged-artifact rerun passes1/1, not a replacement whole gate.

## Loaded absence identity recovery

A new real-LSP controlled regression prewarms automatic types, then creates
one unrelated sibling outside the workspace under its temporary parent.
Exact legacy Locations already agree, but two independent runs fail the cost
assertion **0 resident hits != 2**, durations2,532.451976/2,529.640081ms.
This proves a same-pattern invalidation mechanism, not an exclusive attribution
for every historical failure. The compiler's ancestor type-root negative
lookups capture that shared parent's child-list size/mtime/ctime; unrelated
sibling creation changes those values while the exact lookup remains absent.

Keep exact candidate/missing-chain/physical/link/entity identity for subsequent
absence freshness, rewalking the whole original path on every check. Existing
files and directly observed/enumerated directories retain full stamps. Actual
load before/after still compares full `loadGuard`, including the absent owner's
volatile metadata: a missing→successfully read→missing window is not certified
as absence. No cached value is re-stamped, and limits/revision/cancellation stay.
Creating the original missing path/owner, changing metadata or retargeting a
link still invalidates old evidence. Independent review found no blocker.

Focused guard recovery passes5/5. Final public resident/scope/manifest focus
is **31/31 PASS**, zero failure/cancel/skip/todo, duration94,259.970789ms;
the resident file now has18 cases, including the new sibling control. All
original deadlines, normal diagnostics, exact-result and zero-Worker assertions
remain. The separate final-artifact Settings replay is **11×267 exact/valid**,
diagnostics/exit0, still0 rule hits and14+14 batches: cold/edit57.394/58.108s,
nine existing cache hits25–32ms. The second complete `pnpm check:fast` now passes
**1126/1126, exit 0**, zero failures/cancellations/skips/todos, duration
**1,052,240.191742 ms**. It reruns the actual public coverage at unchanged
deadlines; no source/test/build input changed during the run. Command:

```sh
set -o pipefail
/usr/bin/caffeinate -i env PATH=/Users/liuhui/.nvm/versions/node/v26.3.0/bin:$PATH \
  pnpm check:fast 2>&1 \
  | tee .bench/references-constructor-empty-scope-api24/check-fast-recovery.log
```

Raw log SHA256 is
`fed6290918ca92981d06f9bc393488af19e5be60a42664bbffca4e009e6f27a8`.
The original 1124/1125 failed gate remains evidence, not overwritten or replaced
by an isolated pass. Final manifest postflight passes all runtime/SDK/oracle
pins; Settings remains clean and the user AGENTS.md hash remains unchanged.
Code files remain ≤500 physical lines: registry491, new helper53, executor386.
The pre-existing LanguageService remains3629 (migration debt, unchanged by
this slice). No commit, push, PR, merge or default promotion.
