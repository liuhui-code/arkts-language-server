# Auto-import transient worker spike

Date: 2026-09-14. Parent revision:
`d51ffa1d07142c53130284b68d743d0426edac36`.

## Question

The root-batching experiment kept every sequential Program in the long-lived semantic worker. This
spike tested whether running each multi-batch completion in a fresh Node worker thread would release
compiler state between batches and reduce the product RSS peak.

The spike changed no candidate set, diagnostics policy, SDK, project boundary, or completion result.
It was never committed and was removed after measurement.

## Fixed replay

- Workspace: Gramony `0a1ee4b026b6736671f0030ba9859aceaa962298`.
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API 24 / ETS 6.1.1.125.
- Node: v26.3.0.
- Target: `features/home/src/main/ets/dao/ChatDao.ets`.
- In-memory overlay: remove the existing `Chat` import and complete `Cha` at UTF-16 `43:41`.
- Each case used a fresh language-server process and Rust cache, waited for catalog `ready`, retained
  automatic diagnostics, and sampled the whole product process tree every 100 ms.
- Limit 128 is the unchanged resident baseline. Limits 8 and 2 used one transient worker thread per
  sequential compiler batch.

| Root limit | Execution | Programs | Project files per Program | Completion | Peak RSS |
|---:|---|---:|---|---:|---:|
| 128 | resident | 1 | 66 | 4.031 s | 497,475,584 B |
| 8 | transient worker | 2 | 39 / 66 | 7.134 s | 539,459,584 B |
| 2 | transient worker | 6 | 38 / 28 / 30 / 33 / 25 / 65 | 18.750 s | 550,486,016 B |

All three cases returned the same 16 normalized completion identities and edits, including all 12
discovery-backed pre-resolved items. All published 31 diagnostics with SHA-256
`96ac3039af05961adc6778ea9ba90747a66dff55f1513da529420ff4b54b166a`.

Relative to the resident baseline, the two-worker-batch case increased completion latency by 76.97%
and peak RSS by 8.44%. The six-worker-batch case increased latency by 365.16% and peak RSS by 10.66%.
The six worker completion boundaries reported process RSS of 506,757,120 / 523,153,408 /
529,842,176 / 523,505,664 / 528,838,656 / 537,829,376 bytes.

## Decision

Correctness: GREEN. Memory and latency gates: FAILED.

Node worker threads isolate V8 execution contexts but share one operating-system process. Destroying
the worker did not make allocator/compiler pages disappear from the process RSS before the next batch;
each batch also paid compiler and worker startup cost. Therefore transient worker threads are not a
working-set bound for this path. The prototype implementation was withdrawn.

The next slice must identify the actual dependency closure of each admitted discovery root. In
particular, the final two-root batch still reached 65 project files. A batch must be correlated with
stable, privacy-safe candidate/root identities and its resulting Program cardinality before changing
semantic boundaries. Do not respond by adding workers, tuning the root-count constant, truncating
candidates, or weakening diagnostics.

Normalized evidence is in
[`evidence/2026-09-14-auto-import-transient-worker-spike.json`](evidence/2026-09-14-auto-import-transient-worker-spike.json).
The raw 100 ms curves remain at
`/private/tmp/arkts-gramony-auto-import-batches-current.json`.
