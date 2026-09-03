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

## Install for Zed

Prerequisites: Node.js 20+, pnpm, Rust/rustup, Zed, and the Rust
`wasm32-wasip2` target.

```sh
rustup target add wasm32-wasip2
./scripts/install-local.sh "$HOME/.local/bin"
```

Make sure `~/.local/bin` is on the environment Zed receives, then in Zed run
`zed: install dev extension` and select this repository's `editors/zed`
directory. Trust the project when Zed asks; Restricted Mode intentionally does
not start language servers.

Run the Zed install action again after grammar or query changes. The installer
tracks the pinned grammar identity and invalidates an unproven or outdated
generated grammar instead of letting Zed reuse incompatible state.

The command installation is transactional and self-contained. It points to an
immutable, content-addressed release under the install prefix's `libexec`, so
moving the source checkout does not break the active server and a failed update
does not replace the last working command.

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

Fast deterministic gate:

```sh
pnpm install --frozen-lockfile
pnpm check:fast
cargo test --locked --workspace --all-targets
./scripts/check-zed-queries.sh
```

The release gate additionally needs the pinned
`netease-kit/nim-uikit-harmony` checkout at commit
`585feb45114a128a0d2a23947c83faf338e758f7`:

```sh
ARKTS_INDEX_REAL_FIXTURE=/path/to/nim-uikit-harmony \
ARKTS_LARGE_FIXTURE=/path/to/nim-uikit-harmony \
pnpm check:release
```

CI checks out that revision explicitly. Its acceptance requires a `ready`
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
- References, rename, and code actions are not advertised yet.
- There is no automatic binary updater; rerun the installer for a new local
  build.
- The copied semantic core's upstream source is currently marked
  `UNLICENSED`. This repository therefore remains private and must not be
  redistributed until the rights holder makes an explicit licensing decision.

See [PROVENANCE.md](PROVENANCE.md) for exact copied-code provenance and
third-party notices.
