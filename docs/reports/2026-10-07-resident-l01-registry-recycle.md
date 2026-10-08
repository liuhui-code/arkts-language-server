# L01 Settings/API24 L2 registry recycle: correctness fixed, latency gate open

Date: 2026-10-07. Status: **backend ownership regression GREEN; real-project
resource/latency admission BLOCKED**. No production references route, SDK
profile, budget, worker count, index authority or diagnostic behavior changed.

## Change and public regression

The pinned `ohos-typescript@4.9.5-r10` implementation of
`cleanupSemanticCache()` discards its `program` pointer without releasing
`DocumentRegistry` references. Its later `dispose()` can only release the
Program currently held. The [two fresh pre-fix Settings probes](2026-10-07-resident-l01-registry-ownership.md)
showed `trim 2261→2261`, then after a rebuild `dispose 4522→2261` for the
same sampled path cohort. A new real child-process LSP regression first
failed: the first query after benchmark-only L2 returned `-32603`; it also
requires exact references/definition, normal diagnostics, L2 release and L3
release.

The backend's L2 `trim()` now asks the official LS to `dispose()` while it
still owns its Program, then creates an empty LS using the same host and
SDK-keyed registry. It does not manually decrement registry internals.
The public [regression test](../../tests/semantic/semantic-registry-trim.test.mjs)
passes: post-L2 and post-L3 sampled registry refcounts are zero, and the
repeated references/definition locations and v1 diagnostics are correct.
The level2 request exists only behind the pre-existing
`ARKTS_BENCHMARK_CONTROL=1` test guard; ordinary LSP clients do not receive
this control endpoint.

Final focused verification: `pnpm check`, `pnpm build`, 25/25 adjacent LSP
and lifecycle tests, and `git diff --check` passed. The broader
`pnpm check:fast` did **not** pass in this environment: multiple other
public tests with fixed 3–5 s timeouts expired during cold semantic queries,
so that run was stopped after the failures. In isolation, the conformance
scenario passed with host SDK discovery disabled, but the logging test's
3 s completion timeout still failed; the same completion completed normally
in 2.918 s with a 20 s diagnostic timeout. This is not a full-suite GREEN
or proof of a new regression. The fixed-timeout suite needs a separate,
controlled baseline before a merge request.

## Two fresh real Settings replays

Both fixed-build processes used the same clean Settings
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, API24 compatibility SDK
digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`,
Node `v26.3.0`, 1024 MiB soft budget, full SDK, legacy full-LS experimental
path, normal diagnostics, and no explicit pressure, forced GC or heap
snapshot. The server input and build SHA-256 are frozen in each ignored
prepared manifest. The workload is one `MenuController` cold preparation,
one `HomeInitData` baseline and 20 alternating unsaved 9↔10-reference edits;
every response is checked against normalized exact locations.
The tested fixed server-input SHA-256 was
`a89e72b9813cc27bcf3c19407ae189805be92607cb27e954c6540f121e6a2f88`,
and built server SHA-256 was
`9234d3798521ccb77d925a05bfc635f69f8f04c72274dc83c524ce0ec7022a7b`.
Later comment-only edits do not retroactively change those frozen results.

| Run | Exact/diagnostics | Natural L2 / L3 | Registry after every sampled L2/L3 | Edit P50 / P95 / max | Sampled Node RSS peak lower bound | Last positive idle Node RSS |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| Fixed A | 22/22, PASS | 2 / 3 | all `0` | 2.397 / 28.086 / 28.227 s | 1,517,674,496 B | 706,768,896 B |
| Fixed B | 22/22, PASS | 1 / 0 | L2 `0`; no L3 | 2.312 / 3.926 / 27.004 s | 1,029,648,384 B | 863,875,072 B |

Raw evidence remains ignored and local:
[A report with complete RSS curve, timeline and locations](../../.bench/l01-soak/registry-recycle-20-report.json),
[A registry trace](../../.bench/l01-soak/registry-recycle-20.jsonl),
[B report](../../.bench/l01-soak/registry-recycle-20b-report.json),
[B registry trace](../../.bench/l01-soak/registry-recycle-20b.jsonl).
Both top-level commands say `PREPARED_SUITE=FAIL` only because the separate
generation-bound readiness contract is still `READINESS_UNSUPPORTED`;
`correctness.status` and normal-diagnostics gate are both PASS. Mac external
`ps` samples the whole Node PID once, not each worker thread; its observed
interval was variable (A median 331 ms, B 328 ms), so peak numbers are
lower bounds and not process-tree PSS. The sampler process is counted
separately.

For a fresh run from this checkout, after pinning the current built server
and input in the local base manifest:

```bash
node scripts/bench/generate-l01-soak-suite.mjs \
  --base .bench/l01-soak/registry-recycle-base-20261007.json \
  --out .bench/l01-soak/registry-recycle-new-manifest.json \
  --cycles 20 --mode diagnostic --trace 1 --pressure-every 0 --idle-ms 5000 \
  --registry-probe-out .bench/l01-soak/registry-recycle-new.jsonl
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/registry-recycle-new-manifest.json \
  --out .bench/l01-soak/registry-recycle-new-report.json
```

## Interpretation and stop line

The direct ownership invariant is reproduced: sampled SourceFile-path
refcounts fell from 2,261 to zero at each observed L2; all three observed
L3 disposals in A also ended at zero. The legacy pre-fix runs instead kept
one reference per path. This repairs an actual lifecycle defect, including
the synthetic post-trim `-32603` failure, but **does not prove a low-memory
product result**. The fixed runs varied sharply: one had a higher sampled
peak than either pre-fix run; the other lower. The initial cold request
itself took 39.1/45.9 s fixed versus 10.4/9.3 s in the earlier samples,
before L2 could explain the difference. Hence these few runs are not a
controlled causal RSS/latency comparison.

The slow fixed edit requests are nevertheless concrete and phase-attributed:
after recycle or whole-context eviction, repeated cold
`createProgram` phases took roughly 21–24 s, whereas most ordinary edits
remained near 2–3 s. Fixed A had four edits over 25 s; fixed B had one
27.0 s edit. Releasing registry ownership can remove reusable AST state, so
the next full Settings Program remains expensive. Do not hide this tail
cost behind median-only reporting, raise the budget without evidence, or
claim the 500 ms target. L01 resource admission, supported process-tree PSS,
the original >3 GB/50% case and DevEco comparison remain open. The current
production `indexed-batched + closure + full SDK` route remains unchanged;
L02 production advancement is not approved by this fix alone.

One adjacent lifecycle invariant is not yet covered: the coordinator sets
`trimmed=true` after its first L2, but does not clear it when that context is
reacquired and rebuilds a Program. A separate, benchmark-guarded LSP
transcript on the small repository fixture performed three successful
one-location references queries with two intervening L2 controls. Both
controls acknowledged `applied: level2`, but the registry probe recorded
only one `before-trim`/`after-trim` pair (129→0 references). This confirms
the second L2 skipped the rebuilt Program in that fixture; it is not yet a
Settings memory result or an exact-set regression test. The next public
regression should exercise
`L2 → exact query → L2` and distinguish that case from two consecutive L2
controls without an intervening query. Re-arming L2 must not be promoted on
a tiny fixture alone: under persistent high RSS it could trade retained
state for repeated 21–24 s cold rebuilds, so the fixed Settings workload
and full response/RSS curves remain its admission gate.
