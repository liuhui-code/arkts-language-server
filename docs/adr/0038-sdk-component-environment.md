# ADR 0038: SDK component environments and compiler-owned semantics

Date: 2026-11-01. Status: implemented on the SDK feature branch; SDK public contracts verified.
Release-gate status is tracked in [PR111 checks](https://github.com/liuhui-code/arkts-language-server/pull/111/checks).

Harmony SDK declarations span the selected OpenHarmony distribution and its HMS
extension. A single SDK directory cannot describe all inputs used by a Kit
facade. SDK metadata identifies inputs; the official compiler owns their binding,
types, aliases and declaration navigation.

## Decision

1. Keep synchronous, bounded discovery behind `SdkProvider`. Its immutable
   environment describes ordered components, API paths, physical roots and
   metadata digests. The Harmony implementation admits the documented HMS sibling
   using `ets/sdkConfig.json` and `ets/uni-package.json`. A malformed component or
   a different API level remains an explicit input issue and supplies no sources.
2. Preserve selection precedence: editor configuration, workspace
   `local.properties`, environment, then known installation defaults. Explicit
   invalid selection fails closed. The project model alone selects the product;
   SDK code consumes its immutable compile/compatible/target/runtimeOS context.
   Numeric compile versions must match selected metadata. Release aliases come
   from that distribution's witnessed `sdkApiVersionMap.json`, never a guessed
   version major. Enforce compatible <= target <= compile. Unknown aliases/OS
   stay unverified; an OpenHarmony view excludes HMS.
3. Retain actual load-owned `LoadedConfigurationWitness` facts, including negative
   lookups. Cached descriptors do not recertify freshness. Ordered module lookup,
   relative dependency boundaries, syntax retention, source classification,
   readiness digests and reference terminals consume the selected components.
   Lexical and physical checks reject escaping API paths/declaration symlinks.
   The narrower physically owned SDK/workspace boundary wins in either nesting
   direction. A lexical workspace escape cannot inherit an SDK boundary.
4. Follow actual public Kit declaration imports/re-exports through the compiler.
   Do not maintain a second symbol binder or execute SDK plugins. Compiler
   resource descriptors expose layout locations; ambient selection, compiler
   options, ASTs, Programs and dialect support stay in the compiler adapter.
5. Discover unimported SDK exports through a separate SDK-only `ts.Program`
   attached to the pinned compiler's native `getPackageJsonAutoImportProvider`.
   The existing language service owns and disposes it. It shares the existing
   DocumentRegistry through the existing owned keyed-lease ledger. Its inputs
   are SDK declarations and compiler libraries, never project sources. Its compiler options disable
   implicit repository/workspace @types discovery with `types: []`, preserving
   the shared Registry's original `typeRoots` bucket and preparsed syntax. It uses the effective service
   Host and existing synchronize-phase observation for SDK construction. It
   does not add all SDK files to the project Program's roots or introduce another LS/Worker/scheduler.
6. Use compiler-produced entries/details/actions. A second native completion pass
   excludes direct SDK API routes to recover public Kit facades; merge those Kit
   entries with direct API exports. Keep the generic 4096-entry scan and 128-item
   result bounds. SDK candidates have an independent recovery path through those
   bounds. Canonicalize only the import route after validating the compiler's
   source against the selected SDK; the compiler still supplies symbols/aliases.
7. The export Program owns a separate bounded input witness. Every request that
   consumes it retains its proof through the existing final publication fence.
   Changed inputs revoke the index and old edits until ordinary configuration
   refresh. Incomplete/optional index construction retains healthy local service
   and marks completion incomplete; cancellation remains cancellation. The first
   construction is warmed within the existing initial-preparation scope. It does
   not renew that exemption or change runtime pressure/recovery budgets. Release
   uncertainty uses the existing compiler-owner quarantine and physical Worker
   retirement path; it cannot be swallowed as optional index unavailability.
8. Qualify SDK declaration inputs from the pinned compiler's completed
   module/type-reference tables and actual Program membership, including file
   references. `skipLibCheck` must not turn absent declaration dependencies into
   complete readiness. Accept nonphysical ambient/wildcard modules through the
   compiler's binding of its SDK import literals, without a parallel binder.
   Apply this input check to both readiness and the SDK-only export Program.
9. Preserve ADR0021: stable missing SDK inputs are partial, whereas changed
   inputs reject publication. Target mismatch produces an SDK diagnostic without
   disabling healthy queries. Metadata does not certify all ArkTS dialect features.

## Evidence

Parent revision: `2972148759194fb12b9c2c05b49fa3801ccde203`.
The initial framed-stdio regression returned no definition for
`@kit.PushKit -> @hms.core.push.pushService.getToken`. Public regressions now
cover this chain, `.d.ets`, relative imports, custom namespaces, physical escape,
negative creation, same-path replacement, product qualification, >4096 ambient
entries, stale completion handles and two workspace SDKs in one process.

The capability boundary now permits exactly this SDK-only native Program;
its single official LanguageService factory and prohibition on unproven rule
providers remain enforced. Fault injection distinguishes SDK-only and project
Programs by their actual roots, preserving the original project-failure counts.

The exact pinned `ohos-typescript@4.9.5-r10` implementation in
`node_modules/typescript/lib/typescript.js` supplies the native provider contract.
Installed DevEco API24 metadata/configurations and Hvigor's
`res/schemas/ohos-project-build-profile-schema.json` establish the component and
product layouts. Public references:

- [Harmony SDK version distinctions](https://developer.huawei.com/consumer/en/doc/harmonyos-releases/deveco-studio-new-features-602).
- [SDK version aliases](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/errorcode-sdk-compile).
- [OpenHarmony Kit import implementation](https://github.com/openharmony/developtools_ace_ets2bundle/blob/master/compiler/src/process_kit_import.ts).

See the [execution plan](../plans/2026-11-01-sdk-environment.md) and
[TDD evidence](../tdd/sdk-environment-20261101.md) for validation results.

## Consequences and limits

Component parsing and layout changes are isolated from compiler semantics. The
native provider hook is private to the pinned compiler, so compiler upgrades
must retain the public auto-import transcripts. An SDK-only export Program adds
binding state per retained language service; existing context/pressure ownership
still accounts for process RSS. No new latency or memory target is certified.

The installed API24 ambient entry references 14 absent vendor declarations. They
remain explicit partial input, without invented stubs. Covered real SDK APIs do
not certify every declaration, ArkTS dialect, platform default path or editor UI.
The language-service source remains migration debt above 500 lines; cohesive SDK
setup and completion ranking/import extraction reduce it from 3072 to 2985 lines.
