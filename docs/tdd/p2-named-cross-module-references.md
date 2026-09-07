# P2.1a: named cross-module references respect the Stage project model

Parent revision: `5bf7b78c4177cd9a946687a8312f71eac5c21653`.

Public boundary: a real `dist/server.cjs --stdio` child process using
`Content-Length` framed `textDocument/references`.

## RED

The conformance workspace declares only `entry` and `shared` in its root
`build-profile.json5`. `entry` resolves `shared` through its declared
`file:../shared` dependency and imports `SharedProfile` by package name through
the unopened shared barrel. A separate `ghost` package is intentionally absent
from the root module list, although it declares the same dependency and uses the
same symbol.

Only the entry consumer was opened. The complete references result was expected
to contain its import and use, the shared barrel, and the shared declaration.
The real server incorrectly returned two additional locations from `ghost`.

```text
pnpm build
node --test tests/semantic/references-depth.test.mjs

tests 3
pass 2
fail 1

actual:   6 locations
expected: 4 locations
extra:    ghost/src/main/ets/GhostUse.ets import and use
```

## Root cause

`SemanticDocumentStore.isActiveProjectSource` used the absence of
`moduleRoot` as a reason to admit a path. In a configured project,
`HarmonyProjectModel` deliberately returns an unavailable scope without a
module root for `source-outside-declared-modules`. The membership scan therefore
added the ghost source to the TypeScript Program, whose exact `findReferences`
correctly—but undesirably—reported that source.

The same predicate is also used while traversing directories. Ancestor
directories of a declared module do not themselves have a module root, but an
unrelated directory must be rejected before it is opened. A plain
`directoryTraversal` exception admitted both.

Two follow-up REDs exposed the other ordering and ownership edges:

```text
# An undeclared ghost subtree containing a 4 MiB + 1 source
actual:   -32803 References require a complete workspace snapshot

# An undeclared 4 MiB + 1 .ets file directly in the workspace root
actual:   -32803 References require a complete workspace snapshot
```

The first happened because enumeration still entered the unrelated directory.
The second happened because source files were yielded and statted before the
membership predicate ran. A final focused RED declared a nested module below an
inactive parent target; broad target pruning made that declared child
unreachable.

Independent review then added the missing containment topology: an undeclared
`entry/ghost` package below a declared module root but outside its `src` tree.
The real stdio request again returned six rather than four locations because
the broad module-root-entry exception admitted both nested ghost references.

`HarmonyProjectModel.mayContainDeclaredModule` now owns the directory question:
configured projects traverse only physical ancestors of declared module roots,
invalid projects fail closed, and unconfigured workspaces retain their original
behavior. The enumerator applies source admission before yielding files, so an
excluded file cannot consume the per-file snapshot budget. Target/source-root
membership remains authoritative, with a directory-only ancestor fallback for
declared nested modules. Outside `src`, only a source file directly beneath the
module root is a module-root entry; deeper directories must lead to another
declared module. No references, TypeScript, resolver, or index logic changed.

## GREEN

```text
pnpm build
node --test tests/semantic/references-depth.test.mjs \
  tests/semantic/project-target-membership.test.mjs \
  tests/harmony-project-model.test.mjs

tests 29
pass 29
fail 0
```

The exact four UTF-16 ranges are now returned in stable order. Selected target
sources remain available, inactive target directories remain pruned, and module
root/package dependency closure behavior remains intact. The same public request
stays complete when sibling, root-level, and declared-module-nested undeclared
locations contain oversized files; an integration spy also verifies that an
undeclared subtree is never opened. A declared nested module remains reachable
through an otherwise inactive parent target directory while its parent's
inactive source file remains excluded.

Related corpus, project-file-set cache, and package-resolution verification:

```text
node --test tests/project-file-set-cache.test.mjs \
  tests/conformance-corpus.test.mjs \
  tests/semantic/local-package-resolution.test.mjs

tests 76
pass 76
fail 0
```

Unified fast gate on the frozen candidate:

```text
pnpm check:fast

tests 771
pass 771
fail 0
cancelled 0
skipped 0
todo 0
duration 477.74 s
```

This closes only the first P2.1 tracer bullet. Named cross-module overlay,
watcher freshness, inactive-target references, rename edit application, and
installed-artifact parity remain separate vertical slices.
