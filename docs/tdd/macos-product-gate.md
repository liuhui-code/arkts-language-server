# macOS Product Gate TDD evidence

Parent revision: `eea12f024b0c767aa6eb96161fb8de3f027bd10f`.

## RED 1 — the unrelated fixture was inside the active module

```text
node --test --test-name-pattern='generates deterministic workspace' tests/product-gate.test.mjs
```

The assertion requiring `unrelated/000/Unused000000.ets` outside the declared Harmony module failed.
The previous generator wrote every unused source below `entry/src/main/ets/generated/unused`, so a 100k
"unrelated" workspace became a 100k semantic project.

## GREEN 1 — workspace discovery and semantic membership are distinct

The generator now puts unrelated sources below workspace-level `unrelated/`. Its entry source also owns
stable completion, definition, references, and edit anchors. The focused generator test passes.

## RED 2 — no controlled single Level 3 pressure point

```text
pnpm build && node --test tests/lsp-production-semantic-worker.test.mjs
```

The real stdio request `arkts/benchmark/applyMemoryPressure` returned MethodNotFound. Using a permanent
1 MiB process budget was rejected as a benchmark model because every mutation repeatedly disposed the
context and the final completion timed out.

## GREEN 2 — benchmark-only ordered pressure

When and only when `ARKTS_BENCHMARK_CONTROL=1`, the server accepts the unadvertised benchmark request,
queues one `level3` control on the production semantic worker, and then rebuilds completion from the
latest open overlay. The real stdio regression is GREEN; normal product processes do not register the
request.

## Original 100k feedback loop

The first corrected runner attempt failed with:

```text
References require a complete workspace snapshot
```

After fixing fixture ownership, the complete 10k and 100k cold/warm/stress 3/10/5 runs pass every
semantic operation, catalog 10000/10000 and 100000/100000 respectively, and keep semantic membership at
201 files. Raw results are under `docs/reports/macos-zed-arkts-*.json`.
