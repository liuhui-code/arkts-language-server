# L01 Settings/API24 100-edit resource soak: exact, not resource-admitted

Date: 2026-10-07. Status: **correctness PASS for the observed reference loop;
L01 long-run resource admission BLOCKED; edit-warm latency FAIL; semantic readiness
UNSUPPORTED**. No production routing, worker-count, cache-budget, or diagnostic
policy changed. This is a new L01 experiment, not the rejected S05 disk-session
reuse candidate.

## Fixed input and replay

- Settings checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`, clean before and
  after. Original project boundary and files were untouched; all 100 edits were
  LSP unsaved overlays.
- API24 compatibility-track SDK at
  `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, declaration
  digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  This is not a matched API23/DevEco claim. Node `v26.3.0`, backend
  `ohos-typescript@4.9.5-r10`, server HEAD `72a2fa8`, built server SHA-256
  `d03fb34c69c70c4a1c26350acd9e752683ced9cdff145beec8f8434952abd54e`.
- Runtime: `legacy` full-SDK LS, `ARKTS_SEMANTIC_SESSION_REUSE=off`, 1024 MiB
  **soft** budget, one real child-process Content-Length LSP session per run.
  `HomeInitData` declaration at `16:13` (zero-based UTF-16), no declaration in
  results. Base oracle has nine positions; each odd overlay adds a tenth real
  `HomeInitData` use, each even overlay removes it. Normal automatic diagnostics
  remained enabled.
- The first two runs use the [unbarriered pinned base](../../bench/references/manifests/settings-resident-l01-resource-soak-unbarriered-api24.json);
  the third uses the [diagnostic-barrier pinned base](../../bench/references/manifests/settings-resident-l01-resource-soak-base-api24.json).
  To reproduce the third run with new output names:

  ```bash
  node scripts/bench/generate-l01-soak-suite.mjs --base bench/references/manifests/settings-resident-l01-resource-soak-base-api24.json --out .bench/l01-soak/new-manifest.json --cycles 100 --pressure-every 0 --idle-ms 5000
  node scripts/bench/replay-references.mjs --prepared-suite .bench/l01-soak/new-manifest.json --out .bench/l01-soak/new-report.json
  ```

  For the first two, use the unbarriered base and `--pressure-every 20` or
  `0` respectively. Regeneration was byte-for-byte equal to all three saved
  run manifests. Use new output names (`wx`); each report preserves every
  response, normalized position, diagnostic event, monotonic timeline and raw
  external RSS sample. The `.bench/l01-soak` raw files are machine-local/
  ignored by Git; the table below is the portable summary, not a substitute
  for those raw curves.

## Observations

| Independent fresh process | Requests exact | Normal diagnostics | Edit-reference latency | External Node PID RSS peak lower bound | Idle end Node RSS | Sampling gap P95/max |
| --- | ---: | --- | --- | ---: | ---: | --- |
| [Trace-on, L3 every 20 edits](../../.bench/l01-soak/trace-on-report.json) | 107/107; 100 overlays + 5 pressure recoveries | PASS; v1 and v101 | P50 2,490 ms; P95 2,923 ms | 1,582,448,640 B | 1,000,374,272 B | 146/234 ms |
| [Trace-off, no explicit L3](../../.bench/l01-soak/trace-off-report.json) | 102/102 | **FAIL**; `MenuController` v1 never arrived within 180 s, `HomeInitData` v101 arrived | P50 2,412 ms; P95 2,631 ms | 2,137,100,288 B | 839,880,704 B | 154/16,890 ms |
| [Trace-off, v1 diagnostic barrier, no explicit L3](../../.bench/l01-soak/trace-off-barrier-report.json) | 102/102 | PASS; both v1 and final v101 observed | P50 2,484 ms; P95 4,437 ms | 1,452,896,256 B | 874,291,200 B | 181/331 ms |

The first run's five explicit `arkts/benchmark/applyMemoryPressure` controls
each observed a `memory-level3` eviction before the next exact response. Its
trace contains **104** `semantic.context.create` and **104**
`semantic.context.evict(reason=memory-level3)` events in 107 requests, not a
stable resident-context plateau. The first eviction (server RSS 998,297,600 B)
preceded the **first** explicit pressure request, so the churn was not solely
caused by the five controls. The last five overlay requests took
2.89/3.23/3.24/3.44/3.43 s. Five seconds of idle reduced sampled Node RSS
from 1,090,985,984 to 1,000,374,272 B, not to the initial prepared state.

The observed churn is consistent with the current
[`SemanticMemoryPolicy`](../../src/semantic/coordinator/memory-policy.ts) and
[`sampleMemory`](../../src/semantic/semantic-worker-runtime.ts): once RSS crosses
the L3 entry ratio, the stateful policy stays at L3 until RSS falls below the
lower target ratio; each sample then disposes every unleased context. The
trace shows the next query acquiring a new sequence while RSS remains near or
above that target, then another eviction. This explains the **control-loop
pattern**, not which compiler/registry objects or V8 pages retain memory; that
ownership still needs separate measurement before a fix is chosen.

The diagnostic barrier in the third run was observed at 16.77 s after process
start, before the second reference request. It prevents the v1 publication from
being hidden by rapid later edits, but its waiting time is **not** omitted from
preparation cost. That run still reached 1.45 GB sampled Node RSS and slow
edit-warm queries. The unbarriered trace-off run must remain a diagnostic
failure, even though all Location sets were exact. Its 16.89 s sampling hole
also makes its 2.14 GB peak especially unsuitable for a precise A/B ratio.

The tool's top-level `PREPARED_SUITE=FAIL` is expected because the server lacks
the generation-bound public semantic-ready contract. The report separates
`correctness.status` and `gateStatus.diagnostics`; it does not recast a
candidate-ready control as a ready-state SLO pass.

## Decision boundary

This closes a **single-symbol 100-edit exactness/control slice**, not L01
resource safety. Trace-on L3 churn and the trace-off 1.45 GB peak require a
budgeted resident-vs-current-default comparator, post-eviction PSS where
available, plateau analysis across independent runs, and resident Program/
SourceFile/registry/transient-verifier accounting. A 1024 MiB configured
budget is not a hard RSS cap; Mac RSS is not Linux PSS. Only the child Node PID
is counted once (its worker threads are already included); the sampler/harness
are separate. Sampled peaks are lower bounds.

Per the [L01 stop line](../plans/2026-10-06-budgeted-resident-semantic-plan.md),
do **not** promote the resident route or start L02 production changes from
these data. New-symbol ≤500 ms, L01 long-run resource admission, original
>3 GB/50% references memory gate, DevEco/PSS, and cross-platform gates remain
open. The next investigation should isolate automatic L3 thrash versus
compiler-state retention under the same Settings loop; no budget increase,
diagnostic suppression, or scope reduction is authorized by this result.

That follow-up is now recorded in the
[short automatic-pressure attribution report](2026-10-07-resident-l01-pressure-attribution.md):
two additional 20-edit real-LSP processes reproduced 13/13 and 14/14
create/evict loops without explicit L3 controls. It narrows the cause to a
high-RSS feedback loop under this soft budget, but not to a specific retained
compiler object. L01 resource admission remains BLOCKED.
