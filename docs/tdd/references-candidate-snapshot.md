# R-10 candidate-stage operation snapshot

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; existing edits preserved.
Follows [index state-race admission](references-index-state-race.md),
[ADR 0005](../adr/0005-index-proof-trust-boundary.md) and
[ADR 0006](../adr/0006-semantic-request-scheduling.md).

## Authority and bounded slice

Candidate discovery happens asynchronously before the semantic request is
dispatched. Its document, project/SDK selection and relevant open-overlay inputs
must belong to one captured operation revision. A mutation or cancellation while
discovery awaits cannot authorize a later resynchronization of old request text.
The open DocumentSnapshot remains authoritative; index readiness/generation
alone does not prove that its surrounding operation is still current.

The public regression targets that earlier admission boundary, not compiler
constructor identity or candidate exclusion. Keep normal diagnostics and existing
complete-result semantics. No new discovery RPC, parser, schema/default, SDK
profile, Worker-lifetime or memory-policy change is implied by this repair.

## Actual RED

```text
node --test tests/semantic/references-candidate-snapshot.test.mjs
exit 1; 0/1 PASS; duration 21,963.696 ms
semantic worker fatal: Stale semantic document version .../Query.ets: 1 < 2
```

A real child-process, Content-Length-framed LSP transcript uses an external
NDJSON sidecar fixture to hold the first status response after candidates:

1. Open Target and Query at version 1; request Query's `Thing` references.
2. Wait for the external held-status barrier, then change Query to version 2,
   replacing its import/use of `Thing` with `Other`.
3. Public hover succeeds against version 2, proving the semantic mutation was
   applied before releasing the old candidate discovery.
4. Release status; the old references response is ContentModified (`-32801`).
5. Request Target's references **without another Query request or resync**.

Despite the old response being rejected, its resumed dispatch attempted to sync
Query version 1 after version 2. The semantic worker failed; follow-up response
4 timed out after 20 seconds. Checking only the old request's ContentModified
response would miss this corruption of the shared authoritative buffer.

Two earlier setup attempts never reached the held barrier because the external
fixture lacked executable setup. They are fixture failures, not production RED
evidence. The reported RED is the later actual stale-version worker failure.

## Existing GREEN characterization before extraction

The existing candidate behavior passed its four public transcripts before and
after the cohesive extraction. This protects unchanged candidate admission,
alias/overlay/state behavior while reducing the oversized owner; it is not the
new race's GREEN evidence. Refactoring was completed under GREEN rather than
while the new race was failing.

## First minimal GREEN

```text
pnpm build && node --test tests/semantic/references-candidate-snapshot.test.mjs
exit 0; 1/1 PASS; duration 1,993.473 ms
```

Aborted work is now rejected **before** the document-request sync. The cached
references route also refuses aborted synchronization. The public transcript
keeps the worker alive, returns exactly the three Target/Use Locations without
resynchronizing Query, and observes normal Query version-2 diagnostics. Old work
still fails ContentModified rather than returning partial results.

This is the first cancellation barrier, not complete immutable admission.
Public-port root/configuration fences without an AbortSignal and full captured
operation-revision checks remain the next RED/GREEN slice.

## Root mutation fence without caller cancellation

The editor-neutral public `SemanticWorkerEngine` plus `SidecarWorkspaceIndex`
transcript uses the actual semantic Worker/runtime, not private methods and not
a framed LSP claim. The caller deliberately supplies **no AbortSignal**:

```text
node --test tests/semantic-worker-reference-snapshot.test.mjs
RED: exit 1; 0/1 PASS; duration 11,129.076 ms
semantic worker fatal: Stale semantic document version .../Query.ets: 1 < 2
```

Old work did not settle within its 10-second bound after another public request
applied Query version 2. Caller cancellation alone is therefore insufficient to
protect shared document truth.

A root mutation revision now advances in the existing mutation owner. Capture
it before candidate selection; assert it before definition dispatch, resumed
references and cache synchronization. The actual two public transcripts then
pass together:

```text
pnpm check && pnpm build
node --test --test-concurrency=1 \
  tests/semantic/references-candidate-snapshot.test.mjs \
  tests/semantic-worker-reference-snapshot.test.mjs
GREEN: exit 0; 2/2 PASS; duration 3,780.722 ms
```

## SDK/configuration revision fence

```text
node --test --test-name-pattern='SDK configuration change' \
  tests/semantic-worker-reference-snapshot.test.mjs
RED: exit 1; 0/1 PASS; duration 1,739.770 ms
```

During held candidate status, public `configureSdk` changed selection without a
caller AbortSignal. A public hover barrier completed before old work resumed,
yet the old operation accepted candidates, started verifier/cache work and
returned five complete Locations. Document version alone did not identify this
configuration mutation.

Capture a separate configuration revision with the operation; candidate
checkpoints reject changes before acceptance, definition, final dispatch and
cache synchronization. `pnpm check`, build and the combined public port/framed
LSP transcripts are GREEN (3/3, 5,200.036 ms). The name-filtered RED command is
not a whole-suite gate. Caller-owned query mutation and complete production
binding capture remain separate proof requirements.

## Caller-owned query snapshot

```text
node --test --test-name-pattern='caller mutates' \
  tests/semantic-worker-reference-snapshot.test.mjs
RED: exit 1; 0/1 PASS; duration 1,936.367 ms
```

The caller changed only its request object's document text/version and cursor
position while discovery awaited. No authoritative document mutation occurred.
The operation nevertheless switched from `Thing` to `Other` and rejected
ContentModified instead of completing the originally captured version-1 query's
five exact Locations. The public input object was still live across asynchronous
work, so a valid unchanged operation could be altered by caller aliasing.

The minimal fix clones/freezes query, document and position at references entry
while retaining the live AbortSignal. The actual combined command is GREEN:

```text
pnpm check && pnpm build && node --test --test-concurrency=1 \
  tests/semantic-worker-reference-snapshot.test.mjs \
  tests/semantic/references-candidate-snapshot.test.mjs
exit 0; 4/4 PASS; duration 6,953.842 ms
```

Caller-object freezing does not mean the authoritative DocumentAuthority or
configuration state itself is frozen. Nested-workspace physical overlay
authority still needs its own mutation-fence regression; owner-root equality
alone is not assumed sufficient.

## Nested physical overlay scope

```text
node --test --test-name-pattern='authoritative nested workspace' \
  tests/semantic-worker-reference-snapshot.test.mjs
RED: exit 1; 0/1 PASS; duration 1,775.167 ms
```

An authoritative overlay owned by a nested workspace can also participate in
the parent workspace's semantic scope. Invalidating only the exact owner-root
revision misses this relationship. Canonical physical equal/ancestor/descendant
roots need revision fan-out; unresolved physical identity must fail conservative.
This does **not** authorize engine-wide invalidation of unrelated sibling roots.

`pnpm check`, build and combined public port, framed candidate-race and existing
`tests/lsp-workspace-global-freshness.test.mjs` are GREEN: 16/16 PASS, exit 0,
10,496.443 ms. This includes the existing unrelated-sibling isolation contract.
The framed transcript checks actual stderr for `semantic worker fatal`, not an
event name that the failing worker never emitted. Cached-parent-overlay behavior
requires its separate RED/GREEN; it is not inferred from this pass.

## Completed-cache invalidation for physical overlap

```text
node --test --test-name-pattern='cached parent reference' \
  tests/semantic-worker-reference-snapshot.test.mjs
RED: exit 1; 0/1 PASS; duration 1,455.836 ms
```

The first parent-root request and unchanged repeat both correctly returned five
Locations. Nested `Use` version 2 then changed its references; public hover
confirmed that mutation. The same parent Target version-1 request incorrectly
hit the old five-Location result cache instead of the new exact three.

Capture/final-dispatch checks cannot repair a completed cache hit: the mutation
owner must invalidate affected physically overlapping roots as well. The minimal
repair centralizes `invalidateRoot` in mutation revision fan-out, removing the
duplicate exact-owner sync/close invalidations. Existing watched-change global
clear remains; unrelated roots retain isolation. The combined command is GREEN:

```text
pnpm check && pnpm build && node --test --test-concurrency=1 \
  tests/semantic-worker-reference-snapshot.test.mjs \
  tests/semantic/references-candidate-snapshot.test.mjs \
  tests/semantic/references-result-cache.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs
exit 0; 18/18 PASS; duration 15,256.409 ms
```

## GREEN scope-isolation characterization

```text
node --test --test-name-pattern='sibling workspace edits|physical workspace alias edit' \
  tests/semantic-worker-reference-snapshot.test.mjs
exit 0; 2/2 PASS; duration 3,248.836 ms
```

Sibling open/change plus actual hover leaves the held parent's exact five
Locations intact and the next query cached without another batch. A symlinked
workspace sharing physical source authority instead invalidates held parent
work before candidate acceptance/verifier/cache, then the fresh canonical query
returns three exact Locations. This is scope-isolation characterization, not
permission to globally invalidate sibling roots.

## Framed nested mutation error classification

```text
pnpm build && node --test tests/semantic/references-candidate-snapshot.test.mjs
RED: 2 tests; 1 PASS, 1 FAIL
```

The extra real framed-LSP nested mutation transcript exposed another public
failure after the proxy fence was fixed: old work correctly failed inside the
proxy, but the response was InternalError (`-32603`) rather than ContentModified
(`-32801`). The parent's LSP request signal had not been aborted by the nested
owner mutation, so the semantic runner treated the proxy's typed content-modified
error as a generic internal failure.

Preserve client-cancellation and already-aborted first causes, then map that
typed error to the existing stale outcome/reference fallback. The public adapter
must classify it ContentModified without starting fresh verification or returning
partial Locations. `pnpm check`, build and the framed candidate-snapshot plus
existing workspace-global-freshness suite are GREEN: 13/13 PASS, exit 0,
5,479.160 ms. The nested transcript returns ContentModified without Locations,
fresh exact three Locations, normal nested version-2 diagnostics and exit 0.

The larger frozen-source focused regression and fixed Settings replay are
separate final gates; no new whole-fast result is inferred from these passes.

## Completed focused regression

Frozen source, actual command:

```text
node --test --test-concurrency=1 \
  tests/semantic/references*.test.mjs \
  tests/semantic-worker-reference-snapshot.test.mjs \
  tests/semantic-worker-anchor-seed.test.mjs \
  tests/semantic-worker-supervisor*.test.mjs \
  tests/lsp-production-semantic-worker.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs \
  tests/lsp-workspace-file-changes.test.mjs \
  tests/test-layer-manifest.test.mjs
exit 0; 146/146 PASS; duration 402,638.730 ms
```

Zero failures/cancellations/skips/todos; raw log:
`.bench/anchor-reuse-2026-09-27/candidate-snapshot-focused.log`.
`pnpm check`, build and preflight also pass. This is a broader focused gate,
**not** a new `pnpm check:fast` claim.

New candidate source/public port test/framed test/fixture remain
254/391/179/69 physical lines. The oversized proxy shrinks 822→694 (remaining
migration debt); semantic runner is 345. Existing four-transcript GREEN
characterization protected the cohesive candidate extraction before defect
implementation. No test was mechanically divided to hide size debt.

Fixed Settings/API24 same-build replay is separately recorded in
[the report](../reports/2026-09-27-settings-candidate-snapshot.md); no speedup or
memory graduation is inferred from synthetic correctness timing.

## Earlier whole-fast follow-up: no GREEN claim

The fresh restricted invocation hit an existing RSS-sampler `spawn EPERM`;
unchanged authorized single-test replay passed1/1. Authorized whole-fast then
had759 passing/5 failing log lines before stop (exit130), not a completed gate.
The rejected-anchor edit retry also timed out waiting for the fallback trace
in a targeted selection that overlapped the whole suite. Machine health showed
load298.77 and4,143.75MiB used swap on16GiB RAM; cause remains unproven.
Only own validated test process groups were stopped; no assertions/timeouts
were changed. The [report](../reports/2026-09-27-settings-candidate-snapshot.md)
retains logs and required idle-machine targeted/full recheck. The146/146 focused
GREEN is retained but does not replace this unpassed merge gate.

### Later idle targeted verification

At unchanged HEAD `9f91122ac504365c57473a430094da09baac9309`, with our prior
tests confirmed stopped, the five formerly failing anchor-reuse names passed
**5/5**, exit0,12,030.208ms, zero failures/cancellations/skips/todos. Raw log:
`.bench/anchor-reuse-2026-09-27/candidate-snapshot-idle-failures.log`.
Initial health was16GiB RAM, load2.97/4.29/18.51 and used swap4,077.75MiB.
Residual swap remains visible; this is not a claim of zero resource pressure.

Read-only review confirms the retry's previous fallback wait failed before
`didChange`, not because a wrong reference set was observed. No source fix,
timeout/assertion change or diagnostic reduction was introduced for this
recheck. The improved run is associated with different observed resource
conditions, not proof of the full cause of the earlier failures. Historical
failed/stopped evidence above is retained.

### Complete authorized idle whole-fast: FAIL

The unchanged-source authorized gate completed with1,056 tests: **997 PASS /
59 FAIL**, zero cancellations/skips/todos,2,365,703.412ms, exit1. Raw log:
`.bench/anchor-reuse-2026-09-27/candidate-snapshot-check-fast-idle.log`.
The previous505/30 interim spec-line observation was not a completed count.
Recorded mid-run health was load6.01/6.27/12.30, used swap4,960.25MiB of6,144MiB.
Targeted5/5 did not discharge this failing whole merge gate.

The failure parser displays56 timeout blocks, distinct from59 failed tests;
53 blocks include ready default DevEco API24 SDK selection, while the logging
block is ready=false. Same-build sequential isolated call-hierarchy controls
both pass: inherited default environment4,660.369ms (total4,912.322ms), then only
an explicit proven missing SDK path1,894.864ms (total2,121.697ms). The already
missing-SDK logging test also passes1/1 independently,1,830.424ms (total2,018.282ms).
Thus SDK scope affects this one workload's time, but the default isolated
timeout did not reproduce and SDK selection is not a complete failure cause.
No source/deadline/assertion/diagnostic change or statistical gate is claimed.
The failed403-file reference run has no completed compiler result. Its separate
missing-SDK control passes1/1 in9,985.109ms (total10,152.512ms) with the original
20s deadline and unchanged exact Locations. See the report for startup evidence;
these individual passes do not discharge the default-host failure.

### Controlled fixture-SDK whole-fast: GREEN

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
pnpm check:fast \
  > .bench/anchor-reuse-2026-09-27/candidate-snapshot-check-fast-fixture-sdk.log 2>&1
```

Completed outer summary: **1,056/1,056 PASS**, exit0, zero
failures/cancellations/skips/todos,2,012,515.851ms (~33.54min). Only inherited
fixture SDK selection changes; SDK-specific fixtures retain their explicit
pins. Source, tests, deadlines, assertions, diagnostics and runtime artifact
hashes remain unchanged and match the Settings manifest. Production defaults
and real Settings/API24 selection are not modified.

The full control's403-file case passes18,585.434ms under its original20s
deadline. The306,850.670ms constructor comparison is a whole multi-RPC test,
not a jump latency measurement. Host health during the passing control still
included swap5,204.50MiB and load6.62/6.80/6.70 on16GiB RAM; neither host pressure
nor SDK selection is proven to be the sole earlier failure cause.

The controlled fixture gate is GREEN, **not** a reclassification of the completed
default-host997/1,056,59-failure gate. Its investigation remains open and all
failed/stopped logs remain preserved. No source repair, timeout relaxation,
≤500ms/product memory graduation or Windows claim follows from the control.

## Preserved admission requirements

Before syncing a captured document, candidate-stage work must reject an aborted
or invalidated operation. The same barrier applies to cached-anchor/document
sync routes: response freshness alone is too late if old text already reached
the worker. Operation-local project/SDK/workspace and relevant-overlay capture
must be rechecked after asynchronous work, not reconstructed from mixed times.

The public LSP regressions preserve all of the following:

- Old work fails ContentModified without partial Locations.
- Fresh Target references exclude the removed Query references and retain the
  exact known Target/Use locations, without concealing rollback by resync.
- Current version-2 diagnostics still publish normally.
- Graceful shutdown completes and actual stderr contains no
  `semantic worker fatal` failure.

This slice does not complete authoritative extensionless source availability,
compiler-backed constructor search coverage or narrowed references. Any later
exclusion still requires exact public differential and fixed Settings/API24
validation. Cold/edit ≤500 ms, original >3 GB reproduction and final memory
graduation remain open gates. No commit/push/merge claim.
