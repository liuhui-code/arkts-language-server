# L01 L3 pressure admission: no-go on real Settings

Date: 2026-10-07. Decision: **NO-GO** for the proposed conservative transient
fallback under sustained L3. `ARKTS_L01_PRESSURE_ADMISSION` requires benchmark
control and remains off in production. L01 resource/latency admission is BLOCKED.

## Fixed input and executable replay

Real `applications_settings` checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9` was clean. The API24
compatibility SDK was `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node was `v26.3.0`, backend `ohos-typescript@4.9.5-r10`, server HEAD
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`. The server input digest
was `362f15f7d273b22b275fa24b9d0df95b2f5cfdef723c5d0c5f9db8438ff90fbe`;
the pinned build and sidecar hashes are in the ignored
`.bench/l01-soak/pressure-admission-20-manifest.json`. Postflight reported
`inputUnchanged=true`.
This experiment explicitly set `ARKTS_REFERENCES_STRATEGY=legacy`; it does
not describe an indexed-default request forced into legacy by index staleness.

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/pressure-admission-20-manifest.json \
  --out .bench/l01-soak/pressure-admission-20-escalated-report.json
```

This command needs permission for the external macOS process sampler to read
`ps` RSS. The first sandboxed attempt was **invalid before any LSP request**:
the sampler had no first sample. Its report is saved separately as
`.bench/l01-soak/pressure-admission-20-report.json`; it is not a performance
sample. The authorized replay produced the separate `-escalated-report.json`.
The shown output file already exists, and later source changes invalidate the
manifest's pinned build; a new run needs a fresh `--out` path and a regenerated
build/input pin. The command records the historical run, not a claim that the
current checkout will pass its preflight unchanged.

Targets were real `MenuController` at zero-based UTF-16 `90:17` and
`HomeInitData` at `16:13`, both `includeDeclaration=false`. The latter had 20
alternating unsaved edits and pinned 9/10-reference oracles. Normal automatic
diagnostics and original project membership stayed enabled; no forced GC or
heap snapshot was used.

| Observation | Result |
| --- | ---: |
| Requests executed / planned | 22 / 22 |
| Complete exact URI+range responses | 20 / 22 |
| `soak-edit-006`, `soak-edit-018` | each timed out at 180 s; not success |
| Normal diagnostics gate | PASS |
| L3 `memory-level3` evictions / pressure fallbacks | 2 / 2 |
| Resident context creates | 3 |
| Fallback plans | 24 conservative batches each, 1,496 membership files |
| External Node PID peak RSS lower bound | 1,409,904,640 B |
| External product-tree peak RSS lower bound | 1,464,180,736 B |
| Edited-request P50 / P95 including timeouts | 2.066 / 180.004 s |

Both timeout traces reached batch 14 only after about 178 seconds. In the
preceding batch, `createProgram` alone took about 11.5 seconds while the
compiler's final query was about 0.23 seconds. This is repeated Program
preparation, not a slow result mapping. The full raw request timeline,
normalized locations, diagnostic events and external memory curve are in the
ignored report; its 1,921 samples had 292 ms median and 333 ms P95 actual
intervals despite a 50 ms requested interval, so the observed peak is a
**lower bound**. Sampler RSS (127,451,136 B peak) was kept separate; Worker
threads were not added again to Node RSS. These are RSS, not the release PSS
comparison. `READINESS_UNSUPPORTED` is a separate readiness contract and was
not relabelled as this references failure.

## Decision

The small public LSP tests show that routing away from repeatedly re-created
resident contexts can preserve exact results in their fixtures. The real
Settings run disproves that exhaustive 64-root batching is a viable L3
fallback: lower observed RSS cannot compensate for two timed-out and therefore
incomplete requests. No production default, memory budget, timeout,
diagnostics, worker count, or project boundary was changed. Do not graduate
this flag or enter L02 on this evidence.

The earlier fixed-input production indexed comparator had 22/22 exact, no
timeout and an externally sampled 843,476,992 B Node RSS peak, but it used a
different build. It shows that the current default can be better for this
workload; it is **not** a same-build causal A/B against this experiment. The
indexed-default edited `HomeInitData` requests used accepted index proof and
one batch, whereas this explicit-legacy L3 route discarded index candidates.
Further L01 work must preserve complete proof while avoiding all 24 cold
Programs, or explicitly reject an over-budget request before doing partial
work. It must then pass the same real-project transcript without timeouts.
