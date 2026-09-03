# Zed Local Beta smoke record

Date: 2026-09-03 (Asia/Shanghai)

This is the manual host integration gate that complements the deterministic
child-process and CI suites. It used a temporary install prefix, a separate Zed
user-data directory, and a read-only official Zed Preview DMG. The user's
running stable Zed process and normal data directory were not stopped or
modified.

## Inputs

- server revision before the delivery-cache follow-up: `daf5f9c`
- advertised server/extension version: `0.1.0-local-beta.1`
- Zed Preview: 1.19.0 (`dev.zed.Zed-Preview`)
- workspace: `netease-kit/nim-uikit-harmony`
- workspace revision: `585feb45114a128a0d2a23947c83faf338e758f7`
- installed command: a versioned, SHA-256-addressed release under the temporary
  prefix's `libexec/arkts-language-server`

## Observed REDs

1. macOS Zed stable rejected a second stable process despite a distinct
   `--user-data-dir`; Preview was used because release channels have separate
   single-instance endpoints.
2. A stale ignored `grammars/arkts.wasm` made ArkTS language registration fail
   at `highlights.scm:13`. Rebuilding the grammar from the exact manifest
   revision with Zed's wasi-sdk 25 command removed the error.
3. Zed Restricted Mode correctly prevented the language server from spawning.
   The isolated profile alone enabled `session.trust_all_worktrees`; this did
   not change the user's settings.

## GREEN evidence

- Zed displayed `ChatBaseViewModel.ets` as ArkTS with Tree-sitter highlighting.
- Zed spawned the installed immutable `dist/server.cjs --stdio`, not the source
  checkout bundle.
- That process spawned the adjacent installed release
  `arkts-index-sidecar`.
- The LSP log recorded `workspaceCount=1`, UTF-16 position encoding, and this
  terminal event:

```json
{"event":"index.catalog.terminal","phase":"ready","discoveredFiles":455,"indexedFiles":455,"skippedEntries":3,"totalFiles":455}
```

The observed interval from `lsp.initialized` to the `ready` terminal was about
2.54 seconds. No isolated Zed, Node, or sidecar process remained after the
smoke run.
