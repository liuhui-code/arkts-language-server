# L01 Settings/API24: production indexed-batched versus full-LS edit replay

Date: 2026-10-07. Status: **same-input diagnostic comparison complete; L01 resource
admission remains BLOCKED**. No production strategy, budget, worker, diagnostic,
or result-completeness policy was changed.

## Fixed input and replay

Two independent fresh server processes used clean Settings checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, the API24 compatibility-track
SDK at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`
(declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`),
server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`, built server SHA-256
`d03fb34c69c70c4a1c26350acd9e752683ced9cdff145beec8f8434952abd54e`,
Node `v26.3.0`, and `ohos-typescript@4.9.5-r10`. The compared manifests differ
only in benchmark ID and `ARKTS_REFERENCES_STRATEGY=legacy|indexed-batched`;
both retain full SDK, 1024 MiB soft budget, trace enabled, no explicit pressure
controls, and normal automatic diagnostics. The same 20 alternating unsaved
edits to `HomeInitData` are compared, following the same initial
`MenuController` and `HomeInitData` requests. The real target is
`common/src/main/ets/sendable/HomeInitData.ets` at zero-based UTF-16 `16:13`,
`includeDeclaration=false`; odd edits have ten known locations and even edits
restore nine.

Reproduce the indexed side with new, unused output paths:

```bash
node scripts/bench/generate-l01-soak-suite.mjs \
  --base bench/references/manifests/settings-resident-l01-resource-soak-base-api24.json \
  --out .bench/l01-soak/indexed-20-new-manifest.json \
  --cycles 20 --mode diagnostic --trace 1 --strategy indexed-batched \
  --pressure-every 0 --idle-ms 5000
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/indexed-20-new-manifest.json \
  --out .bench/l01-soak/indexed-20-new-report.json
```

The legacy-side command and raw report are in the
[pressure attribution report](2026-10-07-resident-l01-pressure-attribution.md).
The ignored local [indexed report](../../.bench/l01-soak/indexed-20-comparator-20261007-report.json)
and [manifest](../../.bench/l01-soak/indexed-20-comparator-20261007-manifest.json)
preserve the full framed responses, diagnostic timeline, trace and external
process-memory samples. The original reports' 22 corresponding normalized
Location arrays were also compared directly: **22/22 identical**, not just
equal counts.

## Observations

| Metric | Full-LS `legacy` | Production-default `indexed-batched` |
| --- | ---: | ---: |
| Completed exact references | 22/22 | 22/22 |
| Normal diagnostic gate | PASS | PASS |
| Initial `MenuController` references | 9.259 s | 111.220 s |
| Initial `HomeInitData` references | 0.139 s | 3.507 s |
| 20 edit references P50 / P95 | 2.422 / 2.524 s | 3.693 / 4.145 s |
| External sampled Node RSS peak lower bound | 1,244,745,728 B | 843,476,992 B |
| External sampled product RSS peak lower bound | 1,291,206,656 B | 888,082,432 B |
| Five-second idle Node RSS start → end | 1,027,584,000 → 924,479,488 B | 448,872,448 → 413,515,776 B |
| Resident context create / L3 evict | 13 / 13 | 2 / 1 |

Indexed Node peak was about **32.2% lower**, while edit P50/P95 were about
**1.52×/1.64× slower**. External sampler actual P95 intervals were 133 ms for
legacy and 154 ms for indexed; these are sampled peak *lower bounds*, not PSS
or live-object measurements. The sampler process and Node worker RSS were not
added to the target Node RSS.

The effective route differs by request. The initial `MenuController` candidate
selection fell back to conservative bounded batching: 24/24 batches completed,
producing the 111-second result. `HomeInitData` baseline and all 20 edit
requests had accepted candidate selection and `candidateMode=indexed`, one
batch each. Thus unsaved `didChange` did **not** force these requests into
legacy, and no `references.index.recovered` transition was involved. This is
consistent with the current freshness contract: unsaved changes invalidate
old result-cache entries but do not themselves dirty the persisted index.

The first fallback was `candidate-ineligible`, **not** stale generation:
`references.index.direct-proof` reported `completeness=ready` but no complete
declaration identity. Candidate selection used 4.255 s, then 24 transient
batch verifications used 106.855 s. Their Program-ready time summed to
93.275 s (`createProgram` 78.471 s), versus 4.903 s in actual compiler
queries. A representative indexed edit (`soak-edit-001`) used 3.522 s total:
14.55 ms candidate selection, about 88.78 ms planning, 258.65 ms worker
startup, 3.025 s Program readiness (`createProgram` 2.525 s), and 53.71 ms
compiler query. Every `HomeInitData` edit started one transient verifier;
there were no exact-result cache hits because each edit changed the overlay
snapshot. The normal diagnostic publications occurred after the corresponding
requests and the final v21 diagnostic gate passed; they were not disabled to
obtain these timings.

Both top-level reports say `PREPARED_SUITE=FAIL` because the public semantic
readiness contract remains `READINESS_UNSUPPORTED`; `correctness.status=PASS`
and `gateStatus.diagnostics=PASS` are narrower, independently checked facts.
There was no request timeout, OOM, partial answer, or missing known reference.

## Decision

The comparator rejects the hypothesis that the 20-edit production-default
path simply becomes legacy after unsaved edits. It also shows a concrete
latency cost in exchange for lower sampled RSS, with an especially severe
conservative-batch fallback on the initial cross-workspace symbol. This one
fresh-process trace-on pair is causal for the strategy toggle under fixed
inputs, but not a statistical release benchmark, a PSS comparison, or a
post-eviction live-heap census. L01 remains resource-BLOCKED; do not advance
L02 production behavior, raise the memory budget, or claim the 500 ms / original
>3 GB / 50% memory gates have passed. The next L01 evidence must identify
post-eviction live-object ownership and include a supported product-memory
measurement before changing resident routing.
