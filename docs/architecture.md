# Architecture and ownership

The public process contract is `arkts-language-server --stdio`. Zed knows only
that contract; it does not depend on server internals.

## Invariants

- Contract positions are zero-based UTF-16. The extracted ArkLine core's
  one-based positions are confined to `LegacySemanticEngine`.
- An open `DocumentSnapshot` is authoritative over disk and persisted index
  content.
- Current-document semantic queries never wait for workspace indexing.
- stdout contains protocol frames only. Operational logs use stderr.
- An LSP capability is advertised only after its child-process transcript is
  GREEN.
- Workspace index state is one of `warming`, `ready`, or `degraded`; status is
  never rendered as a search result.

## Module boundaries

```text
src/lsp              LSP lifecycle, capability mapping, request freshness
src/contracts        editor-neutral snapshots and ports
src/project          workspace/project resolution
src/semantic         adapters around the extracted semantic core
src/core             extracted ArkLine implementation; no LSP imports
src/index            sidecar adapter, protocol validation, URI rebasing
src/composition      production dependency assembly and platform paths
crates/index-core    headless ArkTS symbol parser and in-memory ranking
crates/index-sqlite  private persistent schema, WAL and atomic generations
crates/index-sidecar protocol-v1 NDJSON process and streamed cataloging
editors/zed           thin local Zed adapter; stable CLI only
```

`src/server.ts` delegates production assembly to `src/composition`; tests may
inject the same editor-neutral ports. Semantic and index modules must not import
`vscode-languageserver`. Only the Rust persistence crate knows the SQLite
schema. The Zed extension must not import or encode server implementation
details beyond the stable executable name and `--stdio`.

## Runtime sequencing

1. LSP `initialize` configures all workspace roots and advertises only tested
   capabilities.
2. `initialized` opens one sidecar session per root and starts cataloging in the
   background. Existing committed generations remain searchable.
3. Open buffers shadow persisted rows; close returns authority to the index.
4. Catalog generations activate atomically. A timeout, malformed protocol, or
   child exit degrades only that session and preserves the last committed
   generation.
5. Shutdown rejects new work, cancels cataloging, disposes semantic state, and
   bounds child termination.

## Parallel ownership

| Track | Owned paths |
| --- | --- |
| LSP runtime | `src/lsp/**`, final `src/server.ts` assembly |
| ArkTS semantic | `src/semantic/**`, `src/core/types/**`, `src/core/virtual/**`, `src/core/sdk/**` |
| Persistent index | `crates/index-*/**`, `src/index/**` |
| Zed and delivery | `editors/zed/**`, `scripts/**`, CI and delivery docs |

Changes to `src/contracts/**`, root manifests, lockfiles, or shared fixtures are
owned by the integration branch and land before dependent track changes.
