# ArkTS Language Server — Local Beta

A standalone ArkTS language server for local Zed development. Zed talks only
standard LSP over stdio; the server keeps unsaved documents authoritative and
uses a separate Rust sidecar for a persistent, non-blocking workspace-symbol
index.

## What works

- incremental open/change/close document synchronization;
- completion, including fields and methods after `this.`;
- go to definition across `.ets` files;
- diagnostics, hover, signature help, and document outline;
- references, type definition, implementation, safe workspace rename, quick
  fixes, inlay hints, call hierarchy, highlights, folding, and formatting;
- fuzzy workspace-symbol search with exact names ranked first;
- multi-root workspaces and unsaved-buffer overlays;
- background, cancellable cataloging with truthful progress and persistent
  warm-cache queries;
- bounded sidecar requests, protocol validation, structured logs, and clean
  shutdown.

The public executable contract is:

```text
arkts-language-server --stdio
```

## Project status

Phase 1, the real project and SDK model, is complete. The verified baseline is
OpenHarmony API 24 with ETS 6.1.1.125 plus the tested Stage
product/module/target subset. Local Zed installation is also available through
one command.

Phase 2 is active. The P2.1b candidate covers named cross-module references,
inactive-target exclusion, one authoritative unsaved overlay, watcher/fresh-
process equivalence, and fail-closed lazy reads when a discovered file changes
identity. Relative workspace and SDK imports keep separate physical boundaries,
and call-hierarchy rejection follows the actual call target rather than unrelated
imports. The unified fast gate and frozen review pass; PR #5 CI and merge remain
pending. P2.2 cross-module rename remains the next slice. Later phases retain ArkUI/
compiler conformance, installed-artifact, responsiveness, latency, and memory
gates. See the
[execution checklist](docs/plans/2026-09-07-large-project-reuse-execution-plan.md)
and [P2.1b TDD record](docs/tdd/p2-reference-freshness.md).

## Install for Zed

Prerequisites: a Node version manager/Corepack, Rust/rustup, and Zed. The
checked-in `.node-version`, `packageManager`, and `rust-toolchain.toml` pin the
release toolchains, including the `wasm32-wasip2` target.

```sh
pnpm zed:install
```

That command builds the server, sidecar, and Rust extension; validates the
reviewed grammar artifact; publishes an immutable extension snapshot; installs
the server launcher into Zed's extension work directory; and atomically
registers or refreshes the `arkts` dev extension. A running Zed observes the
installed-directory change and reloads it. A closed Zed loads it on next start.
No Extensions-page action or inherited `~/.local/bin` PATH is required.

Use an isolated/custom profile or install prefix when needed:

```sh
pnpm zed:install -- --zed-user-data-dir "/path/to/Zed profile" --bin-dir "/path/to/bin"
```

The installer does not edit Zed's `index.json`, automate the UI, or restart
Zed. It refuses to overwrite a regular registry extension, an unrelated dev
extension, or an unmanaged launcher. Remove such a collision in Zed first.
Trust the project when Zed asks; Restricted Mode intentionally does not start
language servers. A user-configured
`lsp.arkts-language-server.binary.path` remains the highest-priority server.

The checked-in `grammars/arkts.wasm` is tied to the manifest repository and
revision by `editors/zed/zed-grammar-lock.json` and SHA-256. Grammar upgrades
must regenerate and review both files together. A missing, stale, or modified
grammar fails before activation, leaving the previous plugin and server
launcher intact.

The command installation is transactional and self-contained. It points to an
immutable, content-addressed release under the install prefix's `libexec`, so
moving the source checkout does not break the active server and a failed update
does not replace the last working command. `scripts/install-local.sh` remains
available for server-only installation.

## Project and SDK selection

The server reads the workspace's `build-profile.json5`, module profiles and
`oh-package.json5` without executing build scripts. It supports in-workspace
local/installed packages, explicit declaration entries, selected target source
sets, self-package source imports and module-scoped string resources.

Select an installed SDK using the workspace's existing `local.properties`:

```properties
sdk.dir=/absolute/path/to/openharmony
```

The selected root must contain `ets` and `toolchains`. Java properties escapes
are supported. If no project SDK is specified, the existing
`ARKLINE_HARMONY_SDK_PATH`/platform fallback remains available. Invalid explicit
configuration does not silently select another SDK. Imported APIs and ambient
declarations share one selection; `sdk.selected` logs the selected source and
API/component metadata separately.

The currently verified SDK baseline is OpenHarmony API 24 with the ETS
`6.1.1.125` component. Its named real-SDK acceptance covers ArkUI `Text`,
`@ohos`, `@kit`, `@arkts` and shipped `@system` declarations, diagnostics,
member completion/definition, transitive dotted-relative types, and workspace
auto-import completion under the full ambient declaration set. Run it explicitly
on a machine with that SDK:

```sh
ARKTS_REAL_SDK_PATH=/absolute/path/to/openharmony pnpm test:e2e:real-sdk
```

This certifies those workflows, not the complete ArkTS dialect or official
compiler. The current language backend consumes a TypeScript-compatible `.ets`
subset; version metadata by itself is never treated as compatibility evidence.

The server defaults to product `default`; it does not infer the IDE's active
Build Target. When multiple targets match, pass an explicit LSP
`initializationOptions` value, using module names from the project profile:

```json
{"project":{"product":"default","targets":{"entry":"tablet"}}}
```

Runtime changes use standard `workspace/didChangeConfiguration` with
`settings.arkts.project` in the same shape. Empty `{}` restores service defaults.
Configuration changes refresh open-document diagnostics while keeping unsaved
source authoritative. Unknown or ambiguous selection reports
`arkts.project.configuration` instead of pretending that resource results are
complete. Projects without a build profile retain legacy single-root behavior.

See the [execution checklist](docs/plans/2026-09-07-large-project-reuse-execution-plan.md)
and [tested configuration contract](docs/tdd/p1-module-target-resource-workflows.md)
for evidence and boundaries, including external module roots, resource merging
and ArkTS/compiler conformance beyond the named API 24 workflows that remains
uncertified.

## Logs and cache

Print the active platform log path without starting LSP:

```sh
arkts-language-server --print-log-path
```

On macOS the defaults are:

- log: `~/Library/Logs/arkts-language-server/server.log`
- index: `~/Library/Caches/arkts-language-server/index`

`ARKTS_LSP_LOG_DIR` and `ARKTS_INDEX_CACHE_DIR` override those directories.
Logs are NDJSON, rotate at 5 MiB, never use stdout, and include lifecycle,
request timing, and aggregate catalog terminal counters.

## Verify

Fast deterministic Node gate:

```sh
pnpm install --frozen-lockfile
pnpm check:fast
```

The canonical release gate runs the Node gate, Rust format/lint/tests, the
explicit 455-file catalog test, both release builds, every Zed query check,
and the serialized install/runtime acceptances. It needs the pinned
`netease-kit/nim-uikit-harmony` checkout at commit
`585feb45114a128a0d2a23947c83faf338e758f7`:

```sh
ARKTS_INDEX_REAL_FIXTURE=/path/to/nim-uikit-harmony \
ARKTS_LARGE_FIXTURE=/path/to/nim-uikit-harmony \
pnpm check:release
```

CI checks out that revision explicitly and invokes this same command. Its
acceptance requires a `ready`
455/455 catalog, zero rejected files, deterministic class/method locations, a
warm first query under 400 ms, and repeated-query P95 under 100 ms.

## Architecture

```text
Zed dev extension
  -> arkts-language-server --stdio
     -> LSP lifecycle + request freshness
     -> ArkTS semantic engine (open-document authority)
     -> workspace-symbol coordinator
        -> protocol-v1 Rust sidecar
           -> streamed discovery + parser + SQLite/WAL generations
```

See [docs/architecture.md](docs/architecture.md) for module contracts and
[docs/zed-local-beta-smoke.md](docs/zed-local-beta-smoke.md) for the isolated
real-Zed acceptance record.

## Local Beta boundaries

- Local workspaces only; SSH/remote delivery is intentionally out of scope.
- Named references across the selected Stage-project subset have P2.1 focused
  coverage; P2.1b's unified gate and frozen review pass, while its PR/CI and merge
  remain pending.
  Rename and code actions are advertised only when the client declares the
  required safe-edit capabilities, and the complete P2.2 cross-module rename
  workflow is not yet certified.
- There is no automatic binary updater; rerun the installer for a new local
  build.
- The copied semantic core's upstream source is currently marked
  `UNLICENSED`. This GitHub repository is publicly visible, but public access
  does not grant redistribution rights; do not redistribute source or artifacts
  until the rights holder makes an explicit licensing decision.

See [PROVENANCE.md](PROVENANCE.md) for exact copied-code provenance and
third-party notices.
