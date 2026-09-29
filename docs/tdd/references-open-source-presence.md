# R-10 captured open-source presence

Status: **diskless RED reproduced; first repair 12/12 GREEN; later physical
identity-drift RED reproduced; final public characterization 13/13 GREEN;
final focused regression 95/95 GREEN; Settings 267 exact PASS;
fresh controlled whole-fast 1,062/1,062 GREEN**.
Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; inherited edits preserved.
Follows [project configuration ownership](references-project-configuration-ownership.md),
[candidate snapshot freshness](references-candidate-snapshot.md),
[architecture overlay authority](../architecture.md) and
[ADR 0005](../adr/0005-index-proof-trust-boundary.md).

## Public presence contract

An open source document can be authoritative even when its path has never
been written to disk. Node's candidate-stage local-package source resolution
must see the same managed open-source presence as the semantic Worker. Disk
absence alone must not discard an otherwise resolvable open self-package
target. Capture the presence input before the first asynchronous boundary,
under the existing root/configuration revision fences.

This is a source-resolution prerequisite, **not** a complete reference search
scope, declaration identity, competing-source absence or constructor proof.
The index still does not produce final semantic Locations.

## Closest public interface and fixture

The third case in
[the public-port test](../../tests/semantic-worker-project-snapshot.test.mjs)
uses `SemanticWorkerEngine`, a real semantic Worker/compiler and the existing
external NDJSON held-status fixture. It does not call private engine methods,
but is **not a framed-LSP or real Rust completeness certification**.

Reuse module `alpha`, product `default`, targets tablet/desktop and self-package
`snapshot`. The test creates tablet's parent directory but deliberately does
not write `module/src/tablet/Target.ets`. It asserts disk absence, then supplies
that source through public `engine.sync(target)` before definition/references.
Main `Query.ets` and `Use.ets` import `Thing` from `snapshot/Target`.

Configure tablet. Query is main `Query.ets`, zero-based UTF-16 **1:18**,
`includeDeclaration=true`, documentVersion 1. The Worker definition must select
the open tablet declaration at **0:12–0:17**. References must complete with
five individual exact Locations, not merely the right count:

| Workspace-relative source | UTF-16 range |
| --- | --- |
| `module/src/tablet/Target.ets` | `0:12–0:17` |
| `module/src/main/ets/Query.ets` | `0:9–0:14`, `1:18–1:23` |
| `module/src/main/ets/Use.ets` | `0:9–0:14`, `1:16–1:21` |

The external protocol must also receive exactly one source-proof retry:
`bindingUri=Query.ets`, `sourceSpecifier="snapshot/Target"`,
`resolvedSourceUri=tablet/Target.ets`, with no SDK terminal identity.
The test uses a deliberately unavailable SDK; it is a narrow source-presence
regression, not a large-project or SDK memory benchmark.

## Actual production RED and controls

The real Worker definition is correct and conservative compiler verification
still returns all five exact Locations. The failure is **zero source-proof
retries versus one required retry**: candidate resolution used disk-only
presence, so the self-package binding remained unresolved.

| Raw log under `.bench/anchor-reuse-2026-09-28/` | Result | Test / total ms |
| --- | --- | ---: |
| `reference-overlay-source-red-1.log` | 0/1 PASS; diskless source retry missing | 3,042.252732 / 3,325.623683 |
| `reference-overlay-source-controls-red-2.log` | 2/3 PASS; diskless case fails again | diskless 1,580.176487 / total 4,506.184574 |

The second run retains the on-disk target control (1,567.978970 ms) and the
caller-project-mutation control (1,086.871270 ms), both PASS. All terminal
runs have zero cancellations/skips/todos. Durations are whole test/run times,
**not RPC latency or a 500 ms product result**.

This reproduces lost eligible source resolution/fallback work, not a
missing-reference result, Windows path-case defect or 5 GB root cause.
Checking the final reference count alone would miss the divergence.

Historical RED commands, executed before repair with unused-log guards.
The first command filters only the new case; the second then contained three
cases, before the drift test was added. Existing artifacts now make the
guards refuse replay/overwrite. The original shell wrapper preserved the
test exit status while printing its terminal output.

```sh
test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-source-red-1.log && \
node --test --test-concurrency=1 \
  --test-name-pattern 'unsaved project target absent on disk' \
  tests/semantic-worker-project-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-source-red-1.log 2>&1

test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-source-controls-red-2.log && \
node --test --test-concurrency=1 tests/semantic-worker-project-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-source-controls-red-2.log 2>&1
```

## First GREEN and characterized extraction

Capture managed open-document paths synchronously in the existing references
input snapshot before candidate IO. Give the captured `hasOverlay` and
`overlayPath` callbacks to the existing `LocalPackageResolver`; do not invent
a second resolver or new semantic authority.

Physical mapping uses realpath for an existing regular file. For a genuinely
absent new file, require `lstat` to report ENOENT and its parent to have a
resolvable physical identity before joining the basename. A dangling link,
other existing object, unresolvable parent or unknown identity is not proof
of an unsaved new source. No unconditional path lowercasing is introduced.

Competing lexical aliases of one physical file cannot authorize new source
proof by guessing the Worker's effective buffer from Map insertion order. The helper's
`complete` flag means the captured managed physical mapping is usable; it does
**not** establish complete workspace source availability, absence of all
competitors, complete binding/constructor coverage or index completeness.
Existing revision/cancellation checks still guard resumed work.

The initial combined public project/reference-snapshot characterization passes
**12/12**, zero failures/cancellations/skips/todos, **18,206.324625 ms** total:
`reference-overlay-source-green-pre-extraction.log`. Under that GREEN,
`ReferenceInputState` coherently extracts root/configuration revision ownership
and captured inputs. The proxy shrinks **631→614** physical lines; 614 remains
explicit migration debt. The snapshot helper is 121 lines and project test
219 lines at the subsequent safety-repair checkpoint.

The first broader 11-file focus passes **94/94**, **104,666.430454 ms** total
(`reference-overlay-source-focused.log`), including the existing framed-LSP
diskless import case. Its exact three-reference assertion is strengthened
without adding a new case. This is **before the following safety repair**, not
the final-source regression gate.

## Additional actual RED: physical alias drift

The fourth public-port case opens `tablet/Alias.ets`, a symlink to tablet's
Target. The real Worker definition first points to the open Alias declaration.
While candidate status is held, retarget Alias to desktop without sending a
managed document/project revision event, then release candidate selection.
The captured presence must not silently become proof of another disk source.

Historical RED command:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-identity-drift-red.log && \
node --test --test-concurrency=1 \
  --test-name-pattern 'overlay alias retargeted during candidate selection' \
  tests/semantic-worker-project-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-identity-drift-red.log 2>&1
```

Actual **0/1 PASS**, test **2,117.846303 ms**, total **2,390.786179 ms**.
Expected source-proof retries are zero, but actual retries are one. The
generic package resolver catches an overlay identity exception and falls
through to canonical disk resolution; indexed proof is accepted before
compiler-anchor-mismatch causes conservative verification. The RED still
finishes with five Locations. This does not justify trusting that proof.

The repair records a sticky observed identity-change flag in the captured
snapshot and calls `assertUnchanged` **outside the resolver's catch boundary**
after resolution, before emitting source proof. It does not change the generic
resolver. The public safety test requires zero source-proof retry and an
explicit index-error fallback containing the physical-identity failure.
It is not a proof of all filesystem races, immutable disk contents or absence
of every competing source. Final-source public characterization now passes
**13/13**, zero failures/cancellations/skips/todos, exit 0,
**22,307.437880 ms** total in `reference-overlay-source-final-public-green.log`.
This includes the new drift rejection and the prior snapshot controls.

No production default, SDK/dependency profile, membership policy, Worker
count/lifetime, memory budget or diagnostic capability changes.

The final 11-file focused rerun now passes **95/95**, zero
failures/cancellations/skips/todos, exit 0, **108,196.166700 ms** total in
`reference-overlay-source-final-focused.log`. It includes actual framed-LSP
regressions as well as port characterization. `pnpm check` and build pass.
Use this post-safety-fix run, not the earlier 94-case source, for focused
verification of the captured-input extraction and sticky identity guard.

The pinned final-source Settings/API24 replay completes **267/267 exact
Locations**, normal version-1 diagnostics and shutdown/runner exit 0. Harness
references RPC takes **60,696 ms**, sampled Node maximum is **745,988,096 bytes**;
constructor seed rejection still leads to 14 complete-scope batches. This is
single-run compatibility evidence, not a 500 ms, narrowing or memory graduation.

## Final-source gates and remaining product scope

- Final diskless/physical-drift/on-disk/configuration/snapshot controls are
  13/13 GREEN; do not substitute this subset for broader final-source gates.
- Final focused snapshot/package/target/alias/framed-LSP regression is 95/95
  GREEN; exact argv, runtime hashes and terminal totals are in the report.
- Fresh fixed Settings/API24 replay passes the same exact constructor oracle
  with diagnostics and the original deadline; its latency target remains RED.
- Fresh final-source controlled `pnpm check:fast` passes **1,062/1,062**, zero
  failures/cancellations/skips/todos, exit 0, **840,424.405207 ms** total.
  The final aggregate, not nested self-test output or an interim count, is
  authoritative. The separate default-host environment remains uncertified.

Runtime hashes match the Settings manifest after the gate. A read-only public
replay-input preflight also revalidates its standard-library aggregate and
SDK declaration digest, without creating output. The terminal tool output
is evidence; no additional persisted preflight log is invented.

The preceding slice's 1,060/1,060 fast gate and 267-reference, 58.636 s Settings
replay are **prior-source history**, not verification of this repair. Final
evidence is recorded in
[the open-source presence report](../reports/2026-09-28-settings-open-source-presence.md).
Complete overlay/source availability, binding-RPC consumption, constructor
narrowing, 500 ms, original >3 GB, final memory/PSS and native Windows gates
remain separate work; this slice cannot graduate them.
