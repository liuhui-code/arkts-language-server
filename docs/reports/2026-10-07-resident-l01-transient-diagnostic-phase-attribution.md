# L01 transient diagnosis: phase attribution and reversed-order Settings replay

Date: 2026-10-07. Decision: **do not promote the experimental transient
diagnosis route**. L01 resource admission remains BLOCKED; L02 is not admitted.
The diagnostic phase trace is opt-in through
`ARKTS_BENCHMARK_CONTROL=1`, `ARKTS_L01_TRANSIENT_DIAGNOSTICS=1`, and
`ARKTS_L01_TRANSIENT_DIAGNOSTICS_TRACE=1`; production defaults are unchanged.

## Fixed input and method

The local replay uses clean `applications_settings` commit
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, its unmodified project
boundary, the API24 compatibility SDK at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, SDK
declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`,
Node `v26.3.0`, and `ohos-typescript@4.9.5-r10`. The two new pairs use the
same server input digest `2a4f8868faaec129b5b5aa25d68329c75f3c70999fcb48f750899c011c95d83d`,
semantic-worker bundle digest
`19d421df8ee98fd60c4d636ad8557f0bd1636efb2c0bab4861903ca976fbd7f7`,
and diagnostic-worker bundle digest
`f8102fb33e0b630e0ce65e9f857a357b1bc2a224318815f4d4b4e5aaaa3a29f5`.
Both manifests passed the exact preflight pin check and each report recorded
`inputUnchanged=true`. The OFF/ON process order was reversed between pairs;
both arms kept normal automatic diagnostics, a 512 MiB **soft** budget solely
to exercise active L3, and the same four real references queries. This is a
mechanism test, not a production budget or release PSS result.

The ignored local reports and pinned replay inputs are:

```text
.bench/l01-soak/settings-diagnostic-phase-{on,off}-pair{1,2}-report.json
.bench/l01-soak/settings-diagnostic-artificial-l3-{on,off}-2.json
```

For one new-process replay, substitute `on` or `off` and use a new output path:

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/settings-diagnostic-artificial-l3-on-2.json \
  --out .bench/l01-soak/settings-diagnostic-phase-on-replay.json
```

## Exact results and memory

| Pair / process order | OFF Node peak | ON Node peak | ON vs OFF | OFF / ON product-tree peak |
| --- | ---: | ---: | ---: | ---: |
| Earlier, OFF → ON; before phase trace | 1,801,211,904 B | 2,164,625,408 B | +20.2% | 1,848,041,472 / 2,213,429,248 B |
| Phase pair 1, ON → OFF | 1,495,293,952 B | 1,749,614,592 B | +17.0% | 1,546,719,232 / 1,762,779,136 B |
| Phase pair 2, OFF → ON | 1,682,055,168 B | 1,352,839,168 B | −19.6% | 1,733,029,888 / 1,407,287,296 B |

Every arm completed 4/4 exact normalized reference requests, and OFF/ON
published exactly equal automatic diagnostic payloads at versions 1, 1, and 3
(codes `[2307]`, `[]`, `[]`). The experimental arm ran three L3 transient
diagnoses and no resident diagnostic Program; the control used three resident
L3 diagnostic Programs. All six top-level suite statuses are `FAIL` solely
because `READINESS_UNSUPPORTED` remains an independent missing public readiness
contract. Executed correctness and diagnostic gates are PASS, not partial
success disguised as a release pass.

The two same-build pairs **reverse the sign** of the peak difference. Thus the
first +20.2% observation was real for that run, but is not a repeatable
no-regression or benefit verdict. The external macOS sampler requested 50 ms;
observed p50 intervals were about 294–300 ms, so every sampled peak is a lower
bound. Node worker threads are included once in the Node PID; product-tree RSS
includes the Rust sidecar. Neither measure is PSS or live heap after GC.
Although both new manifests set the trace flag, only ON executes the traced
route, so the new A/B also includes small opt-in logging overhead; it is an
attribution experiment, not a publishable production memory comparison.

## Phase attribution

The opt-in structured `diagnostics.transient.phase` trace records parent
`spawn.before/after`, `response`, `terminate.start/end`, and child
`engine.configure/sync/diagnose/dispose` boundaries. It includes a trace ID,
epoch and monotonic time, PID/thread ID, document version, process RSS and
per-thread heap used; it contains no source text or file path. The public LSP
test first failed without the phase events, then passed with exact diagnostics
and ordered events. See [TDD evidence](../tdd/l01-transient-diagnostic-phase-trace.md).

For final version 3 in phase pair 1, Node RSS was 1,460,187,136 B **before**
worker spawn, 1,540,280,320 B at `engine.diagnose.start`, 1,747,324,928 B at
`engine.diagnose.end`, and 1,698,750,464 B after termination. Its sampled
Node peak occurred inside this diagnosis. In phase pair 2, the corresponding
values were 809,222,144 / 866,226,176 / 1,113,022,464 / 1,064,476,672 B.
Pair 2's sampled 1,352,839,168 B peak occurred **earlier**, around a references
response and context eviction, not in the final transient diagnosis.

The diagnostic Program contributes roughly 200–250 MB of RSS during its exact
query, but the much larger difference between pairs already existed before
its spawn. A smaller number of resident context creations therefore does not
establish lower total process memory. The measurements are consistent with
different GC/retention timing in the parent; they do **not** prove a compiler
leak, permanent Worker retention, or a safe memory win. The next attribution
step is controlled post-eviction live-heap/object accounting plus independent
process PSS where available, while keeping the exact Settings workload and
normal diagnostics. Until a repeatable resource gate passes, keep this path
default-off and leave L01 BLOCKED.
