# L01 Settings post-L3 live-heap attribution

Date: 2026-10-07. Decision: **disposed semantic-Worker heap is collectible in
this Settings workload; L01 resource admission remains BLOCKED**. This is a
benchmark-only forced-GC intervention, not a production GC policy or a memory
release-gate pass.

## Fixed replay

Six independent new processes (three control, three probe) used the clean
`applications_settings` checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`
without changing its project boundary, and the API24 compatibility SDK at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony` with
declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node was `v26.3.0`, backend `ohos-typescript@4.9.5-r10`, server HEAD
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`, server input digest
`198a2d0c8496dea6e688a84c266f7cb46122976efc1c1b126067f47cf178a709`,
semantic Worker bundle SHA-256
`2146b3f69b2e1f20a0e2d7b655d4b146ac60693cc3a57eb76b14691d9b509620`,
and sidecar SHA-256
`84597a63c396ceaf2a84a3ded455b5cc29d21b6c4ad3c049f7b3ca820c2fd796`.
All reports recorded `inputUnchanged=true`.

Both arms launched with `NODE_OPTIONS=--expose-gc`, normal automatic
diagnostics, the same 1,024 MiB **soft** budget, and external macOS Node-PID
RSS sampling. Only the probe arm additionally set
`ARKTS_L01_POST_EVICTION_GC_PROBE=1` with `ARKTS_BENCHMARK_CONTROL=1`.
Both arms explicitly used `ARKTS_REFERENCES_STRATEGY=legacy` and the
default-off `ARKTS_L01_PRESSURE_ADMISSION=1` experiment. They do **not**
measure the production-default `indexed-batched` L3 path.
The probe runs two GCs in the semantic Worker isolate on a later event-loop
turn **only after an actual L3 context eviction and a zero-context/zero-lease
recheck**. It records its own isolate's heap but process-wide Node RSS. The
control never calls GC. Both arms retained the existing Registry reference
count probe and a 10-second post-query idle period. No heap snapshot was taken.

The pinned, ignored local inputs are
`.bench/l01-soak/post-eviction-gc-{off,on}[-2,-3]-manifest.json`; raw reports,
memory curves, metrics, Registry counts and complete LSP timelines use the
same stem with `-report.json`, `-metrics.jsonl`, and `-registry.jsonl`.
For a new process, after rebuilding and repinning if sources change:

```sh
NODE_OPTIONS=--expose-gc node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/post-eviction-gc-on-manifest.json \
  --out .bench/l01-soak/post-eviction-gc-on-replay-report.json
```

## Public semantic and resource outcome

Every arm completed its first four real Settings references requests with
exact normalized URI/UTF-16 ranges; each matched arm had identical Location
arrays and identical normal diagnostic payloads for versions 1, 1 and 3
(codes `[2307]`, `[]`, `[]`). The fifth post-L3 request returned explicit
`-32803` resource error, **not** a complete answer. Consequently all six
top-level suites are `FAIL`, not a success recast from the four exact results.
For this legacy route, the experimental pressure policy discarded candidate
proof, planned 24 conservative batches from 1,496 member files, and refused
the request before starting a verifier because its one-batch cap could not
guarantee complete results. This is a deliberate fail-closed boundary, not
evidence that the index was stale or that production indexed-batched would
make the same decision.
`READINESS_UNSUPPORTED` remains an independent missing public readiness
contract. No SDK mismatch, OOM or partial Locations were observed.

| New-process pair/order | Control sampled Node peak | Probe sampled Node peak | Probe Worker heap before → after GC | Node RSS before → after GC | GC time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1, OFF → ON | 1,024,602,112 B | 847,597,568 B | 638,243,248 → 32,920,688 B | 849,510,400 → 818,978,816 B | 43.5 ms |
| 2, ON → OFF | 1,029,496,832 B | 861,970,432 B | 645,754,624 → 32,927,064 B | 861,036,544 → 831,254,528 B | 41.1 ms |
| 3, OFF → ON | 1,023,905,792 B | 861,499,392 B | 646,117,136 → 32,920,888 B | 859,230,208 → 829,657,088 B | 43.8 ms |

Each probe arm emitted exactly one `complete` event after an explicit L3
eviction, with `residentContextCount=0`, `leaseCount=0` and
`evictedContextCount=1`. The immediate semantic-Worker heap reduction was
605–613 MB; the immediate whole-Node RSS reduction was only 29–31 MB. Registry
counts after the sampled first service disposal were zero in all arms. The
event order repeated in all three pairs: control `create 1 → evict 1 →
create 2 → diagnose v3 → evict 2`; probe `create 1 → evict 1 → GC →
create 2 → diagnose v3`. Both arms admitted the normal version-3 diagnostic
context, but the probe's heap rose after the old heap had been collected.
Thus the lower sampled probe
peak is consistent with avoiding overlap of *collectible* old compiler heap
and subsequent diagnostic compilation. It does not mean an equivalent amount
of physical memory was returned to the OS or prove that explicit GC is a safe
shipping fix. The requested 50 ms sampler actually observed P50 intervals of
about 128–130 ms, so sampled peaks are lower bounds.

The three post-GC heaps near 33 MB and zero sampled Registry references argue
against a strong-reference compiler-object leak **for this disposed context**.
They do not identify every live object in other isolates or work paths; an
uncleared WeakRef/heap snapshot was not used here. Mac RSS is not Linux PSS.
This experiment also leaves the original >3 GB reproducer, final 50% memory
gate, L01 500 ms stability and complete post-L3 response unresolved.

Do not enable the probe or transient-diagnosis experiment in production.
The next L01 decision must compare a budget-safe way to prevent overlapping
old and newly admitted semantic state **without losing diagnostics or exact
references**, while accounting for whole-process RSS/PSS and cold latency.
L02 production work remains unadmitted.
