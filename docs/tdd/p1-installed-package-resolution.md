# P1.5a — Installed Harmony package resolution

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`.
Branch: `codex/project-model-phase1`. This continues the uncommitted P1.1–P1.3
implementation whose integrated fast gate passed 664/664, rather than claiming
each later slice starts from the untouched parent revision.

## Contract and evidence source

Resolve exact declared dependency names through their existing installation;
reuse the shared package resolver, JSON5 parser, source closure and TS engine.
Do not install dependencies, enumerate dependency stores, or duplicate indexes.

Rules checked against OpenHarmony third_party_typescript at fixed revision
`9cc62fe98f47c0bf113676e3fb33fe932b493052`:

- [Nearest-ancestor installation lookup](https://github.com/openharmony/third_party_typescript/blob/9cc62fe98f47c0bf113676e3fb33fe932b493052/src/compiler/moduleNameResolver.ts#L2538).
- [TypeScript-mode entry selection](https://github.com/openharmony/third_party_typescript/blob/9cc62fe98f47c0bf113676e3fb33fe932b493052/src/compiler/moduleNameResolver.ts#L2030):
  nonempty typings, then types, then main; this is field selection, not permission
  to retry runtime main when a selected declaration is missing.
- [Scoped package boundary](https://github.com/openharmony/third_party_typescript/blob/9cc62fe98f47c0bf113676e3fb33fe932b493052/src/compiler/moduleNameResolver.ts#L2132)
  and [filesystem link identity](https://github.com/openharmony/third_party_typescript/blob/9cc62fe98f47c0bf113676e3fb33fe932b493052/src/compiler/moduleNameResolver.ts#L1545).

This is a bounded subset, not a claim of compatibility with every SDK resolver
mode/version. Explicit `.ets/.ts/.d.ets/.d.ts` entries only; subpaths, inferred index
entries, version solving, native libraries and HAR extraction are not included.

## Vertical RED → GREEN record

1. `pnpm build && node --test --test-name-pattern='declared installed package' tests/semantic/local-package-resolution.test.mjs`
   was RED: definition returned the consumer import instead of the unopened
   installed implementation. A module-local `oh_modules` lookup reused the
   existing entry validation and returned the exact implementation range (GREEN).
2. `node --test --test-name-pattern='declaration entry' tests/semantic/local-package-resolution.test.mjs`
   was RED: a JS main hid the package's `.d.ets` types entry. Selecting `types`
   ahead of `main` made the real stdio definition transcript GREEN after rebuild.
3. `node --test --test-name-pattern='prefers typings' tests/semantic/local-package-resolution.test.mjs`
   was RED: returned `Other.d.ts` from types instead of `Preferred.d.ts` from
   typings. The selected entry now follows the verified field priority (GREEN).
4. `node --test --test-name-pattern='root-installed scoped' tests/semantic/local-package-resolution.test.mjs`
   was RED: module-only lookup missed the ancestor installation. Bounded nearest
   ancestor lookup, following the existing scoped-package link, made it GREEN.
5. `node --test --test-name-pattern='lockfile change' tests/semantic/local-package-resolution.test.mjs`
   was RED after an installation link was retargeted. Treating
   `oh-package-lock.json5` as package-configuration invalidation made the warm
   result agree with a fresh process using the same unsaved consumer (GREEN).
6. `node --test --test-name-pattern='dynamically registers' tests/lsp-workspace-file-changes.test.mjs`
   then proved RED because the actual client registration omitted the lockfile.
   Adding its explicit glob made the public registration contract GREEN.
7. `node --test --test-name-pattern='private transitive dependency' tests/semantic/local-package-resolution.test.mjs`
   was RED: the linked package selected the application's `PublicV2.ets` rather
   than its private `PrivateV1.ets`. Physical installation-tree lookup made it
   GREEN. A separate stdio regression then exposed duplicate private-member type
   identity (TS2322) when the same physical dependency had two installation links.
   Installed entries now use one physical store identity with the user's workspace
   root prefix preserved. Exact definition expectations intentionally select the
   store file, not arbitrary installation aliases; they were not weakened to
   nonempty assertions. The duplicate-type regression is GREEN.
8. `node --test --test-name-pattern='opened installation alias' tests/semantic/local-package-resolution.test.mjs`
   was RED: an opened alias still returned the disk store declaration on line 0
   instead of its unsaved declaration on line 2. A per-prepare physical-to-open-path
   snapshot is now shared by the closure and TS host. Opening the alias invalidates
   affected disk closures through the existing mechanism; close restores the store
   source. The same public transcript is GREEN.
9. `node --test --test-name-pattern='installation barrel retains' tests/semantic/local-package-resolution.test.mjs`
   exposed the same stale-disk result for a relative re-exported implementation.
   Installed relative candidates now use that same identity/overlay mapping;
   non-installed relative imports retain their existing path behavior. Open and
   close both pass exact URI/range assertions (GREEN).
10. `node --test --test-name-pattern='warm installed imports' tests/project-resolver.test.mjs`
    was RED: 100 unchanged imports performed 500 ancestor `lstat` probes. A positive
    installation lookup LRU, capped at 256 entries and cleared by invalidation,
    reduced those probes to zero (GREEN). Misses, final entry availability and
    overlay contents are not cached. Later characterization checks cover 257-key
    eviction, closer-package selection after invalidation, newly installed misses,
    entry deletion and changing overlay availability.

The performance assertion isolates repeated installation lookup, not all entry
validation I/O or end-to-end latency. Relative installed-source normalization still
does bounded filesystem validation; no p95/RSS improvement is claimed.

Focused name-pattern commands filter unrelated cases, not waive full-gate tests.
The resolver contracts also verify zero directory enumeration during
declared installed lookups, and zero installed-package inspection for undeclared
imports. These additional characterization checks passed directly; no RED is
claimed for them.

The independent `installed-package-workflows.test.mjs` exercises real stdio
completion/edited diagnostics, undeclared imports, missing declaration entries,
nearest-version precedence, uninstall diagnostic refresh and out-of-root links.
Its layer-classification test first failed because the new file was unclassified;
registering it in bundle-e2e restored that gate (82 entries, 29 bundle entries).

## Verification

- `pnpm check && pnpm build && node --test tests/semantic/local-package-resolution.test.mjs tests/project-resolver.test.mjs`:
  33/33 passed (22 package and 11 resolver), zero failed/skipped/todo.
- `node --test tests/semantic/installed-package-workflows.test.mjs`: 6/6 passed,
  zero failed/skipped/todo, with unchanged normal-shutdown cleanup.
- Adjacent DocumentStore/cancellation suites: 49/49 passed; workspace watcher
  suites: 20/20 passed.
- `node --test tests/test-layer-manifest.test.mjs`: 2/2 passed.
- `git diff --check`: passed.
- `pnpm check:fast`: **685/685 passed**, zero failed/cancelled/skipped/todo, in
  340.9 seconds. This includes type checking and a fresh production bundle.
  No production/test edits followed the start of that build; only final evidence
  and checklist status were synchronized. The previous gate was 664/664: this
  continuation adds 21 tests, not a waived or reclassified failing baseline.

Not verified here: immutable installed artifacts, real SDK conformance, real Zed
host use, large-project latency/RSS, project product/target selection, or the full
set of OHPM lockfile variants. Only the standard `oh-package-lock.json5` event is
registered; dependency installations outside the workspace are intentionally
rejected. P1.4, P1.5b and P1.6 remain open.

## Deferred SDK work

Project SDK override does not yet exist. `local.properties`/`sdk.dir` has an
[official OpenHarmony build-script example](https://github.com/openharmony/applications_hap/blob/fd2c78258466076118c8a9bf1a97fdbcec06a5c8/build.sh#L329),
but one example does not establish all DevEco versions' selection precedence,
product choice, or API-string-to-directory mapping. Do not infer compilation SDK
from minimum-compatible API or mark P1.4 complete on synthetic fixtures alone.

Documentation-only exception: owner=current phase1 maintainers; scope=this
evidence and plan synchronization; expires=2026-09-14.
