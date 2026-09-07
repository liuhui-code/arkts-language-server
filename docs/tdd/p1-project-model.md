# P1 project module ownership

Date: 2026-09-07
Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`
Scope owner: `phase1_project_path` (model); root owns resource/LSP composition.

## First vertical slice

Resolve the current source file's declared module from the root
`build-profile.json5` `modules[].srcPath` without changing workspace identity or
creating another TypeScript engine. Module resource lookup uses
`<module>/src/main/resources`; it must not merge sibling modules.

The model reuses the pinned JSON5 parser, reads at most 64 KiB per profile, and
accepts at most 256 declared modules. The lazy snapshot and returned arrays are
immutable. `invalidate()` discards the snapshot. Missing profiles preserve the
legacy workspace root; invalid configuration, ambiguous module declarations,
and paths outside the supported physical workspace fail closed.

## RED

Command, observed by the model owner before adding production code:

```sh
pnpm build && node --test tests/semantic/project-module-resources.test.mjs
```

Result: 0 passed, 1 failed. Definition on `alpha`'s `app.string.title` also
returned the sibling `beta` resource. This is a real child-process, framed stdio
LSP regression, not a mocked provider result.

## Verification

`pnpm check` passed after adding the model. After the root agent connected the
resource scope, the focused real LSP test passed (1/1). Direct model tests are
supplementary public API contracts and do not replace public LSP evidence.

## Explicit target resource directories

The next regression was observed through:

```sh
node --test --test-name-pattern='explicit product target' tests/semantic/project-module-resources.test.mjs
```

RED: the requested tablet resource definition incorrectly returned the default
`src/main/resources` URI. One selected test failed; the other test was filtered.
The model now selects the only root-module target explicitly mapped to product
`default`, then finds exactly that named target in the module build-profile.
Missing, ambiguous, and unknown targets fail closed. It reads the actual
`target.resource.directories` field, validates bounded relative physical roots,
and defaults to `src/main/resources` only when the selected target does not
specify directories. Array order is not used to choose a target.

GREEN: `pnpm check` passed, and rebuilding followed by the real LSP suite passed
both original module ownership and explicit target resource tests. During that
run the root agent's newly added watched-ownership test remained RED and was
handled separately by the root-owned watcher slice.

## Target source context and empty resource directories

The next real LSP RED was observed with:

```sh
node --test --test-name-pattern='self-package source' tests/semantic/project-module-resources.test.mjs
```

The definition of an `alpha/Test` import incorrectly returned the consumer's
import binding instead of the unopened `src/tablet/Test.ets` declaration. The
model now exposes existing target `source.sourceRoots` only when they are
relative physical siblings of `src/main`, followed by the retained `src/main`
fallback. It does not add an implicit `ets` segment or alter relative imports.
Actual self-package resolution and its integration GREEN are root-owned.

The root agent also verified the installed official hvigor 6.24.2
`src/tasks/service/target-task-service.js` `getResourceDirs()` behavior: a
nonempty target resource list replaces the default, while an empty list uses
`src/main/resources`. The supplementary public model test was added first:

```sh
node --test --test-name-pattern='empty target resource' tests/harmony-project-model.test.mjs
```

RED: `status` was `unavailable` instead of `ready` (one selected failure).
The minimal fix retains the default resource root for `directories: []`.

## Explicit server selection

The model now accepts `new HarmonyProjectModel(rootPath, selection?: unknown)`.
`selection` is this server's setting, not an invented hvigor build-profile field:

```json
{ "product": "default", "targets": { "alpha": "tablet" } }
```

The root-owned LSP adapters expose it at initialization under
`initializationOptions.project` and through normal configuration changes under
`settings.arkts.project`. The server explicitly defaults to product `default`;
this is a documented server policy, not an inference about an IDE's active
product. A chosen product must be uniquely declared. An override must name a
declared module target associated with that product. Without an override the
association must identify exactly one target. Unknown keys, malformed types,
non-plain mappings, and more than 256 target overrides fail closed. Input values
are captured rather than retained by mutable caller reference.

The real child-process regression was observed before model changes:

```sh
node --test --test-name-pattern='explicit project selection' tests/semantic/project-module-resources.test.mjs
```

RED: the explicit tablet selection returned no definition instead of the tablet
resource URI. Root owns adapter integration and its focused GREEN. Direct model
selection contracts verify explicit disambiguation, selected-product membership,
unknown module/product/target rejection, and malformed settings.

The official omitted-`applyToProducts` rule was a separate supplementary model
RED: `node --test tests/harmony-project-model.test.mjs` produced 14 passed and
1 failed, because a non-`ohosTest` target without the field returned unavailable.
The minimal change treats an omitted field as a `default` association except
for `ohosTest`; an explicitly empty mapping is not replaced with a default.

## Unavailable target retains known module ownership

The source-membership owner observed a real stdio regression in
`tests/semantic/project-target-membership.test.mjs`: ambiguous tablet/desktop
selection still leaked target globals into completion. The model's unavailable
scope discarded an already validated physical module owner, preventing its
consumer from distinguishing that module's source tree from legacy standalone
files.

The supplementary model regression first failed with:

```sh
node --test --test-name-pattern='rejects multiple module targets' tests/harmony-project-model.test.mjs
```

RED: `scope.moduleRoot` was undefined. The minimal fix preserves `moduleRoot`
only after physical module ownership has been established, while keeping
status unavailable, both root arrays empty, and the reason unchanged.
Global invalid configuration and unknown source ownership do not invent a
module root. DocumentStore membership gating and its LSP GREEN are owned by the
source-membership slice.

## Explicit remaining boundaries

- Only same-workspace modules are admitted in this slice. Official build-profile
  permits external module references; supporting them safely remains separate.
- The default server product is `default`; other declared products and explicit
  module target overrides require the documented server setting. Ambiguous
  mappings never silently choose the first target.
- Multiple source-root conflict precedence and resource-directory collision
  precedence are not claimed by this model; its consumer must not guess them.
- The model itself does not enumerate or mutate TypeScript membership; the
  separate source-membership consumer applies the selected roots.
- SDK selection and SDK configuration are outside this module model.
