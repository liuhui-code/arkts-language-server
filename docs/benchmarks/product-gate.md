# Product Gate benchmark protocol

This protocol is the only release comparison for the large-workspace memory target. The committed
[workflow configuration](../../config/product-benchmark-workflow.json) owns topology, run counts,
actions, and process accounting. The committed
[release gates](../../config/memory-release-gates.json) own thresholds.

`ARKTS_SEMANTIC_QUEUE_TRACE=1`, like `ARKTS_REFERENCES_TRACE=1`, is attribution
only. Its response time includes observation overhead and cannot qualify normal
product latency or memory. Collection labels and release consumers both enforce
the effective flags, even if a supplied report claims trace-off. Internal
queryScopeSemanticState is not the public root-readiness contract. The
[OP03a controls](../tdd/op03a-completion-diagnostic-priority.md) qualify those
boundaries, not the full release gate or native PSS comparison.

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
development feedback but cannot be submitted as a complete Linux release measurement, because this gate
requires PSS from `smaps_rollup`.

For the macOS development gate, build the production bundle and release sidecar, then run the same
semantic workflow directly over framed stdio:

```bash
node scripts/bench/run-macos-e2e.mjs \
  --workspace .bench/unrelated/ws-100000 \
  --sdk /absolute/path/to/openharmony \
  --sidecar target/release/arkts-index-sidecar \
  --out docs/reports/macos-zed-arkts-100k.json
```

This report deliberately uses `measurementKind: macos-rss-development-gate` and
`releasePssComparable: false`. It may be complete as a macOS execution record but is rejected as Linux
release evidence.

An optional `--oracle FILE` qualifies exact definition and include-declaration reference locations
against independently supplied fixture facts. The JSON has `schemaVersion: 1`, `verified: true`,
`inputIdentity: { sdkDeclarationDigest, workspaceFilesSha256 }`,
`query: { file, symbol: "stableMember", position, includeDeclaration: true }`, and
`definition` / `references`, each with a complete `locations: [{ file, range }]` set. Paths are
workspace-relative POSIX and ranges are zero-based UTF-16. The workspace digest includes every actual
fixture file, sorted by relative path, hashing `path`, NUL, file bytes, NUL; keep the oracle outside
the fixture tree. SDK identity comes from the actual selected SDK, not a copied global lock value.
The tool checks inputs and the original oracle file digest again after the workflow. Reports retain
request params, native responses and full actual/expected locations; an absent oracle is explicitly
`NOT_PROVIDED`. This sub-scope does not qualify full completion payloads, current diagnostics or
physical-memory release, and it remains inadmissible as complete release evidence.

For covered admitted-run failures, the tool writes an `incomplete` report and exits non-zero, retaining
received native responses/errors, target PID, actual shutdown/exit, attempted/completed counts and the
exact unexecuted session list. Postflight drift retains executed sessions but still rejects the report;
preflight rejection does not fabricate execution. A real nonzero server exit is not a successful run.
`level3Observed` records an accepted `applied: level3` response, not native eviction or disposal.
Per-run `memory.samples` retains parsed external process-tree observations, native start identities,
RSS/CPU readings and both wall/monotonic clocks; `semantic.samples` retains all parsed native metrics.
`semantic.rawJsonLines` now retains the original UTF-8 metrics text (null if missing), with a separate
`metricsError` for read/parse rejection. Recompute peak/tail from observations and never add
Worker-isolate RSS to Node RSS. Requested sampling interval is 250ms, not an assertion that every
actual gap equals 250ms. Unaccepted pressure does not contribute a postEviction summary; that legacy
field still denotes an accepted-control tail, not independently witnessed native disposal.

Successful runs retain the final current URI/version diagnostic notification in `run.diagnostics`
using a 10s observation deadline. Residual diagnostic waiting is separate from the original query
RPC latency. This retention is not a supplied, verified full diagnostic oracle. Query receipts now
retain the attempted JSON-RPC request before waiting: `RECEIVED`, native-response `ERROR` and
await-failure `FAILED` are distinct; an actual original-deadline expiration is `TIMEOUT` with the
unchanged `timeoutMs`. No-response attempts retain error and monotonic elapsed time, not a fabricated
result. `initializeReceipt` records initialization separately without increasing semantic-operation
counts. Missing run/aggregate peak observations stay null, not zero.

`run.moduleVisits` retains the original stress workflow's 20 actual didOpen/didClose
message pairs, including full source, URI/version and driver-monotonic send intervals;
cold/warm arrays are empty. `SENT` means the original transport send returned, not an
acknowledgement, successful module load or native disposal. No extra query is added.
The private real-CLI test fixture emits an unexpected-exit diagnostic containing the
original UTF-8 report text before its unchanged assertion fails and temporary cleanup;
preflight rejection has `reportText: null`, never invented execution. See the
[native workflow receipt evidence](../tdd/op06-native-workflow-receipts.md).

`memory.samplingError` retains the actual native command/code/output error and all observations
preceding sampler failure; a clean server exit cannot upgrade a failed measurement. Metric rows
require the actual target PID, safe nonnegative producer values, Node/Worker scope and clock fields;
schema rejection retains original text instead of accepting a merely parseable JSON record.
Private actual-child interruption, real original30s timeout, native ps failure, post-run missing/
malformed/schema-metric input and initialization interruption have public qualification. These do
not prove every initialization-error response or late-response boundary, resource release, or
complete product qualification. See the
[OP-05 evidence](../tdd/op05-recovery-cost-calibration.md).

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

## 6. Bind raw PSS summary arithmetic

The L08 comparison consumer accepts an explicit optional raw-record header:

```json
"statistics": { "schemaVersion": 1, "recipe": "product-pss-summary-v1" }
```

The recipe is fixed rather than a caller-selected reducer. It carries forward the existing development
workflow's warm-tail median, observed maximum and first warm-tail conventions without treating RSS as
PSS. Apply it to all declared native PSS observations of the same product and metric:

| Product | Summary metric | Reduction |
| --- | --- | --- |
| Server | `steadyPssBytes`, `pss10kBytes`, `pss100kBytes`, `postEvictionPssBytes` | Median |
| Server | `peakPssBytes` | Maximum |
| Server | `initialWarmPssBytes` | First in the original monotonic observation order |
| DevEco | `steadyPssBytes` | Median |
| DevEco | `peakPssBytes` | Maximum |

An even median averages the two central observations; unsafe intermediate arithmetic fails instead of
rounding a certification. Every one of the eight values must exactly equal its supplied summary.
Contradictory summaries or malformed/unknown recipes fail. A missing metric remains unbound and
BLOCKED; records without an explicit recipe retain their previous unverified status.

`rawObservation.summaryBinding=PASS` certifies arithmetic only. The labels do not prove warm-tail,
eviction, topology, run identity or sampling-window coverage. Original cold3/warm10/stress5 workflows,
all configured topologies, full results, native process roles, actual PSS scope, independent DevEco
comparison and all release gates still require their own evidence. No old record is retroactively
assigned this recipe or upgraded to a release measurement.

## 7. Bind declared topology/run/owner windows

An optional `workflow` object in the original PSS-record artifact contains `schemaVersion: 1`,
`workflowSha256` (the original workflow configuration bytes), the unchanged `comparisonIdentity`,
`manifests` and `runs`. Manifest references use the same same-directory JSON `{ file, sha256,
byteLength }` contract as comparison artifacts and are reread in full. Numeric counts, seed, entry
file and generated source root must match the original generator. The seven unique topology pairs
must be present; the shared 100k/active200 point is not duplicated.

Each run has a unique nonempty `id`, `product` (`server` or `deveco`), `manifestSha256`, `kind`
(`cold`, `warm` or `stress`), zero-based numeric `index`, `startedMonotonicMs`,
`completedMonotonicMs`, and a declared `processes` inventory of `{ pid, role, startIdentity }`.
Every product/topology must declare cold0–2, warm0–9 and stress0–4: 252 distinct slots.
Process roles retain the original accounting policy. A cohort may change during a run; its inventory
is the union of observed identities, not a requirement that every PID exist in every snapshot.

Every raw sample declares `runId`. Its product, PID/role/start identities and complete monotonic
read interval must agree with that run. Every declared owner must appear in an observation.
Missing topology/run/owner proof remains unverified/BLOCKED. Duplicated slots, unknown IDs,
contradictory owners, bad manifests or reads outside their declared run fail and retain query rows.

`rawObservation.workflowBinding.status=PASS` means
`DECLARED_MANIFEST_RUN_WINDOW_OWNER_BINDING_ONLY`. It does not prove actual workflow actions,
complete native process-tree coverage, correct current payloads, cache continuity, ready state,
sampling gaps/peak coverage, eviction, OOM absence or resource release. `execution` and
`samplingCoverage` remain `NOT_VERIFIED`; overall `productCoverage` remains `NOT_VERIFIED`.
Unscoped old records are not assigned run identities retrospectively and still cannot release.

## 8. Bind declared sampling-window and gap accounting

An optional raw `sampling` object contains `schemaVersion: 1`, a positive safe numeric
`requestedIntervalMs`, the original sampler `error` (`null` for a declared clean capture), and
`perRun` cadence rows. It requires the original workflow binding; rows cannot attach to a different
or missing run inventory. Each row has `runId`, `sampleCount`, `firstMonotonicMs`,
`lastCompletedMonotonicMs`, `headGapMs`, `tailGapMs`, `maximumReadDurationMs` and
`actualIntervalMs: { p50, p95, max }`.

The consumer recomputes every field from all original observations. Gaps use consecutive reading
start times and nearest-rank percentiles; read duration uses the complete reading interval.
Duplicate/foreign rows or contradictory summaries fail. Original non-null sampler errors remain in
`samplingBinding.samplingError` and fail; missing error proof is not a fabricated clean capture.

Window-span accounting requires at least two observations per run, with neither boundary left
unobserved by more than one declared requested interval. Missing rows, a single point or clipped
edges stay unverified/BLOCKED. All actual internal gaps remain visible: `gapsExceedRequest` identifies
runs whose maximum start-to-start gap exceeds the request, without restamping those gaps as the
requested cadence or changing the original release thresholds.

`samplingBinding.status=PASS` means `DECLARED_RUN_WINDOW_GAP_ACCOUNTING_ONLY`, not continuous
peak coverage or an admissible product measurement. In particular a large internal gap does not
become peak-safe because both edges bind. `continuousPeakCoverage` and product qualification remain
`NOT_VERIFIED`; complete real actions, results, process tree, lifecycle and all release gates remain
required. Old records without this declaration are not upgraded.
