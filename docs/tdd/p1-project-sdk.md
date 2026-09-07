# P1.4a — Workspace SDK selection and identity

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`.
Branch: `codex/project-model-phase1`. This is an incremental slice over the
existing uncommitted project/package work, not an untouched-parent replay.

## Supported contract

The workspace root's `local.properties` `sdk.dir` selects an explicit SDK ahead
of `ARKLINE_HARMONY_SDK_PATH` and existing platform defaults. A relative value is
relative to that workspace, not the server cwd or a module `srcPath`. Missing
configuration/key permits fallback; malformed, oversized or unusable explicit
configuration fails closed. No product/API-version-to-directory inference occurs.

SDK selection is a snapshot taken when a workspace TypeScript engine is created.
Ambient and imported SDK declarations use the same snapshot. Configuration
root-dirty invalidation reconstructs the affected engine through the existing
lifecycle. Eviction and other legitimate engine reconstructions also select again;
there is no additional unbounded global SDK cache.

`ets/oh-uni-package.json` identifies the ETS API level separately from the
component version. Identity is `identified`, `missing` or `invalid` and is
observable through `sdk.selected` in the existing production logger. `ready`
means the supported SDK directory layout exists; it does **not** establish
language compatibility. All identities explicitly report
`dialectCompatibility: unverified` and
`declarationSupport: typescript-compatible-only`.

The configuration/metadata reader accepts regular files only, caps reads and
allocations at 64 KiB plus one overflow byte, closes descriptors and handles a
file growing after stat. Java properties syntax is delegated to fixed
`properties-file@5.0.7`, a zero-runtime-dependency TypeScript parser. Its full MIT
notice is retained in the generated bundle.

## Evidence for reuse and boundaries

- Official [OpenHarmony build script](https://github.com/openharmony/applications_hap/blob/fd2c78258466076118c8a9bf1a97fdbcec06a5c8/build.sh#L329)
  writes `sdk.dir` to project `local.properties`.
- Official [ETS component metadata example](https://github.com/openharmony/docs/blob/f6b8dc8054ac11fb3488a1facf4cdda9fe3207f5/zh-cn/application-dev/faqs/full-sdk-switch-guide.md#L61)
  distinguishes `apiVersion` from component `version`.
- Read-only verification of the installed DevEco SDK on 2026-09-07 found
  `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/ets/oh-uni-package.json`
  with `path: ets`, `apiVersion: 24`, `version: 6.1.1.125`. The installed Hvigor
  plugin's SDK loaders consume component metadata and invalidate changed SDK
  location caches. No installed compiler/build tool was executed.
- [properties-file official API](https://github.com/properties-file/properties-file#usage)
  provides `getProperties` for in-memory Java properties. Context7 was attempted
  for three candidate parser names but returned no relevant package; official
  documentation and installed package exports/license were the fallback.

This is not an implementation of all modern DevEco SDK selection precedence.
No `compatibleSdkVersion`/`compileSdkVersion` mapping, SDK downloading, legacy
component-version directory traversal, ArkTS 1.2/static compiler compatibility,
system API visibility, cross-SDK overlays or real-device conformance is claimed.
`sdk-pkg.json` is not guessed into a replacement for verified component metadata.

## Vertical RED → GREEN

1. `pnpm build && node --test --test-name-pattern='project sdk.dir overrides' tests/semantic/project-sdk-selection.test.mjs`
   was RED: real stdio definition selected `sdk-fallback/ets/api/@ohos.projectApi.d.ts`
   instead of the exact `sdk-a` URI/range. Constructor-scoped workspace selection
   made this transcript GREEN.
2. `node --test --test-name-pattern='SDK identity distinguishes' tests/sdk-discovery.test.mjs`
   was RED: public discovery returned no identity. Bounded ETS metadata parsing
   produced distinct API/component fields and the unverified dialect boundary
   (GREEN).
3. `node --test --test-name-pattern='rejects files masquerading' tests/sdk-discovery.test.mjs`
   was RED: a regular file named `ets` was accepted as a ready SDK. Directory-type
   checks and safe stat failure handling made it GREEN.
4. `pnpm build && node --test --test-name-pattern='changing project sdk.dir' tests/semantic/project-sdk-selection.test.mjs`
   was RED: SDK A → B plus a watched-file notification produced no refreshed
   diagnostics within 5 seconds. Main-thread integration classified
   `local.properties` as root-dirty configuration. The unchanged open consumer
   then received SDK B's TS2353 diagnostic, and module/ambient exact definitions
   both matched a fresh process (GREEN).
5. `node --test --test-name-pattern='SDK selection logs' tests/semantic/project-sdk-selection.test.mjs`
   was RED: no `sdk.selected` production log entry existed. A constructor callback
   passed through the existing registry/semantic layer to the single shared
   production logger made the real process log API 24, component 6.1.1.125 and
   explicit unverified dialect support (GREEN). Core creates no logger.
6. `node --test tests/sdk-discovery.test.mjs` was RED solely for the new bundle
   license check (7 passed, 1 failed). Preserving the upstream full MIT notice
   restored GREEN.
7. Independent review found an existing dangling `local.properties` symlink was
   treated as absent. `node --test --test-name-pattern='dangling project configuration' tests/sdk-discovery.test.mjs`
   was RED: discovery selected the environment SDK. An `lstat` only after
   `open` reports ENOENT now distinguishes true absence from broken explicit
   configuration (GREEN). Successful construction and hot queries incur no
   additional probe.
8. `node --test --test-name-pattern='symlink to shared SDK' tests/semantic/project-sdk-selection.test.mjs`
   was RED: a workspace-local link to an outside shared properties file selected
   SDK A correctly, but its lexical watched URI was discarded after canonical
   resolution escaped the workspace. The unchanged consumer received no SDK B
   diagnostics within 5 seconds. Main-agent integration routes configuration
   events by the workspace path watched by the client. SDK B's diagnostic and
   both exact definitions then passed (GREEN); source/resource physical-boundary
   rules remain separate.

Additional characterization checks passed directly; no RED is claimed for them:
Java escaped separators/backslashes/Unicode, duplicate keys, continuations,
relative root paths, module-local config isolation, invalid/oversized inputs,
missing/invalid metadata, a single process with two different workspace SDKs,
ambient/module agreement, invalid explicit SDK diagnostics, deletion restoring
fallback, and exact warm/fresh results.

The warm I/O contract resolves 100 **new importer paths** in one warm engine,
forcing module resolution rather than only repeating a TypeScript-cached query.
It observes zero project configuration opens or SDK layout/metadata probes.
Declaration content/stat I/O is not claimed to be zero; this is not a p95/RSS
measurement or a large-project acceptance result.

## Focused verification

- `pnpm check && pnpm build && node --test tests/sdk-discovery.test.mjs tests/semantic/project-sdk-selection.test.mjs tests/semantic/arkui-sdk-symbols.test.mjs tests/logging.test.mjs && git diff --check`:
  23/23 passed (10 SDK boundary, 8 real SDK-selection stdio, 2 existing ArkUI SDK,
  3 existing logging), no failed/cancelled/skipped/todo; test phase 7.15 seconds.
- Strengthened `warm SDK queries` contract: 100 distinct importer paths, 0 SDK
  configuration/layout/metadata probes, GREEN.
- `pnpm check`: passed after all SDK and logger changes.
- `git diff --check`: passed.

Final integrated `pnpm check:fast` and project checklist synchronization belong
to the main agent; they are not claimed by these focused results. No commit,
push, PR or merge was performed by this SDK slice.

Documentation-only evidence update: owner=phase1 maintainers;
scope=this record; expiry=2026-09-14.
