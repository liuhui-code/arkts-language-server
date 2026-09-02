# ArkTS Language Server Spike

Local-only feasibility spike for running ArkLine's extracted ArkTS semantic
core as a standalone Language Server Protocol process consumed by Zed.

## Result

The spike proves that a new project can:

- speak standard Content-Length framed LSP over stdio;
- synchronize an unsaved `.ets` document;
- complete both fields and methods after `this.`;
- resolve an exact definition in another `.ets` file;
- shut down cleanly; and
- be launched by a local Zed language extension.

The stable public interface is:

```text
node dist/server.cjs --stdio
```

## Architecture

```text
Zed local extension
  -> standard LSP / stdio
  -> src/server.ts
  -> extracted SemanticDocumentStore
  -> extracted TypeScriptLanguageServiceEngine
  -> ArkTS virtual document + relative dependency loading
```

Only the ten-file semantic dependency closure was copied from ArkLine. The
ArkLine custom NDJSON worker session, Tauri host, desktop status model, and
Rust workspace index are not part of this spike.

## Verify

Requires Node 20 or newer and pnpm.

```bash
pnpm install
pnpm test
```

The complete test command runs strict TypeScript checking, builds the real
server bundle, then starts child processes and exchanges real LSP frames.

Build the local Zed extension:

```bash
cd editors/zed
cargo build --target wasm32-wasip2 --release
cp target/wasm32-wasip2/release/zed_arkts_local.wasm extension.wasm
```

In Zed, run `zed: install dev extension` and select:

```text
/Users/liuhui/Documents/code/arkts-language-server/editors/zed
```

Then open `fixtures/basic/Profile.ets` and request completion after `this.`;
open `fixtures/basic/Main.ets` and go to definition on `displayName`.

## Deliberate limitations

- Local macOS spike only; no SSH or binary download/update flow.
- The Zed adapter intentionally contains absolute local Node/server paths.
- Full document sync only; incremental sync and cancellation are not claimed.
- Completion and definition only; diagnostics, hover, references and rename are
  not advertised.
- The Rust persistent workspace index has not been extracted. The next spike
  must prove `workspace/symbol` behind a narrow index port without importing
  Tauri or querying ArkLine's SQLite schema directly from the LSP process.
- This private spike is not ready for publication or redistribution.

See [docs/spike-evidence.md](docs/spike-evidence.md) for the TDD record and
[PROVENANCE.md](PROVENANCE.md) for copied-code provenance.
