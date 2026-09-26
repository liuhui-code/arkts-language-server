# Settings `HomeInitData` declaration-inclusive strategy matrix

Parent revision: `45a5348e1a8f44be8c6face68fb826a08eae8db7`.

This is a benchmark-fixture refresh and a public-LSP characterization, **not** a change to references semantics. The repository's `AGENTS.md` had a separate user-owned edit; it was not part of the tested build. The real Settings checkout, selected SDK, symbol and oracle are pinned in [`settings-homeinitdata-api24-with-declaration.json`](../../bench/references/manifests/settings-homeinitdata-api24-with-declaration.json). The benchmark calls a child server over Content-Length-framed stdio and sends `textDocument/references` with `context.includeDeclaration=true` (the replay CLI's default). The declaration plus nine usages must match the ten-location oracle exactly by URI/range after the harness maps oracle-relative paths into the fixed checkout. Automatic diagnostics remain enabled.

## RED: stale artifact pin blocks the stable replay interface

Before this slice, the manifest pinned semantic Worker SHA-256 `d41171d961eb4e6436f81f9ae97928860b5d7e932d30e9bd60832db54e0d6558`, while the actual built `dist/semantic-worker.cjs` was `842291ecfe0a7fd7cb147af0abd6dfa16f2b0bc8e9001b0dd466ce63838a09de`. The manifest preflight returned `BENCHMARK_BLOCKED=SEMANTIC_WORKER_MISMATCH`, before an LSP request. This is an artifact-reproducibility RED, **not a semantic false negative**. An earlier attempt with `--include-declaration` was a CLI usage error; the tool only supports `--exclude-declaration`, so omitting that flag is the correct declaration-inclusive call.

The valid RED command at the parent revision was:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 16 --character 13 \
  --oracle bench/references/oracles/settings-homeinitdata-api24-with-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-with-declaration.json \
  --out /private/tmp/settings-homeinitdata-with-declaration-preflight-red.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

It exited 2 with `BENCHMARK_BLOCKED=SEMANTIC_WORKER_MISMATCH` on stderr; preflight created no JSON replay report.

## Minimal GREEN change and acceptance

The only fixture change is updating that semantic Worker digest to the actual built artifact. Run three *independent fresh processes per strategy* (`legacy`, `batched`, `indexed-batched`) against the same manifest, clean checkout and SDK. Mode A opens the file and sends references as the first semantic request. Each run gets its own private index cache and is accepted only if it reports `PASS`, returns all ten exact locations with no missing/extra ranges, and records the normal target diagnostic notification. The sidecar and Node PID are measured externally; Worker-thread RSS must not be added a second time.

The same command after the pin refresh, with output `/private/tmp/settings-homeinitdata-with-declaration-indexed-green-1.json`, returned `PASS` and 10/10 exact locations. The complete three-per-strategy characterization also passed 9/9 independent processes; all normalized result arrays matched byte-for-byte and all version-1 target diagnostic lists were empty. See the results report for each raw run and the limitations of the small sample.

One reproducible invocation from the repository root is:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 16 --character 13 \
  --oracle bench/references/oracles/settings-homeinitdata-api24-with-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-with-declaration.json \
  --out /private/tmp/settings-homeinitdata-with-declaration-recheck.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

Use a distinct `--out` file and a fresh process for each repetition. Do not add `--exclude-declaration` to this command. The corresponding [results report](../reports/2026-09-21-settings-with-declaration-matrix.md) records the actual nine-run status, timings, memory peaks, result equality and limitations. This characterization does not by itself meet the original >3 GB reproduction, PSS/DevEco comparison or ≤500 ms cold-navigation gates.

## Repository gate

`pnpm check:fast` initially passed 948/950 under the filesystem/process
sandbox. Its two failures were both external RSS sampler `spawn EPERM`, before
the intended assertions: the declaration-façade A/B RSS runner and the
replay-without-diagnostics test. A focused rerun of those two public tests with
macOS process sampling permitted passed 2/2. The full `pnpm check:fast` rerun
under the same permission passed **950/950** (762,165.83 ms). No assertion,
diagnostic policy, or timeout was weakened to obtain that result.
