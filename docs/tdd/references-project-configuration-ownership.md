# R-10 caller-owned project configuration capture

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; existing edits preserved.
Follows [SDK configuration ownership](references-sdk-configuration-ownership.md),
[candidate freshness](references-candidate-snapshot.md) and
[ADR 0005](../adr/0005-index-proof-trust-boundary.md).

## Public ownership contract

`configureProject` must capture its own project selection rather than retain
a caller's mutable object. Node candidate source resolution, the package
resolver and the semantic Worker must use that same owned selection. Mutating
the original caller object without another configuration call is not an
authoritative project revision and must not silently change one side's target.

The [public-port test](../../tests/semantic-worker-project-snapshot.test.mjs)
uses `SemanticWorkerEngine`, an actual semantic Worker/compiler, and an
external NDJSON index fixture. It does not invoke private server internals,
but it is **not a framed-LSP/real Rust semantic-index certification**. Its
optional project-source-proof mode exists only in the external test fixture.
The slice changes no production defaults, dependency/SDK profile, compiler
admission policy, Worker lifetime/count, memory budget or diagnostic capability.

## Fixture control before production RED

The workspace has module `alpha`, product `default`, and two valid targets:
`tablet` and `desktop`, with different `Target.ets` contents. Both main-source
files import `Thing` from the self-package specifier `snapshot/Target`.
The original selection is `{product:"default", targets:{alpha:"tablet"}}`.

First the real Worker definition query must resolve to the tablet declaration
at UTF-16 `0:12–0:17`. A references request for Query.ets `1:18`, declaration
included, then waits at the external candidate-status boundary. The fixture
requires exactly one retry containing the original tablet source URI, not an
SDK `externalTerminalIdentity`.

The initial fixture-capability test is **1/1 FAIL**, test 2,719.386924 ms,
total 2,985.435533 ms (`project-source-proof-fixture-red.log`). The fixture had
not yet supplied the import binding needed for source-proof retry. This is a
fixture/tooling RED, **not the production ownership defect**.

After adding the optional project binding/proof mode, the unchanged-caller
control is **1/1 PASS**, test 1,803.177329 ms, total 2,071.141095 ms:
`project-source-proof-control-green.log`. The fixture accepts only the exact
tablet source proof; wrong-target proof remains unsupported, not invented.

## Actual production RED, independently repeated

After `status.held`, mutate only the original nested caller value:
`configuration.targets.alpha = "desktop"`. Do not reconfigure, edit files,
advance document versions or change the captured authoritative selection.
Release status and inspect the public index request.

The Worker retains tablet, while Node retries with `resolvedSourceUri` pointing
to desktop. The required source-proof equality fails twice:

Historical RED command (before repair; the current fixed source should pass):

```sh
node --test --test-concurrency=1 \
  --test-name-pattern 'references keep the configured project snapshot' \
  tests/semantic-worker-project-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/project-configuration-owner-red.log 2>&1
```

| Run | Test ms | Total ms | Result |
| --- | ---: | ---: | --- |
| `project-configuration-owner-red.log` | 2,352.298536 | 2,633.685588 | 0/1 PASS |
| `project-configuration-owner-red-repeat.log` | 1,957.012100 | 2,229.766845 | 0/1 PASS |

Both still complete with documentVersion 1 and the same **five exact Locations**:

| Workspace-relative source | UTF-16 range |
| --- | --- |
| `module/src/tablet/Target.ets` | `0:12–0:17` |
| `module/src/main/ets/Query.ets` | `0:9–0:14`, `1:18–1:23` |
| `module/src/main/ets/Use.ets` | `0:9–0:14`, `1:16–1:21` |

This reproduces split configuration ownership and lost eligible source proof,
not a missing-reference result, a Windows drive-letter mismatch, or a 5 GB
root cause. Safe conservative compiler verification already protected the
final result; checking only Location counts would conceal the defect.

## Minimal GREEN and characterized extraction

Clone `selection` before advancing revision or invalidating the cache. Store
that owned value, configure the package resolver with it, and send the same
value to the Worker. No normalization or catch-to-default/fallback is added.
Ordinary JSON-shaped project selection is the supported test input; arbitrary
prototypes, getters, nonenumerable properties and non-cloneable JS inputs are
not compatibility-certified. Clone-before-revision is visible in code, but
no new public atomic-clone-failure RED is claimed.

Project control/mutation and existing SDK/query/root snapshot characterization
pass **11/11**, zero skips/cancellations/todos, **16,171.029650 ms** total in
`project-configuration-owner-green-pre-extraction.log`.

The first fixture/control command runs only the project test file with
`node --test --test-concurrency=1`; it then contained only the first test.
The 11-case characterization adds
`tests/semantic-worker-reference-snapshot.test.mjs` under the same serial flags.

Under that GREEN boundary, three stateless file-identity helpers move verbatim
to `semantic-worker-file-identity.ts` (31 lines). The proxy shrinks **658→631**
physical lines; 631 remains migration debt, not permission to grow. The new
public-port test is 178 lines and held-status fixture 96 lines. Canonical
physical identity behavior is preserved; no unconditional lowercasing is added.

## Broader gates

`pnpm check` and `pnpm build` pass. The new test initially fails inventory
classification (`project-snapshot-layer-red.log`); it is registered in
`unit-contract`, bringing total classified entry paths to 121. This is separate
developer-tooling RED/GREEN, not the production ownership RED. That layer RED
is 3/4 PASS, total 294.307763 ms, and reports the new test has no assigned layer.

The post-extraction nine-file regression **does not pass its first run**:
`project-configuration-owner-focused-green.log` reports **60/61 PASS**. The
only failure is the old expected `unit-contract` count 58 versus actual 59;
all selected semantic/LSP tests pass. The filename is not a success verdict.
Updating the expected exact count to 59 reflects the new registered entry,
not a weakened assertion. The first run totals 57,807.370324 ms. The unchanged
61-case rerun is now **61/61 PASS**, zero skips/cancellations/todos, exit 0,
**61,125.749454 ms**, in `project-configuration-owner-focused-recheck.log`.

The pinned final-source Settings/API24 replay now passes: **267 exact Locations**,
normal version-1 diagnostics (one unresolved `@ohos.systemparameter`, TS2307),
normal shutdown/exit 0. References take **58,636 ms** at the harness and the
constructor seed still falls back to 14 complete conservative batches.
This is compatibility evidence, not a narrowing or ≤500 ms graduation.

Fresh final-source controlled `pnpm check:fast` now passes **1,060/1,060**,
zero failures/cancellations/skips/todos, exit 0, **847,100.571762 ms**. The
server/Worker/verifier/sidecar hashes match the pinned Settings replay. Use
the final aggregate, not nested test-runner self-test child output or raw
passing-line counts. The earlier 1,058-case recovery remains prior-source
history; this 1,060-case run certifies the new source's controlled fast gate.
No performance, memory, default-host SDK, original >3 GB, DevEco or Windows
graduation follows.
See [the report](../reports/2026-09-28-settings-project-configuration-ownership.md)
for raw hashes and final gate updates.
