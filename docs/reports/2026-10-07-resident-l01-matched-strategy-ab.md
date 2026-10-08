# L01 Settings same-build references strategy A/B: neither admitted

Date: 2026-10-07. Status: **FAIL/BLOCKED** for L01 resource and readiness
graduation. This is one fresh-process replay per strategy, not a latency
distribution or a production routing change.

## Fixed input and command

Both local manifests use the clean `applications_settings` checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, API24 compatibility SDK
declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`,
Node v26.3.0, and `ohos-typescript@4.9.5-r10`. Server HEAD was
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`; server input digest was
`7970d3cc8f732703fe365cb36d8817c99cf8ff4d0fae447dcb31088d61261825`
and the launched bundle SHA-256 was
`8071e99794bf051e8b93ae285ff48f19d8336a20b5bfd09b3c942574cf4b0b60`.
Both reports record `inputUnchanged=true`. The six planned scenarios, target
pool, source hashes, oracle hashes, 180-second request limit and 1024 MiB
soft budget match. The manifests differ in strategy (`indexed-batched` versus
`legacy`), benchmark ID, and metrics output path, so their suite digests differ.

The target positions are zero-based UTF-16. Both request
`includeDeclaration=false`:

| Target | File | Cursor | Verified oracle |
| --- | --- | ---: | ---: |
| `MenuController` constructor usage | `common/src/main/ets/core/controller/MenuController.ets` | `90:17` | 267 locations |
| `HomeInitData` | `common/src/main/ets/sendable/HomeInitData.ets` | `16:13` | 9 baseline; 10/9 after the two unsaved edits |

Run the two pinned manifests separately; `--out` must name a new report file:

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/indexed-l3-2-manifest.json \
  --out .bench/l01-soak/indexed-l3-2-rerun-report.json
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/legacy-l3-2-manifest.json \
  --out .bench/l01-soak/legacy-l3-2-rerun-report.json
```

The raw, ignored local reports are
[indexed](../../.bench/l01-soak/indexed-l3-2-report.json) and
[legacy](../../.bench/l01-soak/legacy-l3-2-report.json). The macOS external
sampler requires permission to read the process tree via `ps`. Re-pin a
manifest after any source, SDK or server artifact change.

## Observed requests

| Planned scenario | Indexed-batched | Legacy |
| --- | ---: | ---: |
| First `MenuController` references | TIMEOUT, 180.011 s; no complete result | 60.734 s; 267/267 exact |
| `HomeInitData` baseline | 11.088 s; 9/9 exact | 0.781 s; 9/9 exact |
| Unsaved edit 1, version 2 | 11.116 s; 10/10 exact | 4.266 s; 10/10 exact |
| Explicit L3 recovery 1 | BLOCKED: `EVICTION_NOT_OBSERVED` | 26.990 s; 10/10 exact |
| Unsaved edit 2, version 3 | 13.624 s; 9/9 exact | 2.306 s; 9/9 exact |
| Explicit L3 recovery 2 | BLOCKED: `EVICTION_NOT_OBSERVED` | 23.468 s; 9/9 exact |

Indexed completed three of four executed requests exactly; the initial
constructor request timed out, and neither planned L3 recovery request ran.
Its ready index reported `unsupported` and `candidate-ineligible` for the
constructor; planning retained 1,496 membership files in 24 conservative
batches and reached batch 12 before timeout. The three exact `HomeInitData`
requests accepted a current-generation identity proof and each used one batch
with four candidates. These paths and phase evidence are detailed in the
[indexed control](2026-10-07-resident-l01-indexed-pressure-control.md).

Legacy completed all six requests with exact normalized URI and UTF-16 range
sets, no missing, extra, duplicate or invalid locations. Its two explicit
L3 controls observed `memory-level3` context eviction before querying. Normal
diagnostics passed. In the indexed run, the first two diagnostic waits timed
out while the long initial request occupied the server; the diagnostics gate
failed. Both runs report candidate index ready but semantic readiness as
`READINESS_UNSUPPORTED` (`NO_GENERATION_BOUND_PUBLIC_CONTRACT`), a separate
contract from completed references.

## External RSS samples and interpretation

| External process metric | Indexed-batched | Legacy |
| --- | ---: | ---: |
| Node PID peak RSS, sampled lower bound | 829,407,232 B | 1,536,786,432 B |
| Server + sidecar peak RSS, sampled lower bound | 879,812,608 B | 1,585,246,208 B |
| Sampler peak RSS, separately counted | 126,251,008 B | 124,801,024 B |
| Samples | 831 | 443 |
| Requested / actual P50 / actual P95 interval | 50 / 300 / 351 ms | 50 / 311 / 638 ms |

The Node figure counts the single Node process, including its worker threads;
worker RSS is not added again. The sampler and its memory are separate. Sampled
peaks are lower bounds because the actual intervals exceeded the requested
50 ms. Indexed executed fewer requests and never ran the two L3 controls,
while legacy completed them. The numerical peak difference is therefore
**not** a controlled causal memory-saving percentage for equivalent completed
work. The same build and inputs establish a useful failure comparison, not
graduation of either strategy: indexed lost completeness to timeout on a real
constructor query; legacy preserved completeness but reached about 1.54 GB
sampled Node RSS and took 23–27 seconds after L3 eviction. Neither meets L01
resource/readiness admission, and this evidence does not admit L02.
