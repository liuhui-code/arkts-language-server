# SDK completion execution plan

Goal: encapsulate SDK parsing behind a compiler-neutral component boundary,
complete selected OH/HMS inputs, and preserve compiler-authoritative SDK queries
and auto-imports. Decision: [ADR0038](../adr/0038-sdk-component-environment.md).

## Completed implementation

- Immutable `SdkProvider`/component descriptors, bounded configuration reads and
  digests, actual load witnesses, documented HMS discovery and explicit selection
  precedence. Invalid components and incompatible API versions remain explicit.
- Ordered OH/HMS module resolution, `.d.ts`/`.d.ets`, actual Kit re-exports and
  relative dependencies with lexical/physical containment. Component-aware source
  classification, readiness, registry retention and reference consumers.
- Compiler resource locations behind descriptors; SDK setup extracted from the
  language service. No new asynchronous constructor, Worker or lifecycle owner.
- Project-model selected-product SDK target, separately qualified numeric/API
  aliases and version ranges, runtimeOS views, public diagnostics and ordinary
  refresh repair. No SDK code reselects a product or guesses version aliases.
- SDK-only native compiler auto-import Program, separate input proof, existing
  registry leases and final request fence. Public Kit routes plus API exports;
  >4096 ambient-entry recovery preserves the generic scan/result limits. Stale
  handles cannot emit old edits. Two workspace SDK indexes remain isolated.
- Gate repairs: child stdin EPIPE rejects pending transport requests; physical
  SDK facts reuse full load observations to preserve the existing validation
  budget. Test-layer assignments/counts include every new executable entry.

## Verification

| Check | Result |
| --- | --- |
| `pnpm check` and `pnpm build` on integrated code | PASS |
| HMS, discovery, target model, transport and manifest combined | 41/41 PASS |
| Existing project-model characterization | 27/27 PASS |
| Input validation budget, cache/lifecycle and cancellation focused checks | PASS; see TDD record |
| Installed API24 acceptance, all 13 cases | 13/13 PASS; zero skipped/cancelled |
| Native-permission `pnpm check:fast` | Running; final result pending |
| Source size and `git diff --check` | PASS except declared existing LS migration debt |

The prior full native gate (before target/export integration) finished
2168/2171 with three failures: interrupted transport, duplicate SDK path facts,
and test-manifest counts. Each received a focused repair; the fresh final gate
runs on integrated production code. Logs and RED/GREEN commands are recorded in
[TDD evidence](../tdd/sdk-environment-20261101.md).

## Delivery boundary

Implementation is complete; final validation and reviewable branch delivery are
pending. Keep the 14 absent declarations in the installed API24 distribution
partial. This plan does not graduate the separate 500ms/memory, Windows runtime
or real editor UI acceptance goals. SDK configuration remains available on all
supported platforms; automatic installation defaults retain their existing scope.

The existing language-service source shrinks from 3072 to 2985 physical lines
and remains explicit migration debt. All other changed/new handwritten source,
test and script files stay at or below 500 lines. Delivery uses a branch and PR;
no direct main merge or release is included.
