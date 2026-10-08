# L01 same-build indexed pressure control: not admitted

Date: 2026-10-07. Status: **FAIL/BLOCKED**, not an L3 success. This diagnostic
control tested whether the existing indexed path could avoid the previous
explicit-legacy route's 24 cold batches on the same Settings checkout and a
newly pinned build. It did not change production routing or resource budgets.

## Fixed input and replay

`applications_settings` was clean at
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, with the API24 compatibility
SDK declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node was v26.3.0; backend was `ohos-typescript@4.9.5-r10`. Server HEAD was
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`, server input digest
`7970d3cc8f732703fe365cb36d8817c99cf8ff4d0fae447dcb31088d61261825`.
The ignored local [manifest](../../.bench/l01-soak/indexed-l3-2-manifest.json)
pins all artifact hashes and the two real UTF-16 query positions:
`MenuController` at `90:17` and `HomeInitData` at `16:13`. Source and SDK inputs
remained unchanged through the run.

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/indexed-l3-2-manifest.json \
  --out .bench/l01-soak/indexed-l3-2-rerun-report.json
```

The external macOS RSS sampler needs permission to read `ps`. Re-pin the
manifest if code/build/SDK changes. The raw [report](../../.bench/l01-soak/indexed-l3-2-report.json)
contains the request transcript, exact comparisons, compiler phase trace,
diagnostics, and 831 external RSS samples.

| Observation | Result |
| --- | ---: |
| Planned / executed requests | 6 / 4 |
| Complete exact URI+range responses | 3 / 4 executed |
| Initial `MenuController` | TIMEOUT at 180.011 s; no completed result |
| `HomeInitData` baseline + two unsaved edits | all exact; 11.088 / 11.116 / 13.624 s |
| Planned explicit L3 recovery controls | 2 blocked: `EVICTION_NOT_OBSERVED` |
| Normal diagnostics gate | FAIL (initial document timed out) |
| Semantic readiness | `READINESS_UNSUPPORTED`, separate contract |
| External Node PID peak RSS lower bound | 829,407,232 B |
| External product-tree RSS lower bound | 879,812,608 B |

The initial constructor query's ready index returned `unsupported` and then
`candidate-ineligible`; the planner retained all 1,496 membership files in
24 conservative batches. The trace reached only batch 12 near 157 seconds.
The three `HomeInitData` queries accepted current-generation, complete
identity proof (`seed-accepted`) and each used one indexed batch with four
candidate files. Thus the indexed path can avoid exhaustive batching for
this *particular* symbol and snapshot, but it cannot do so for every real
Settings symbol. The two explicit L3 scenarios never ran because the required
eviction was not observed; this run provides **no L3 recovery admission**.

The 50 ms requested sampler interval was actually 300 ms P50 / 351 ms P95,
so peak RSS is a lower bound. Sampler memory was separate from Node RSS and
worker-thread RSS was not added twice. Neither the lower RSS nor three exact
results rescues the timed-out request or blocked diagnostics/pressure gates.
Do not graduate indexed pressure handling, L01, or L02 on this result.
