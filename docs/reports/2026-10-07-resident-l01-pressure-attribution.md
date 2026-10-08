# L01 Settings/API24 automatic L3 pressure: short diagnostic replay

Date: 2026-10-07. Status: **automatic high-RSS eviction reproduced; retained-object
owner NOT_PROVEN; L01 resource admission BLOCKED**. This is an attribution
experiment, not a 100-edit gate or a new production strategy.

## Controlled input

Both fresh processes used the same clean Settings checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, API24 compatibility-track
SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`
(declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`),
server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86` and built server
SHA-256 `d03fb34c69c70c4a1c26350acd9e752683ced9cdff145beec8f8434952abd54e`.
Node was `v26.3.0`, backend `ohos-typescript@4.9.5-r10`.

The real LSP target is `HomeInitData` declaration at zero-based UTF-16 `16:13`
in `common/src/main/ets/sendable/HomeInitData.ets`, `includeDeclaration=false`.
Odd unsaved edits add a tenth known use; even edits restore the nine-position
oracle. Normal automatic diagnostics and index cataloging remained on. Runtime
was the experimental full-SDK `legacy` LS, `ARKTS_SEMANTIC_SESSION_REUSE=off`,
one semantic worker, 1024 MiB soft budget. Neither replay sent an explicit L3
control, changed project boundaries, forced GC, or took a heap snapshot.

Reproduce the first run with fresh ignored output names:

```bash
node scripts/bench/generate-l01-soak-suite.mjs \
  --base bench/references/manifests/settings-resident-l01-resource-soak-base-api24.json \
  --out .bench/l01-soak/diagnostic-20-new-manifest.json \
  --cycles 20 --mode diagnostic --trace 1 --pressure-every 0 --idle-ms 5000
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/diagnostic-20-new-manifest.json \
  --out .bench/l01-soak/diagnostic-20-new-report.json
```

For the second run, add
`--metrics-out .bench/l01-soak/diagnostic-20-new-worker-metrics.jsonl` to the
generator invocation and use different manifest/report paths. The option is
diagnostic-only and defaults off. It records ordered process-level worker
`rss/heapTotal/heapUsed/external/arrayBuffers` plus resident context count; it
does not change the memory policy. The raw curves, framed responses,
diagnostic timeline and normalized result positions are in the ignored local
[first report](../../.bench/l01-soak/diagnostic-20-trace-report.json),
[second report](../../.bench/l01-soak/diagnostic-20-metrics-report.json), and
[worker samples](../../.bench/l01-soak/diagnostic-20-worker-metrics.jsonl).

## Observations

| Fresh process | Complete/exact references | Normal diagnostics | Context create / L3 evict | External Node RSS sampled peak lower bound | 5 s idle Node RSS | Edit P50/P95 |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Trace, no metrics file | 22/22 | PASS | 13 / 13 | 1,244,745,728 B | 1,074,044,928 → 968,232,960 B | 2,429 / 2,524 ms |
| Trace + worker metrics | 22/22 | PASS | 14 / 14 | 1,294,491,648 B | 1,058,922,496 → 1,058,922,496 B | 2,658 / 3,103 ms |

Both commands exit with top-level `PREPARED_SUITE=FAIL` solely because the
generation-bound public semantic-ready contract is still
`READINESS_UNSUPPORTED`; `correctness.status` and `gateStatus.diagnostics` are
separate PASS fields. The runs are trace-on attribution samples, not trace-off
product latency claims. External sampler gaps and instantaneous log RSS are not
interchangeable peak measurements.

The L3 entry threshold is `0.92 × 1024 MiB = 987,842,478.08 B`; the release
target is `0.85 × 1024 MiB = 912,680,550.4 B`. In the original
[100-edit trace](2026-10-07-resident-l01-resource-soak.md), all 104 L3 eviction
logs and all 103 following context creations were **above the entry threshold**.
Median eviction-to-next-create gap was 22 ms; median RSS change was only
+0.24 MB. Thus hysteresis is **not needed** to explain that run: each completed
query left the unleased context under a process RSS already over the entry
threshold, and the next query recreated it. Immediate post-dispose RSS says
nothing conclusive about strong object reachability before GC.

The first 20-edit run independently had all 13 evictions above entry. In the
second run, 13 of 14 were above entry; sequence 12 was at 987,189,248 B,
about 0.65 MB **below** entry yet above the 85% target. That event is
consistent with L3 hysteresis contributing once, not with hysteresis being the
primary explanation for all churn. Both runs had a committed ready index before
the first eviction, no transient reference-verifier worker events, no explicit
pressure control, and normal diagnostic publication. These facts rule out
those operations as **necessary** triggers, not as possible contributors to
memory size.

The second run's last five worker samples had `residentContextCount=0`,
`heapUsed` approximately 691.64 MB and process `rss` approximately 1,006.95 MB
without further decline during the five-second idle window. Its natural
mid-run GC-like drop (`heapUsed` about 1,013→590 MiB) and the original 100-edit
RSS sawtooth argue **against claiming monotone leakage**. Conversely, neither
the idle values nor the immediate dispose logs prove that the compiler or
SDK-keyed `DocumentRegistry` has released all SourceFiles: no post-GC live-object
census or platform PSS was taken. The second run's worker metric rows lack
timestamps, so only sample order and the bounded idle tail are used here.

## Causal conclusion and next gate

The observed latency failure is a concrete feedback loop: a full Settings LS
crosses the configured L3 RSS threshold during repeated real edits; the
post-query sampler disposes its unleased context; the next request reconstructs
compiler state. This explains repeated 2–3 s edit references under this
configuration. It does **not** prove a compiler leak, nor does it justify
raising the budget or suppressing diagnostics.

L01 stays resource-BLOCKED. Before any resident production routing or L02
behavior change, compare against the current indexed-batched default on the
same fixed workload; measure post-eviction live heap/registry ownership and
process-tree PSS on a supported platform; and show a stable memory plateau
with exact results and normal diagnostics. The 500 ms, original >3 GB/50%,
DevEco comparison and cross-platform gates remain open.
