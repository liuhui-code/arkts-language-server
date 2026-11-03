# Stage 1 + 2: isolated closure observation and witness-budget integration

## Scope and provenance

This is a new integration receipt, not a recovery of lost historical logs.
Base main: `298d65f5d7f796c347fe8be5c739e428066489d8`, checked through GitHub again
at 2026-11-03 15:06 UTC. Local branch: `feat/stage12-integration-20261103`.

- Stage 1: `b38cb645212f0d8aa12b16a6032677ca1bbcb9c5`,
  [ADR0044](../adr/0044-compiler-closure-baseline.md) and its
  [standalone reconstruction receipt](2026-11-03-compiler-closure-baseline.md).
- Stage 2: `6538c6be412682cec62a7ca9dc84cdd2e518a5ac`,
  [ADR0045](../adr/0045-exact-witness-byte-budget.md) and its
  [standalone reconstruction receipt](2026-11-03-exact-witness-byte-budget.md).
- Both original stage worktrees and commits remain unchanged. Their source and
  evidence packages were separately backed up before this integration.
- PR115 (`c0a6da0`) and PR116 (`c74c095`) remain open drafts and are not included.
  Stage 3's default-off cold-preparation prototype is not included or qualified.

The original two patches have 30 distinct paths and four shared paths: ADR index,
Feature Ledger, test-layer manifest and its exact inventory assertions. The first
unaltered stage 2 apply check fails on the index, ledger and assertion file;
that failed check is preserved. The other changes apply without source conflict.
The combined nonshared 26 files are byte-identical to their source commits.
Production code is exactly stage 2; observation tooling is exactly stage 1.
This receipt adds one documentation path and a short entry to the existing ledger.

## Integration RED and GREEN

Keeping stage 1's inventory assertion after adding stage 2 tests produces
**3/4 PASS, 1 FAIL**, exit1, 154.538118ms: actual309 != expected305.
After unioning both stages' assignments and actual counts, the same complete
file passes **4/4**, zero fail/skip/cancel/todo, exit0, 182.780003ms.
No test is removed or relaxed. Exact inventory:
unit-contract125, protocol15, bundle-e2e161, artifact-e2e4,
sealed-artifact-e2e1, large1, real-sdk2; total309.

## Fresh combined-runtime validation

Node20.19.5 and pnpm8.15.9 use the frozen lockfile. `pnpm check` and `pnpm build`
both exit0. The release sidecar is the unchanged existing artifact with SHA256
`f37ad1020f6bee66c0c1b3bdc2ef971414e46837b4b67bdf313ec9f0baeb624a`;
Rust sources/Cargo files match main. This is not a new Rust build receipt.

The union of both complete focused cohorts passes **107/107**, zero failure,
skip, cancellation or todo, exit0, 151917.804467ms, across these 19 files:

```sh
node --test --test-concurrency=1 \
  tests/closure-baseline-cli.test.mjs \
  tests/closure-observation-report.test.mjs \
  tests/test-layer-manifest.test.mjs \
  tests/semantic/project-initialization.test.mjs \
  tests/semantic/partial-project-initialization.test.mjs \
  tests/semantic/progressing-synchronization.test.mjs \
  tests/semantic/startup-synchronization-liveness.test.mjs \
  tests/exact-witness-facts.test.mjs \
  tests/semantic/large-closure-witness-budget.test.mjs \
  tests/semantic/large-sdk-witness-budget.test.mjs \
  tests/semantic/witness-budget-overflow.test.mjs \
  tests/semantic/unnotified-import-type-recovery.test.mjs \
  tests/semantic/changed-source-read-witness.test.mjs \
  tests/semantic/sdk-relative-input-guard.test.mjs \
  tests/semantic/request-input-validation.test.mjs \
  tests/semantic/resident-input-proof-boundaries.test.mjs \
  tests/semantic/resolution-namespace-lifecycle.test.mjs \
  tests/semantic/package-json-presence-guard.test.mjs \
  tests/semantic/request-directory-proof-reuse.test.mjs
```

Independent review identified other users of LoadedConfigurationWitness, so a
second complete cohort covers project SDK selection, local package resolution,
SDK export/Kit lookup and serial verifier SDK cache. It passes **67/67**,
zero fail/skip/cancel/todo, exit0, 68576.203557ms:

```sh
node --test --test-concurrency=1 \
  tests/project-sdk-target.test.mjs \
  tests/semantic/local-package-resolution.test.mjs \
  tests/semantic/hms-kit-resolution.test.mjs \
  tests/semantic/references-sdk-cache.test.mjs
```

These are fresh combined-runtime results, not a sum of the two standalone
receipts and not a full-suite pass. The actual CLI tests exercise the changed
Worker's AST instrumentation. Independent in-memory transformation also matches
all required signatures and parses successfully with I/O observation off/on.
The original stage 2 context-retention failure remains unresolved; a passing
combined cohort does not erase or explain it.

## Same physical 23787-file input

A new private replay reads, without modifying, the stage 1 frozen workspace/SDK:
input SHA256 `8e252feee53eaff2bece62bccacbc3d2a9d9e270e866c83e225acc32a274006b`.
It uses this integration's server/Worker/sidecar and new cache/log directories,
clears inherited ARKTS_* and NODE_OPTIONS, and runs real framed stdio:
initialize → preparation terminal → readonly readiness → definition twice → shutdown.
No compiler observer, product deadline override or memory override runs.

Both definitions equal Target.ets (0,13)-(0,19), oracle SHA256
`7adfcd415195fe2b0944021564be282f2b5f9d06ffdf1163e4e3df795eb2ac54`.
One Worker, zero watchdogs, valid shutdown result, process exit0;
input and artifact hashes remain unchanged. Readiness correctly remains degraded
with project-membership-incomplete. The original stage 1 baseline's two -32803
responses remain in the retained baseline report. This new replay has no compiler
source-count observation. Timings 4642.282406ms / 287.426298ms are single descriptive
observations, not evidence of a latency improvement or a cure for the 900s stall.

All **2311/2311** frozen present repository, dependency and runtime inputs match
after both cohorts and replay. Subsequent changes are only this receipt and the
ledger entry. The original missing WASM remains absent. Raw new logs, full replay
payloads, pre/post hashes and input patches are retained in the integration
validation package. No failed attempt was overwritten or automatically rerun.

## Remaining gates and integration points

- Fresh full `pnpm check:fast` and `pnpm check:release`: **NOT_RUN** here. The exact
  original tracked `editors/zed/grammars/arkts.wasm` is unavailable; original blob
  `b5c6102b56b4478648f1da35bee8b44c8245f986`, mode100644 and skip-worktree remain.
  The toolchain has only x86_64-unknown-linux-gnu, not wasm32-wasip2. No replacement
  bytes, missing-file waiver or synthetic full-suite success is introduced.
- A normal-checkout exact-head canonical release CI run is required before merge.
  Neither PR116's old CI nor lost pre-reconstruction results qualify this tree.
  The inherited scoped455 timing waiver remains; no strict unwaived timing claim.
- Main's Windows job is install/smoke only. It does not run the new stage 1/2 tests.
  Native Windows, real SDK/project, editor UI, whole-process memory and latency
  distributions remain unqualified. Future Windows qualification must account
  for the independent native-path/installer work in PR116, without silently
  importing it or treating its earlier results as this candidate's tests.
- Actual changed-file intersections with PR115 are ADR README and Feature Ledger;
  with PR116, only Feature Ledger. Preserve all their entries if later rebasing.
  ADR0043 is owned by PR115, 0044/0045 by these stages; do not renumber or overwrite.
- ADR0044/0045 remain Proposed. Keep ADR0036 fences, original identities, negative
  facts, source/non-source authority and fail-closed capacity behavior unchanged.
  64MiB is per-owner accounted metadata, not a process-global RSS limit.
- The pre-existing typescript-language-service.ts size remains2979 lines, no growth;
  capture responsibility is extracted into the existing helper. Other changed
  handwritten source, tests and scripts are at most500 lines.
- At this pre-publication integration snapshot, no publication, PR, merge, approval,
  auto-merge or deployment occurred. The real
  23787-membership/900-second compiler/90-second navigation incident is not solved
  or attributed by this integration.


## Authorized publication preparation: native Windows gate

The user subsequently authorized a new draft PR plus full CI and Windows checks.
The candidate adds an independent `windows-stage12` job; the existing installation
smoke job remains byte-for-byte unchanged and keeps its default TEMP. The new job
installs frozen dependencies, typechecks, builds the current checkout's runtime,
and builds the native release sidecar into its own `target` directory. It does
not use the previously reused Linux sidecar. Observation/build inputs trigger both
pull-request and main-push validation, with explicit contract assertions.

All six newly added test files run completely, single-concurrency, no name filter:
closure-baseline-cli, closure-observation-report, exact-witness-facts,
large-closure-witness-budget, large-sdk-witness-budget and witness-budget-overflow.
This covers23 tests, including the actual6002-source closure,4200-declaration SDK
proof, retained denial, partial-copy/aggregate capacity and success-release paths.
It is not the full Windows test suite or a reproduction of the real900-second stall.

The independent job uses the existing runner temp directory's native long spelling
for TEMP/TMP only during its test step and prints both original/native spellings.
A direct ordinary/native realpath equality check must pass before the tests.
This explicitly isolates stage1/2 from PR116's still-unmerged8.3-path repair;
it does **not** certify short-path behavior. The original smoke retains that path
setting. Product source, budgets, assertion bodies, deadlines and recovery remain
unchanged. The standard GitHub checkout path has no spaces; arbitrary checkout
path/preload quoting is not separately qualified by this new job.

Fresh workflow RED: missing job0PASS/1FAIL/6 name-filter skips; a second missing
path-trigger RED also0PASS/1FAIL/6 skips. Both raw failures remain. Final targeted
contract GREEN has1PASS/6 skips. Complete release-pipeline file is6PASS/1FAIL,
zero skips; the sole failure reads the still-missing original grammar WASM.
The unchanged six-file native cohort is locally prechecked on **Linux** at23/23,
zero fail/skip/cancel/todo, exit0,41027.977543ms. That is not native Windows proof.

This is a pre-CI receipt. Actual new-head Linux release, original Windows smoke
and dedicated Windows outcomes must be read from the new PR's exact-head CI;
no previous PR/run qualifies this candidate. CI failures must be retained and
diagnosed before any corrective new head; do not loop reruns until green.
