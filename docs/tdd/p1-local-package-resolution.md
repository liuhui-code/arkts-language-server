# P1 — local Harmony package resolution

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`.
Branch: `codex/project-model-phase1`; subsequent slices build on the preceding
uncommitted GREEN implementation, not on a different hidden baseline.

## Public contract and scope

Resolve an exact dependency name from the nearest `oh-package.json5` through a
local `file:` directory and its explicit `.ets/.ts` main. The entry and its
re-exported ArkTS implementation may be unopened; open source overlays remain
authoritative. The protocol remains standard LSP over real child-process stdio.

Reuse: existing TypeScript language service, DocumentStore closure budgets,
workspace watcher, reset epoch, diagnostic scheduler and test driver. The one new
runtime component is pinned `json5@2.2.3`, not a handwritten configuration parser.
Its complete MIT notice is retained as an esbuild legal comment.

## RED → GREEN evidence

1. `pnpm build && node --test tests/semantic/local-package-resolution.test.mjs`
   initially failed 0/1: definition selected the consumer's import identifier
   instead of the unopened library declaration. A JSON5 main with unquoted keys,
   single quotes, comments and a trailing comma preserved the same RED.
   Implemented one shared bounded package resolver for the dependency closure and
   TS host. Integration feedback also caught `.ets` extension metadata and macOS
   `/var` versus `/private/var` identity; source URIs were preserved. Exact UTF-16
   definition, imported field/method completion and diagnostics then passed.

2. The same command then failed the newly added warm-main-change case: changing
   `main` still returned the old definition. Existing rootDirty/reset mechanisms
   now invalidate configuration and dependency edges, including overlay-only
   closures. The warm result matches a fresh process with the same unsaved source.

3. `node --test --test-name-pattern='dynamically registers' tests/lsp-workspace-file-changes.test.mjs`
   failed because registration omitted `**/oh-package.json5`; adding the glob made
   the selected test GREEN. The other six entries were filtered by this focused
   command, not waived from the full fast gate.

4. The local-package suite failed for a cold package main that existed only in an
   open overlay: definition again selected the import identifier. Both consumers
   now supply their existing overlay availability to the shared resolver. The
   overlay test passed without creating a disk file or widening physical scope.

5. The local-package suite failed on a missing diagnostic notification after a
   manifest change, with no further source edit. Root-dirty workspaces now use the
   existing diagnostic scheduler to refresh open documents; this test is GREEN.

6. `node --test tests/project-resolver.test.mjs` failed a filesystem-boundary cost
   contract: 100 warmed SDK-name lookups performed 800 realpath calls. A 256-entry
   LRU directory-owner/negative cache reduced that to zero. Entry existence and
   overlay availability are intentionally not cached. The same command is 5/5;
   it also covers invalidation, 257-directory eviction and live entry changes.

7. `node --test tests/test-layer-manifest.test.mjs` initially rejected the new
   unclassified test file. Registering it in bundle-e2e and updating exact entry
   counts made the existing classification contract GREEN.

8. `node --test --test-name-pattern=main-symlink-overlay tests/semantic/local-package-resolution.test.mjs`
   failed: an opened entry followed an escaping symlink because only its parent
   was checked. Existing entries now require physical containment; only a missing
   entry may use an overlay under a contained parent. The new regression and the
   existing diskless-overlay case both passed against a rebuilt bundle.

9. The first full `pnpm check:fast` returned 658/660 with two failures. The existing
   nested-root closure contract caught edges removed before the shared invalidation
   scan. Removing overlay-only edges after that pass restored the contract without
   relaxing its I/O assertions. The other failure was ENOTEMPTY during real-process
   fixture cleanup; investigation identified an asynchronous sidecar shutdown that
   the LSP shutdown response did not await. Its three RED/GREEN regressions and
   bounded normal-shutdown fix are recorded in [p1-sidecar-shutdown.md](p1-sidecar-shutdown.md).
   The original fixture cleanup is unchanged, with no deletion retries.

## Verification

- `pnpm check`: passed.
- `pnpm build && node --test tests/semantic/local-package-resolution.test.mjs`:
  13/13 passed, zero failed/skipped/todo after the lifecycle correction. Includes
  manifest create/change/delete, malformed and oversized configuration, undeclared
  dependency, lexical/symlink/outside-root escape rejection, overlay authority and
  automatic diagnostic refresh.
- `node --test tests/project-resolver.test.mjs`: 5/5 passed.
- `node --test tests/project-file-set-cache.test.mjs tests/project-resolver.test.mjs tests/test-layer-manifest.test.mjs`:
  47/47 passed, zero failed/skipped/todo after restoring the closure contract.
- JSON5 MIT notice confirmed in rebuilt `dist/server.cjs`.
- Lifecycle service and protocol suites: 28/28 passed, including three new regressions.
- `pnpm check:fast`: final rerun passed **664/664**, with zero failures,
  cancellations, skips and todos, in 329.1 seconds. Type checking and the rebuilt
  production bundle were included. The initial failure is preserved above rather
  than omitted from the evidence. No production/test edits followed this run;
  only final documentation status was synchronized.

These are deterministic corpus and protocol checks, not an installed-artifact,
real-SDK, 10k–100k project, p95/RSS or memory-reclamation acceptance. No latency or
memory budget was relaxed. SDK version selection, target graph, oh_modules,
resource visibility and package subpaths remain open in the execution plan.

Documentation-only exception: this evidence, plan cross-references and the JSON5
license comment record the authorized implementation without changing behavior;
owner=phase1 maintainers; scope=these documents/license comment; expires=2026-09-14.
