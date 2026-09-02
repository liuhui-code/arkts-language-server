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
src/index            WorkspaceIndexPort adapters; no SQLite schema access
crates/index-*       future headless Rust parser/store/sidecar
editors/zed           thin local Zed adapter; stable CLI only
```

The LSP runtime is the composition root. Semantic and index modules must not
import `vscode-languageserver`. The Zed extension must not import or encode
server implementation details.

## Parallel ownership

| Track | Owned paths |
| --- | --- |
| LSP runtime | `src/lsp/**`, final `src/server.ts` assembly |
| ArkTS semantic | `src/semantic/**`, `src/core/types/**`, `src/core/virtual/**`, `src/core/sdk/**` |
| Persistent index | `crates/index-*/**`, `src/index/**` |
| Zed and delivery | `editors/zed/**`, `scripts/**`, CI and delivery docs |

Changes to `src/contracts/**`, root manifests, lockfiles, or shared fixtures are
owned by the integration branch and land before dependent track changes.
