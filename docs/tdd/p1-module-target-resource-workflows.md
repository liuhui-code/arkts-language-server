# P1 module / target / resource integration

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`.
Branch: `codex/project-model-phase1`. The preceding local/installed-package slices
remain uncommitted in the same working tree and are preserved.

## Public acceptance

`tests/semantic/project-module-resources.test.mjs` creates fixed, isolated project
files and drives the real bundled child server using Content-Length stdio.
Assertions check exact target URIs and UTF-16 ranges, completion membership,
diagnostic codes/ranges, unchanged document versions and warm/fresh equivalence.
No private semantic collaborators are mocked. Source selection and SDK selection
have separate real-process suites; model/admission tests supplement these suites.

For each transcript the focused command is:

```sh
pnpm build
node --test --test-name-pattern='<scenario below>' tests/semantic/project-module-resources.test.mjs
```

Each RED below preceded its production change. Name-filtered runs select one
vertical slice; full-suite GREEN runs do not skip tests.

| Scenario pattern | Observed RED | Minimal GREEN change |
| --- | --- | --- |
| `resource definition respects` | Alpha definition additionally returned unrelated Beta's same-name resource | Shared project model and module-scoped resource index |
| `explicit product target` | Returned main resource instead of explicitly mapped tablet target | Read the named target's configured resource directories |
| `changing module ownership` | Removed module retained its warm resource definition | Build-profile watcher enters existing rootDirty invalidation |
| `self-package source` | Definition stayed at unresolved consumer import instead of target Test.ets | Shared package resolver consults target sourceRoots for self-package imports |
| `explicit project selection` | Multiple targets returned no definition despite initialize selection | Validated explicit project selection passed to the shared model |
| `changing the project selection` | Runtime target change retained tablet definition instead of main | Standard configuration notification reuses cancellation, rootDirty and diagnostic refresh |
| `does not have to be named` | Explicit resources_tablet directory returned no definition | Explicit resource roots define accepted relative resource layout |
| `custom resource edits` | Definition stayed present after the selected resource was removed | Candidate watchers use model-confirmed resource ownership |
| `invalid target selection` | No project configuration diagnostic was published | Unavailable scope reports arkts.project.configuration, not a false missing-resource error |

The sibling-completion/missing-resource workflow was added as characterization
after the first isolation fix and passed directly; no separate RED is claimed.

## Integration regressions caught before the full gate

- Watch registration assertions were first extended for build-profile,
  local.properties and configured resources. Each failed before adding its
  production registration. `tests/lsp-workspace-file-changes.test.mjs` exercises
  the actual standard LSP registration request.
- A broad resource-candidate classification initially admitted invalid legacy
  `resources/element/string.json` and `resources/base/dark/element/string.json`.
  `node --test tests/workspace-file-change-coordinator.test.mjs` caught it
  (20 passed, 1 failed). The coordinator now asks the shared semantic project
  model to confirm configured roots; its standalone default keeps the original
  strict resource layout. The old assertions were not loosened.
- A configuration symlink fix initially compared only lexical workspace roots.
  A new public coordinator regression with a workspace directory alias failed:
  no dirty batch was returned. Configuration ownership now also normalizes the
  parent directory without following the final configuration symlink. Source and
  resource events still require physical workspace containment.
- Test-layer auditing failed for the new unregistered entries before they were
  registered. The manifest now accounts for 87 entries (42 unit-contract,
  8 protocol, 32 bundle-e2e and the unchanged non-fast layers).

Focused integration GREEN: 31/31 for the ten module/resource transcripts and
21 coordinator contracts; 18/18 for module/resource plus the eight SDK transcripts.
The final full-gate result is recorded in the execution plan after code freeze.

Final frozen-code gate: `pnpm check:fast` passed **747/747**, with zero
failures/cancellations/skips/todo, in 366.96 seconds. This batch adds 62 tests to
the previous 685-test baseline. Raw log:
`/private/tmp/arkts-p1-completion-fast.viiiTX`. `git diff --check` also passed.
Only documentation was synchronized after code/test freeze; no commit, push,
merge or release was performed. The remaining real SDK dialect/API compatibility
acceptance is intentionally not marked complete by this gate.

## Explicit service configuration

Initialize with `initializationOptions.project`, for example:

```json
{"project":{"product":"default","targets":{"alpha":"tablet"}}}
```

Runtime selection uses standard `workspace/didChangeConfiguration`:

```json
{"settings":{"arkts":{"project":{"product":"default","targets":{"alpha":"default"}}}}}
```

These are this language server's settings, not invented Hvigor build-profile
fields. Empty `{}` restores service defaults. Default product `default` is a
documented server policy, not an assertion about the IDE's current Build Target.
Without an explicit override, only a unique product-associated target is usable.
Unknown products/targets, malformed configuration and ambiguous selection fail
closed with a configuration diagnostic. Source overlays survive a selection change.

## Official basis and scope

- [Project build-profile fields](https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-hvigor-build-profile-app):
  module name/srcPath and named target/product mappings.
- [Multi-target source spaces](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-customized-multi-targets-and-products-guides):
  module `source.sourceRoots`, self-package imports such as `entry/Test`, and
  target-specific source space ahead of the shared `src/main` space. This is not
  a rule rewriting arbitrary relative imports.
- [Multi-product target mapping](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-multi-product-target-practice):
  implicit default-product mapping excludes ohosTest; more than one target can
  belong to a product, so array order cannot determine active selection.
- Read-only inspection of official installed `@ohos/hvigor-ohos-plugin` **6.24.2**,
  `src/tasks/service/target-task-service.js::getResourceDirs` and
  `src/tasks/abstract/abstract-resource-task.js::initConfigTargetResource`,
  confirms that a nonempty `resource.directories` replaces the default module
  resource directory; missing/empty arrays use the default. No build script was
  executed and no installed SDK/tooling was modified.

The workspace identity and single existing TypeScript engine are preserved;
resource indexes are not duplicated without bound per module. Existing resource
file/byte/entry budgets remain in force. Directory enumeration now stops before
materializing an oversized directory (separate budget evidence).

Supported scope remains explicit: in-workspace module roots, source/static
self-package resolution, string resources in the selected module, and explicit
SDK paths. External srcPath, HAR/AppScope resource merging, generated resources,
full resource conflict precedence, cross-module sourceRoots imports and generic
build-script evaluation are not claimed. Actual SDK dialect/compiler conformance,
installed-artifact/Zed acceptance and large-project p95/RSS are separate gates;
the fixture results do not prove them.

Documentation-only evidence update: owner=current task maintainer;
scope=this file; expires=2026-09-14.

## Self-package alias-overlay regression

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`.
Read-only review found that the self-package branch did not forward the existing
physical-path-to-open-overlay callback used by both DocumentStore and the
TypeScript host. The regression was first observed through real framed stdio:

```sh
node --test --test-name-pattern='self-package definition uses an alias overlay' tests/semantic/project-module-resources.test.mjs
```

RED: definition returned disk `Test.ets` line 0 rather than the opened alias
`TestAlias.ets` line 2, ignoring unsaved content. The minimal fix forwards the
existing overlay callback into `resolveSelfSource`, resolves candidate physical
identity, and returns the live overlay URI. It preserves physical source-root
containment and the existing prohibition against rescuing an escaping or
dangling symlink with an overlay. Missing files require an existing contained
parent before an overlay can be admitted.

GREEN: `pnpm check && pnpm build` passed; the focused real LSP test passed both
the alias/unsaved exact-range assertion and disk restoration after didClose.
A second real LSP characterization covers a diskless target overlay, preserving
the existing new-file behavior without another production change.

Source-root first-success order was checked against the installed official
hvigor 6.24.2 implementation rather than guessed: `src/tasks/ark-compile.js`
`getSelfPkgBriefInfo()` keeps configured roots, then `src/main`, then generated
roots; `getTscAddressPaths()` preserves this ordering. Its bundled
`@ohos/hvigor-arkts-compose/dist/src/plugins/node-resolve/index.js`
`addSourceRootsIntoImportSpecifiers()` appends in that order and
`doNativeResolve()` loops by index and returns the first successful result.
The corresponding TypeScript `tryLoadModuleUsingPaths()` likewise returns the
first successful substitution. Existing root order was intentionally preserved;
support for generated-source roots is still not claimed.
