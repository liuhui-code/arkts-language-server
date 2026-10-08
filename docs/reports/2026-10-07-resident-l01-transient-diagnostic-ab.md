# L01 L3 transient diagnosis: fixed Settings A/B

Date: 2026-10-07. Decision: **experimental route remains default-off; L01
resource admission BLOCKED; L02 not admitted**. The small real-child-process LSP
test was RED before the change and GREEN afterward: under active L3, the latest
unsaved-overlay diagnostic was published without creating a second resident
context. See [the TDD record](../tdd/l01-transient-diagnostic-experiment.md).
That proves the mechanism on the test fixture, not a real-project memory win.

## Fixed input and replay

Both A/B pairs used clean `applications_settings` commit
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, its unmodified project
boundary, the API24 compatibility SDK at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony` (declaration
digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`),
Node `v26.3.0`, `ohos-typescript@4.9.5-r10`, server HEAD
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`, server input SHA-256
`3cf72c1830379fe5cd807578c10642a7ed1aa3b7f366ed1c8d62d8a828d8c4ba`,
server bundle SHA-256
`26fa509aabf9265aa9e2c376ef5c3672d58b57e2b82307a05d350a96f1eb7520`,
semantic worker SHA-256
`578142a114eb353ec649d796dc0cf9a02713345b50bf1ced845832a5a8d33c20`,
and diagnostic verifier worker SHA-256
`83616118ab305d7e4e1182e333e86100a17ae5a9c7171a4ca35bb17c7bd285a7`.
All four valid reports record `inputUnchanged=true`. Within each pair the runtime
environment changed only `ARKTS_L01_TRANSIENT_DIAGNOSTICS=0|1`; the ON manifests
also pin the diagnostic Worker bundle used by that route. Both sides set
`ARKTS_BENCHMARK_CONTROL=1`, kept normal automatic diagnostics, and ran
`ARKTS_REFERENCES_STRATEGY=legacy`. The transient path is unavailable without
both experiment switches.

The ignored local manifests and raw reports permit replay with the **same
pinned build**; rebuilding requires a newly pinned manifest. For example:

```bash
node scripts/bench/replay-references.mjs --prepared-suite .bench/l01-soak/settings-diagnostic-transient-off-20.json --out .bench/l01-soak/settings-diagnostic-transient-off-20-replay.json
node scripts/bench/replay-references.mjs --prepared-suite .bench/l01-soak/settings-diagnostic-transient-on-20.json --out .bench/l01-soak/settings-diagnostic-transient-on-20-replay.json
node scripts/bench/replay-references.mjs --prepared-suite .bench/l01-soak/settings-diagnostic-artificial-l3-off-2.json --out .bench/l01-soak/settings-diagnostic-artificial-l3-off-2-replay.json
node scripts/bench/replay-references.mjs --prepared-suite .bench/l01-soak/settings-diagnostic-artificial-l3-on-2.json --out .bench/l01-soak/settings-diagnostic-artificial-l3-on-2-replay.json
```

The first pair uses the existing 1,024 MiB **soft** budget and 20 alternating
unsaved reference edits. The second uses one predeclared 512 MiB **soft** budget
and two edits solely to force an active-L3 diagnostic in the same real project.
Neither budget is a process RSS limit. macOS external process sampling was
requested at 50 ms; its observed samples are lower bounds for peak RSS, not
PSS or a release-memory result. The initial sandboxed OFF attempt failed before
any request with sampler `spawn EPERM` and is excluded; the successful OFF
replay used the required external-sampler permission.

## Results

| 1,024 MiB natural-pressure pair | OFF | ON |
| --- | ---: | ---: |
| Complete exact references | 22/22 | 22/22 |
| Versioned automatic diagnostics | PASS; v1, v1, v21 | PASS; v1, v1, v21 |
| Diagnostic code arrays | `[2307]`, `[]`, `[]` | identical |
| Automatic L3 resident evictions | 6 | 4 |
| `diagnostics.transient.start/complete` | 0/0 | **0/0** |
| Peak Node PID RSS | 2,108,678,144 B | 1,799,352,320 B |
| Peak product-tree RSS | 2,111,922,176 B | 1,854,414,848 B |
| Product-tree RSS after 30 s idle | 907,821,056 B | 925,777,920 B |

The experimental route did **not** execute in the natural-pressure pair;
therefore the lower ON peak cannot be attributed to transient diagnosis. The
final compiler diagnostic event was measured at L2 in OFF and L1 in ON. The
two reports are [OFF](../../.bench/l01-soak/settings-diagnostic-transient-off-20-report-escalated.json)
and [ON](../../.bench/l01-soak/settings-diagnostic-transient-on-20-report-escalated.json).

| 512 MiB artificial-L3 mechanism pair | OFF | ON |
| --- | ---: | ---: |
| Complete exact references and normalized Location sets | 4/4 | 4/4, equal to OFF |
| Automatic diagnostics | v1, v1, v3; `[2307]`, `[]`, `[]` | full payload equal to OFF |
| Resident `diagnostics.program.complete` at L3 | 3 | 0 |
| `diagnostics.transient.start/complete` at L3 | 0/0 | **3/3** |
| Resident context creates / L3 evictions | 7/7 | 4/4 |
| Request durations, scenario order | 33.085, 25.109, 24.945, 24.812 s | 33.443, 24.481, 24.528, 23.570 s |
| Peak Node PID RSS | 1,801,211,904 B | **2,164,625,408 B (+20.2%)** |
| Peak product-tree RSS | 1,848,041,472 B | **2,213,429,248 B (+19.8%)** |
| Product-tree RSS after 10 s idle | 1,539,633,152 B | **2,046,087,168 B** |

All three ON transient starts and completions recorded `memoryLevel=level3`,
with no persistent resident creation between each start and completion. The ON
Node RSS peak at `2026-10-07T12:34:35.915Z` fell **inside** the third transient
diagnosis (v3, `12:34:26.957Z`–`12:34:36.696Z`), after the final references
response. OFF peaked during the last references request, before v3 diagnosis
completed. The temporal evidence supports a transient-diagnosis peak
contribution in this run; it does not prove a retained-object leak or explain
the post-idle difference. The two raw reports are
[OFF](../../.bench/l01-soak/settings-diagnostic-artificial-l3-off-2-report.json)
and [ON](../../.bench/l01-soak/settings-diagnostic-artificial-l3-on-2-report.json).

Both pairs' top-level prepared-suite status remains `FAIL` solely due to
`READINESS_UNSUPPORTED`, separate from the passed executed reference and
diagnostic checks. This is one process per A/B arm, not a repeated statistical
release benchmark. The 512 MiB pair is an artificial mechanism test, not a
product-budget measurement; nonetheless, its **memory no-regression check
fails**. Fewer resident context creations did not lower the total Node-process
peak. Do not promote this worker route or raise the budget to conceal the
result. Keep normal diagnostics and the production default unchanged. Further
L01 work must account for *combined* resident and transient compiler state,
and needs independent PSS/post-GC attribution before any leak diagnosis.
