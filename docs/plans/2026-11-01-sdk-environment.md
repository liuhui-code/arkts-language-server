# SDK completion execution plan

Goal: encapsulate SDK parsing behind a compiler-neutral component boundary,
complete selected OH/HMS inputs, and preserve compiler-authoritative SDK queries
and auto-imports. Decision: [ADR0038](../adr/0038-sdk-component-environment.md).

## Completed implementation

- Immutable `SdkProvider`/component descriptors, bounded configuration reads and
  digests, actual load witnesses, documented HMS discovery and explicit selection
  precedence. Invalid components and incompatible API versions remain explicit.
- Ordered OH/HMS module resolution, `.d.ts`/`.d.ets`, actual Kit re-exports and
  relative dependencies with lexical/physical containment, including SDKs nested
  inside a workspace. Component-aware source
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
- Compiler-recorded SDK declaration closure checks cover relative imports, SDK
  namespace imports, type references and physical file references despite
  `skipLibCheck`. Actual compiler ambient/wildcard binding stays authoritative;
  incomplete optional export indexes retain healthy candidates.
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
| Final HMS boundary/export/declaration-input suite | 31/31 PASS |
| SDK declaration inputs, runtime globals and input-validation budget | 57/57 final combined contracts PASS |
| Boundary plus source-witness and SDK cache suite | 36/36 PASS |
| Full-gate repair convergence | 71/71 PASS; original assertions retained |
| Shared SDK syntax reuse, initialization and lifetime repair | 90/90 PASS; original one-parse and completeness assertions retained |
| Retained module groups and partial-SDK full-scope owners | 9/9 PASS on unchangedf9c0366; original Program and SDK-parse assertions retained |
| Atomic fault-counter publication and cleanup ownership | 34/34 PASS; deterministic JSON-publication regression and original fault assertions |
| Reference replay runtime/source isolation | 30/30 PASS plus20 rounds/60 case executions; controlled churn and original exact-reference/cancellation assertions |
| Complete `pnpm check:fast` | Final2713d68 CI2208/2208 PASS; zero failed/skipped/cancelled/todo |
| Live reference-log observer repair | 43/43 plus final strict-reader17/17 PASS; CI partial-JSONL race reproduced and repaired |
| Canonical native debug cold-catalog gate | PASS on2713d68; original455-file/debug/3s assertion retained; [release CI](https://github.com/liuhui-code/arkts-language-server/actions/runs/41302692118) |
| Source size and `git diff --check` | PASS except declared existing LS and local-delivery migration debt |

The prior full native gate (before target/export integration) finished
2168/2171 with three failures: interrupted transport, duplicate SDK path facts,
and test-manifest counts. Each received a focused repair; the fresh final gate
uses a fixed final implementation commit in a detached clean worktree. An intervening
integrated run was interrupted after root commits changed its pinned revision;
it is not acceptance evidence. Logs and RED/GREEN commands are recorded in
[TDD evidence](../tdd/sdk-environment-20261101.md).

## Requirement audit

| Requirement | Authoritative evidence | State |
| --- | --- | --- |
| Compiler-neutral SDK component boundary | `SdkProvider`/`SdkEnvironment`/`SdkComponent`; immutable discovery public regression | PASS |
| OH/HMS metadata, configured API paths and namespaces | HMS direct/relative/custom-prefix/`.d.ets` transcripts; incompatible/invalid component cases | PASS |
| Public Kit semantics and unimported exports | Compiler-native provider; public Kit resolve actions; `.d.ets`, >4096 ambient and optional-closure transcripts | PASS |
| Selected product/version/runtimeOS view | Project model 3 new plus 27 characterization cases; public mismatch, alias, range and OS transcripts | PASS |
| Actual input freshness and physical ownership | Negative-to-positive refresh, stale handle, byte replacement, SDK escape/nested boundary and existing source-fence cases | PASS |
| Stable SDK gaps retain local service | Relative/module/type references are partial; six capabilities and healthy local navigation; ambient/wildcard positive cases | PASS |
| Existing cache, cancellation and lifetime owners | Original project recovery, SDK optional failures and actual release-after-effect quarantine; included in2206/2206 full run | PASS |
| Same-process multi-root SDK replacement | Public two-root HMS facade replacement, first root updated and second root completion/resolve preserved | PASS |
| ADR and reviewable branch | ADR0038, TDD records, PR #111 | DELIVERED; per-revision evidence linked |
| Final integration gate | Linux canonical release and Windows installation both pass on2713d68 | [PASS](https://github.com/liuhui-code/arkts-language-server/actions/runs/41302692118) |

The added multi-root replacement characterization runs against the unchanged
final implementation. It strengthens the earlier static isolation case; it does
not substitute that earlier case for replacement acceptance. The immutable full
gate retains its original test snapshot; production sources remain identical.

## Delivery boundary

Implementation and agreed automated acceptance are complete on
`2713d68d935d02c1c974f26e488bdcde0f60c69e`. The
[complete release CI](https://github.com/liuhui-code/arkts-language-server/actions/runs/41302692118) passes: Node2208/2208,
Rust workspace222 passed plus the separately executed original debug cold-catalog
gate, artifact7/7, pinned large-workspace1/1 and Windows install/reinstall/stdio.
The same release source passes all13 actual API24 SDK cases on this Mac.

The user authorised integration through PR111 without rerunning tests.
Changes after the verified snapshot are documentation only: SDK path guidance,
ADR status and final evidence. Commit/merge messages skip CI to honour that
instruction. Actual merge state is recorded by
[PR111](https://github.com/liuhui-code/arkts-language-server/pull/111).

The installed API24 distribution's14 absent declarations remain partial.
The supplementary Mac debug cold-catalog run remains over3s; prior failures
and paired observations stay in the TDD record. This plan does not graduate
separate500ms/memory, Windows real-SDK runtime or real editor UI goals.
SDK configuration remains available on supported platforms; automatic
installation-path discovery remains limited to its existing macOS scope.

The existing language-service source shrinks from 3072 to 2985 physical lines
and remains explicit migration debt. The release-pipeline extraction also reduces the existing local-delivery test
from644 to526 lines; its remainder is migration debt. All other changed/new
handwritten source, test and script files stay at or below500 lines. Delivery uses a branch and PR;
no direct main merge or release is included.
