# Product Gate benchmark protocol

This protocol is the only release comparison for the large-workspace memory target. The committed
[workflow configuration](../../config/product-benchmark-workflow.json) owns topology, run counts,
actions, and process accounting. The committed
[release gates](../../config/memory-release-gates.json) own thresholds.

## 1. Generate deterministic fixtures

Use a fresh `.bench` directory. The generator refuses to overwrite an existing output.

```bash
node scripts/bench/generate-large-fixture.mjs --out .bench/unrelated/ws-1000 --workspace-files 1000 --active-dependency-files 200 --seed 20260909
node scripts/bench/generate-large-fixture.mjs --out .bench/unrelated/ws-10000 --workspace-files 10000 --active-dependency-files 200 --seed 20260909
node scripts/bench/generate-large-fixture.mjs --out .bench/unrelated/ws-50000 --workspace-files 50000 --active-dependency-files 200 --seed 20260909
node scripts/bench/generate-large-fixture.mjs --out .bench/unrelated/ws-100000 --workspace-files 100000 --active-dependency-files 200 --seed 20260909

node scripts/bench/generate-large-fixture.mjs --out .bench/dependency/ws-100000-active-1000 --workspace-files 100000 --active-dependency-files 1000 --seed 20260909
node scripts/bench/generate-large-fixture.mjs --out .bench/dependency/ws-100000-active-5000 --workspace-files 100000 --active-dependency-files 5000 --seed 20260909
node scripts/bench/generate-large-fixture.mjs --out .bench/dependency/ws-100000-active-10000 --workspace-files 100000 --active-dependency-files 10000 --seed 20260909
```

The unrelated `ws-100000` fixture is also dependency-growth point 200. Do not generate a duplicate.
Each manifest must report its requested counts; compare products only when the SHA-256 of the selected
manifest and the SDK declaration digest are identical.

## 2. Lock the environment

Before measuring, record these values in both report `comparisonIdentity` values and in
`docs/reports/benchmark-environment.json`:

- candidate Git commit and sealed artifact hash;
- Zed exact version/build;
- DevEco exact version/build and JDK build;
- SDK API level and declaration digest from `docs/toolchains/arkts-toolchain.lock.json`;
- generated fixture manifest SHA-256;
- Linux distribution/kernel, CPU model/count, physical memory, cgroup limits;
- fresh or warm cache directory identity and editor user-configuration directory identity;
- explicit PID-to-role mapping used for each product.

The release evaluator rejects different `comparisonIdentity` values. A macOS RSS run is useful for
development feedback but cannot set `measurementStatus` to `complete`, because this gate requires Linux
PSS from `smaps_rollup`.

## 3. Execute the same workflow

For each product and topology run cold 3 times, warm 10 times, and stress 5 times:

1. open the generated entry file and wait for initialization;
2. insert `this.` inside a temporary method, request completion, select a stable member;
3. request definition and complete references for that member;
4. edit a normal comment and request completion again;
5. for stress, visit 20 generated active modules, return to the first, apply Level 3 memory pressure on
   the ArkTS candidate, then request completion again.

Cold runs use a new workspace index and editor configuration directory. Warm runs preserve the SQLite
index. Never include emulator, device manager, or build processes. Do not truncate references or rename
to meet memory targets.

## 4. Sample memory

On Linux, sample every included PID separately:

```bash
scripts/bench/process-memory.sh PID
```

It emits one JSON object containing `rssBytes` and `pssBytes`. Sum PSS across the declared process roles;
do not add worker-thread metrics to Node RSS again. Product PSS includes Zed, the ArkTS server, and its
Rust sidecar. DevEco PSS includes DevEco and the corresponding language-analysis processes.

## 5. Assert the release gates

Both evidence files must use schema version 1, `measurementStatus: "complete"`, exact
`workflowRuns: { cold: 3, warm: 10, stress: 5 }`, and matching `comparisonIdentity`. The server report
contains correctness, six memory summary values, and warm/baseline P95 latency. The DevEco report
contains steady and peak PSS.

```bash
node scripts/bench/assert-release-gates.mjs \
  --server docs/reports/memory-zed-arkts.json \
  --deveco docs/reports/memory-deveco.json \
  --gates config/memory-release-gates.json
```

Release output must be exactly:

```text
MEMORY_RELEASE_GATE=PASS
SEMANTIC_CORRECTNESS_GATE=PASS
```

Missing evidence, incomplete workflow counts, mismatched identities, zero denominators, malformed JSON,
or any threshold failure exits non-zero. Thresholds are product targets and must not be relaxed to make
a run pass.
